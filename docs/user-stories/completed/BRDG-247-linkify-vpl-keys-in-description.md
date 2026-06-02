# BRDG-247: Turn VPL ticket references in descriptions into pills

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want a `VPL-` ticket key written as plain text in a ticket description to render as an interactive ticket pill, so that I can recognise the referenced Valk Platform ticket at a glance, see its key info on hover, and jump straight to it in Bridge instead of copying the key around.

Descriptions regularly mention other Valk Platform tickets (e.g. "depends on VPL-43237", "see VPL-41002"). Today those are dead plain text. They should become a `TicketStatusPill` that links to `/tickets/VPL-43237`.

**Critical constraint:** only **bare plain-text** keys get converted. A `VPL-` key that is already part of a link, inside a code block, inside inline code, or inside any other formatted element must be left exactly as-is. A key written as plain text **inside an expandable** section *should* still be converted (expandable bodies are plain text, just collapsed).

## Context

- **Descriptions are rendered by a custom markdown parser**, not react-markdown: `src/components/ticket-detail/renderMarkdown.tsx`. Raw Jira ADF is converted to a markdown string at sync time (`src/lib/adf-to-markdown.ts`), stored in the DB, and rendered via `renderMarkdown()` inside `EditableDescription.tsx`.
- **Inline text formatting** happens in `inlineFormat(text)` (`renderMarkdown.tsx:60-168`). It walks a single combined regex over the text and emits: colored text, images, links `[text](url)`, strikethrough, bold/italic, **inline code** `` `text` ``, and emoji. Anything between matches is pushed as a raw plain-text slice (`renderMarkdown.tsx:81` and `:165`). Those raw slices are exactly the "plain text" we want to linkify.
  - **Links are safe by construction:** the visible label of a link (`match[5]`) is pushed as a raw string and is *not* re-run through `inlineFormat`, so a `VPL-` key inside link text won't be touched as long as we only linkify the inter-match plain slices (not the link label).
  - **Inline code is safe:** `` `VPL-1` `` is captured by the code group and rendered as `<code>` without recursing, so it won't be linkified.
- **Code blocks** (fenced ``` ``` ```) are handled at the block level (`renderMarkdown.tsx:252-288`) and never reach `inlineFormat`, so they are safe.
- **Expandable sections** (`:::expand Title`) render their body by recursively calling `renderMarkdown()` (`renderMarkdown.tsx:384-434`), which routes plain text back through `inlineFormat`. So linkifying the plain slices automatically covers "plain text inside an expandable" with no extra work.
- **The pill component already exists:** `TicketStatusPill` (`src/components/shared/TicketStatusPill.tsx`).
  - It links to `/tickets/${ticketKey}` and renders an issue-type icon, the key, a status badge, and a readiness indicator.
  - Readiness is **always shown today** (`showReadiness = true`, hardcoded at `TicketStatusPill.tsx:688`). This story needs a pill **without** readiness, so a `showReadiness?: boolean` prop must be added (default `true`) and set to `false` here.
  - Status / issue-type editing is **opt-in** via the `onJiraStatusChange` / `onIssueTypeChange` callbacks. Omitting them (the default) already makes the pill read-only — which is what we want.
  - The hover card is driven by `hoverData?: TicketPillHoverData` (`TicketStatusPill.tsx:338-352`). No `hoverData` = no card. We must supply it to satisfy "show the hover with info".
- **Hover data sourcing:** a single-ticket lookup exists: `GET /api/tickets/[key]` (`src/app/api/tickets/[key]/route.ts`). Per the decision below, the page renders the pills **first** and fetches the hover-card content **lazily** (only when needed), so the description never waits on ticket lookups to paint.
- **`renderMarkdown` is a plain function, not a component.** A pill needs a hook and lives inside a client tree, so the linkified key should be emitted as a small dedicated client component (e.g. `<TicketRefPill ticketKey="VPL-43237" />`) that lazily resolves its own hover data and renders `TicketStatusPill`. That keeps `renderMarkdown` pure.
- **Project key is server-only today.** `JIRA_PROJECT_KEY` is validated in `src/lib/env.ts` (default `"VPL"`) but has **no `NEXT_PUBLIC_` variant**, so it is not readable in the client `renderMarkdown.tsx`. It must be surfaced client-side — mirror the existing `NEXT_PUBLIC_JIRA_BASE_URL` pattern by adding `NEXT_PUBLIC_JIRA_PROJECT_KEY` (same value), so the detection pattern is driven by config, not a hardcoded `"VPL"`.

## Implementation Plan

1. **Expose project key client-side.** `src/lib/env.ts` is `server-only`; client code reads `NEXT_PUBLIC_*` via `process.env` (pattern: `src/lib/jira-url.ts`). Add `NEXT_PUBLIC_JIRA_PROJECT_KEY` to the `env.ts` zod schema + `.env.example` (+ `env.test.ts`), and read `process.env.NEXT_PUBLIC_JIRA_PROJECT_KEY ?? "VPL"` in the parser.
2. **`showReadiness` prop on `TicketStatusPill`.** Add `showReadiness?: boolean` (default `true`); delete the hardcoded `const showReadiness = true`. Existing `showReadiness &&` guards in both the `list` and default render paths then suppress readiness when `false`.
3. **`TicketRefPill` wrapper** (`src/components/shared/TicketRefPill.tsx`, `"use client"`). Renders read-only `TicketStatusPill` (no change callbacks) with `showReadiness={false}`. Lazy hover data: `useSWR(hovered ? tickets.detailUrl(key) : null, swrFetcher)` mapped via `buildTicketHoverData(ticket, {})`. Renders the key/link immediately (non-blocking); on 404/error renders without a hover card. Do NOT use `useTicketDetail` (fires a Jira sync) or `useTicketHoverData` (loads whole list).
4. **Linkify in `inlineFormat`.** Post-process the raw plain-text slices (the two `text.slice(...)` push sites), NOT the combined regex (avoids shifting hardcoded capture-group indices). Helper `linkifyTicketRefs(text)` splits on `\b<KEY>-\d+\b` and emits `<TicketRefPill>` for matches.
   - **Recursion guard (decision):** thread `inlineFormat(text, linkify = true)`; recursive emphasis calls (bold/italic/strikethrough/color) pass `linkify = false`. So keys inside `**...**` / `*...*` / `{color}` stay plain — satisfies "inside any other formatted element must be left as-is". Links + inline code already don't recurse, so they're protected for free; code blocks never reach `inlineFormat`.
   - **Scope guard (decision):** thread a `linkifyRefs` option through `renderMarkdown` (default `false`); only the description render path (`EditableDescription`) opts in. Keeps chat/comments untouched (out of scope).
5. **Tests** (`renderMarkdown.test.tsx`): bare key → pill/link; key in link / inline code / fenced block → NOT converted; key in `:::expand` body → converted; key in bold → NOT converted; word-boundary cases. Plus `TicketRefPill.test.tsx` (renders before load, resolves on hover, 404 fallback) and `TicketStatusPill.test.tsx` readiness toggle.
6. **Verify** (`npm run verify` + `build`) and **docs**.

Order: 1 + 2 independent first; 3 depends on 2; 4 depends on 1 + 3; tests follow each.

## Requirements

### 1. Detect bare project-key references in plain description text

- In `inlineFormat`, detect keys matching the `<JIRA_PROJECT_KEY>-\d+` pattern that appear in the **plain-text portions only** (the inter-match slices), and replace each with a ticket-reference pill.
- The prefix comes from config (`NEXT_PUBLIC_JIRA_PROJECT_KEY`, default `VPL`), **not** a hardcoded `"VPL"`. Build the regex from the configured prefix so a different project key keeps working.
- Match only on a sensible word boundary so partial matches inside larger tokens are not picked up (e.g. don't turn `XVPL-1` or `VPL-1abc`/`VPL-12345-foo` fragments into half-pills).
- Must **not** convert keys that are:
  - inside a markdown link (`[VPL-1](...)` or `[text](.../VPL-1)`),
  - inside inline code `` `VPL-1` ``,
  - inside a fenced code block,
  - inside any other already-formatted element.
- Must **still** convert keys that are plain text inside an expandable (`:::expand`) body.

### 2. Render the key as a read-only ticket pill

- Render a `TicketStatusPill` (via a small wrapper component) for each detected key:
  - **No readiness indicator** — add and use a new `showReadiness={false}` prop on `TicketStatusPill` (default stays `true` everywhere else).
  - **No status / issue-type editing** — do not pass the `onJiraStatusChange` / `onIssueTypeChange` callbacks (read-only by default).
  - **Links to `/tickets/<KEY>`** — the pill's default `/tickets/${ticketKey}` target already does this.
  - **Hover card with info** — supply `hoverData` so the hover card shows title, points/BV, sprint, epic, assignee, etc.
  - **Same interaction behaviour as the pill everywhere else** — keep the standard `TicketStatusPill` click/keyboard behaviour. Do not invent a description-specific click handler.
- The pill should sit inline within the surrounding sentence (it must not break the text flow / line wrapping awkwardly).

### 3. Supply hover data lazily, after the page renders

- **Render the pills first.** The description must paint immediately with the key + link, without blocking on any ticket lookup.
- **Then resolve `TicketPillHoverData` lazily** per referenced key (via `GET /api/tickets/[key]`), so the hover card fills in once the data arrives. Avoid firing a request per pill up front if it harms render; resolving on first hover is acceptable as long as the pill itself is interactive immediately.
- Gracefully handle a key that cannot be resolved (unknown / not-synced ticket): still render a pill that links to `/tickets/<KEY>`, just without a hover card. It must never crash or render a broken/empty card.

## Decisions (resolved with PO)

- **Render order:** page renders first, hover-card content is fetched afterwards (lazily). Not blocking.
- **Click behaviour:** identical to the pill in all other places — no description-specific override.
- **Scope of the pattern:** only the configured project key, sourced from `JIRA_PROJECT_KEY` (exposed client-side as `NEXT_PUBLIC_JIRA_PROJECT_KEY`, default `VPL`). Not hardcoded.
- **Other surfaces (chat / comments):** out of scope — a separate follow-up story.

## Out of scope

- Changing status / issue type / readiness from the pill (explicitly not wanted).
- Auto-linkifying keys inside code blocks, inline code, or existing links.
- Generalising to arbitrary project-key prefixes beyond the configured `JIRA_PROJECT_KEY`.
- Linkifying keys in chat and comments (separate follow-up story).
- Changing how descriptions are stored or synced (ADF→markdown pipeline is untouched).

## Checklist

- [x] Expose the project key client-side: add `NEXT_PUBLIC_JIRA_PROJECT_KEY` (mirror `JIRA_PROJECT_KEY`) in `env.ts` + `.env.example`
- [x] Add `showReadiness?: boolean` prop to `TicketStatusPill` (default `true`); render readiness only when true + test
- [x] Add a `TicketRefPill` wrapper: read-only `TicketStatusPill` with `showReadiness={false}`, lazy hover-data fetch via `GET /api/tickets/[key]`, graceful fallback when unresolved + test
- [x] Detect `<projectKey>-\d+` (from config) in `inlineFormat` plain-text slices only, with correct word boundaries
- [x] Verify keys in links / inline code / fenced code blocks are NOT converted (tests for each)
- [x] Verify a plain-text key inside an `:::expand` body IS converted (test)
- [x] Confirm pills render before hover data loads (non-blocking) and the pill keeps standard click behaviour
- [x] Confirm the pill links to `/tickets/<KEY>` and the hover card shows ticket info
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass <!-- lint/typecheck/build clean; full suite: 3714 pass, 1 pre-existing flaky failure unrelated to this story (activity-log/compute-stats ordering — passes in isolation, see docs/investigations) -->
- [x] Update relevant docs in `/docs` (note the linkify behaviour where description rendering is documented)
