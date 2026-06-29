# BRDG-435: Investigate in Story Writer chat and post the result as a Jira comment

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

In the Story Writer chat (e.g. `/tickets/VPL-47041/write`) the PO wants to ask the AI to **do an investigation** about a ticket (research the codebase and/or the ticket context) and then **post the result as a Jira comment** — without leaving the chat.

The result must surface as an **acceptable chat suggestion** in Bridge, exactly like the existing **Title Suggestions** card: the AI returns a structured block, Bridge renders it as a suggestion card in the thread, and the PO accepts it with a button. Because posting writes to Jira (an external action), the PO must be able to **edit the text before posting**.

Decisions confirmed with the PO:
- **Trigger:** both a dedicated **"Investigate"** quick-prompt button (alongside "Technical analysis") *and* free-form chat requests work.
- **Post control:** the suggestion card shows the full investigation result in an **editable field**; the PO can edit, then click **"Post as comment"**.
- **Scope of the accept action:** "post as comment" is scoped to investigation results only (a dedicated suggestion type), not a generic "post any chat message" action. Mirrors how Title Suggestions are a dedicated card.
- **Rich formatting (ADF):** the posted comment must preserve markdown formatting (headings, bullet lists, code blocks) by converting markdown -> ADF, so the comment is as rich as a story description. This is **in scope for this story**, not a follow-up. A Jira comment body uses the same ADF document model as a description, so there is no inherent loss of richness.

## Current Behaviour

The plumbing for both halves already exists separately; they are just not connected.

**Investigation/research is already possible, but only as plain text.**
- The Story Writer chat sends messages via `POST /api/tickets/[key]/story-writer/messages` (`src/app/api/tickets/[key]/story-writer/messages/route.ts`), which calls `sendStoryWriterMessage` (`src/lib/story-writer-messages.ts`).
- There is a `codebaseResearch` flag (route line ~38) injected into the workspace prompt as `[codebase-research: on|off]` (`src/lib/story-writer-messages.ts`, e.g. lines ~379/411/505). It is a *hint* to the `write-story-draft` skill, not a separate investigation step.
- A quick prompt **"Technical analysis"** already exists with `enableCodebase: true` (`src/app/api/settings/quick-prompts/route.ts`, id `d-story-2`). The AI researches and answers, but the answer comes back as **ordinary chat text** — there is no way to turn it into a Jira comment.

**The suggestion-card pattern (the template to copy).**
- The AI wraps structured output in an XML tag; `ChatMessageParts.tsx` parses it **on the fly from the message content** (no DB table needed). For titles the tag is `<title-suggestions>` (parser at `src/components/story-writer/ChatMessageParts.tsx:366-374`).
- Recognised tags today: `<title-suggestions>`, `<type-suggestion>`, `<link-suggestion(s)>`, `<epic-suggestion>`, `<related-stories>`, `<story-draft>`. Unrecognised tags are stripped and never rendered.
- Rendering uses the shared `SuggestionCard` shell (`src/components/story-writer/SuggestionCard.tsx`) + a type-specific component, e.g. `TitleSuggestionChips.tsx` (numbered list + per-row "Use" button).
- The accept handler flows down as a callback: `onApplyTitle` is threaded `ChatMessageParts` -> `StoryWriterChat` -> `ChatApp` -> `useStoryWriterActions.ts` (`handleTitleChange`, ~line 241).

**Posting a Jira comment already fully works.**
- `POST /api/tickets/[key]/jira-comments` (`src/app/api/tickets/[key]/jira-comments/route.ts`) validates content (non-empty, max **10000 chars**, `sanitizeText`), calls `jiraClient.addComment(key, content)`, stores the comment in the local `jiraComment` table, invalidates the ticket cache, and emits a `ticket:changed` (`kinds: ["comment"]`) event so other open views pick it up live.
- **Formatting caveat (the thing this story fixes):** `jiraClient.addComment` (`src/lib/jira-client.ts:860-881`) currently converts the text to ADF by splitting on blank lines into **plain paragraphs only**, so markdown is flattened. A full markdown -> ADF converter already exists and is used for story descriptions: `markdownToAdf()` (`src/lib/markdown-to-adf.ts`), used in `src/services/ticket-service.ts` and epic creation. Reusing it for comments removes the limitation.

**Why "investigate and post a comment" does nothing today.**
1. No investigation skill/flow is wired to *produce* a postable result — `write-story-draft` is scoped to story drafts and the existing suggestion tags.
2. No `<investigation>`-style tag is recognised by `ChatMessageParts.tsx`, so even if the AI returned one it would be stripped, not rendered as a suggestion.
3. There is therefore no accept path from a chat result to `POST /api/tickets/[key]/jira-comments`.

## Proposed Approach

Reuse the existing suggestion pattern end-to-end; only the comment-posting accept action and the investigation framing are new.

1. **Investigation prompt + trigger.**
   - Add a default quick prompt **"Investigate"** (`enableCodebase: true`) in `DEFAULT_PROMPTS` (`src/app/api/settings/quick-prompts/route.ts`), worded to (a) research the ticket and relevant codebase and (b) return the result wrapped in an `<investigation>` block intended to be posted as a Jira comment.
   - Free-form requests work via the same path: the skill prompt for `write-story-draft` is extended so that when the PO asks for an investigation, the AI emits the `<investigation>` block (reuse the `codebaseResearch` flag already in `sendStoryWriterMessage`).

2. **New recognised tag + parser.** Add an `<investigation>...</investigation>` parser to `ChatMessageParts.tsx` (alongside the title parser, ~line 366) and add the tag to the strip list so the raw block is not also shown as plain text. Parse on the fly from message content — **no new DB table** (matches Title Suggestions).

3. **Suggestion card with editable body.** New `InvestigationSuggestionCard.tsx` in `src/components/story-writer/`, built on the shared `SuggestionCard` shell. It shows the investigation result in an **editable textarea** (pre-filled with the AI text), an "Edit" affordance, and a **"Post as comment"** button. Disabled/empty-guarded when the text is blank.

4. **Accept = post comment.** Wire an `onPostComment` callback down the same chain as `onApplyTitle` (`ChatMessageParts` -> `StoryWriterChat` -> `ChatApp` -> `useStoryWriterActions`). The handler `POST`s the (edited) text to `/api/tickets/[key]/jira-comments`, then refreshes the ticket so the new comment appears. On success the card shows a posted/applied state (mirror `TitleSuggestionChips`' applied badge); on failure it surfaces an inline error and stays editable for retry.

5. **Rich formatting (ADF).** Upgrade `jiraClient.addComment` (`src/lib/jira-client.ts`) to convert the body with the existing `markdownToAdf()` (`src/lib/markdown-to-adf.ts`) instead of the plain-paragraph split, so headings/lists/code render in Jira like a story description. Keep a plain-paragraph fallback only if `markdownToAdf` throws on malformed input.

6. **Long-result handling.** The comment route caps content at 10000 chars. The card must show a character count / guard so the PO knows before posting; if exceeded, block posting with a clear message rather than letting the 400 bubble up. (Jira's own comment limit is higher, ~32767; the 10000 cap is Bridge's own and is kept as-is in this story.)

**Non-goals / out of scope:**
- A generic "post any chat message as a comment" action (scoped to investigation results only).
- Persisting investigation results in their own DB table (parsed on the fly like title suggestions).
- Posting to anything other than a Jira comment (no description merge, no draft).
- Raising the 10000-char comment cap (kept as-is; see point 6).
- Changing the workspace/agent's investigation capability beyond prompt/skill wiring; this story assumes the existing `write-story-draft` skill with the codebase-research flag can produce the report.

## Open Questions

- **What the investigation is allowed to read.** The `codebaseResearch` flag lets the AI read the codebase; ticket context (description, AC, comments, links) is already passed to `write-story-draft`. *Recommended default:* reuse exactly the context `write-story-draft` already receives plus codebase research on — no new data sources (e.g. Confluence) in this story.

## Implementation Plan

Order is by isolation: ADF first (independent), then parser, card, threading, finally the quick prompt + free-form wiring.

1. **ADF formatting (AC6).** Swap the manual paragraph-split in `jiraClient.addComment` (`src/lib/jira-client.ts:860`) for `markdownToAdf(bodyText)` (`src/lib/markdown-to-adf.ts:48`, already returns a `{type:"doc",version:1}` root), with a plain-paragraph fallback if it throws. `addFlagComment` untouched. Test: extend `src/lib/jira-client.test.ts` (mock `global.fetch`) to assert heading/bulletList/codeBlock nodes.
2. **Parser + strip (AC2 render-side, AC3).** Add `parseInvestigation` / `stripInvestigationTags` to `ChatMessageParts.tsx` (mirror `parseEpicSuggestions`/`stripEpicSuggestionTags`), add the tag to the `baseContent` strip chain, parse `investigationResult` from the original `message.content`. Test in `ChatMessageParts.test.tsx`.
3. **Card (AC3, AC4, AC5, AC7, AC8).** New `InvestigationSuggestionCard.tsx` on the shared `SuggestionCard` shell: editable textarea (init from `result`), live char counter, guard at `JIRA_COMMENT_LIMIT` (new export in `src/lib/jira-content-limits.ts`, value 10000), "Post as comment" button with posting/posted/error state machine (model on `CommentsSection.tsx:191`). Test: new `InvestigationSuggestionCard.test.tsx`.
4. **Thread the post handler (AC5, AC8).** Add `onPostInvestigation?: (text) => Promise<void>` prop drilled `ChatApp` -> `StoryWriterChat` -> `ChatMessage`, exactly like `onApplyTitle`. `ChatApp` builds the handler from `tickets.addJiraComment(writer.ticketKey, { content })` (`src/lib/api-client.ts:212`) + `writer.mutateTicket()`. Test in `ChatApp.test.tsx`.
5. **Quick prompt + free-form (AC1, AC2).** Add an "Investigate" entry (`enableCodebase: true`) to `DEFAULT_PROMPTS` (`quick-prompts/route.ts`) whose text instructs wrapping the report in `<investigation>...</investigation>` — this fully delivers AC1 + the button path of AC2 in-repo (instruction travels in the message text). Append an investigation tag-contract sentence to `story-writer-messages.ts` for free-form. Tests: `quick-prompts/route.test.ts` + `story-writer-messages.test.ts`.

**Cross-repo caveat:** free-form reliability (AC2 free-form) depends on the `write-story-draft` skill system prompt on the remote `valk-remote-workspace` (not this repo) honoring the `<investigation>` contract instead of coercing into `<story-draft>`. The button path is fully self-contained; free-form instruction injection is best-effort in-repo and flagged as workspace-dependent.

## Acceptance Criteria

- [ ] An **"Investigate"** quick-prompt button is available in the Story Writer chat for relevant issue types, with codebase research enabled. <!-- DEFAULT_PROMPTS in src/app/api/settings/quick-prompts/route.ts -->
- [ ] Asking for an investigation (button or free-form) makes the AI return an `<investigation>` block. <!-- write-story-draft skill prompt + src/lib/story-writer-messages.ts -->
- [ ] The chat renders the investigation result as a suggestion card (shared `SuggestionCard` shell), not as raw text, and the raw `<investigation>` tag is stripped from the plain message. <!-- src/components/story-writer/ChatMessageParts.tsx + InvestigationSuggestionCard.tsx -->
- [ ] The card shows the result in an **editable** field; edits are preserved when posting. <!-- InvestigationSuggestionCard.tsx -->
- [ ] Clicking **"Post as comment"** posts the (edited) text to `/api/tickets/[key]/jira-comments`; the comment appears on the ticket and the card shows a posted state. <!-- useStoryWriterActions onPostComment + jira-comments route -->
- [x] The posted comment preserves markdown formatting in Jira (headings, bullet lists, code blocks) via `markdownToAdf`, matching a story description's richness. <!-- jiraClient.addComment using markdownToAdf -->
- [ ] Content over 10000 chars is blocked client-side with a clear message before any request is sent. <!-- InvestigationSuggestionCard.tsx guard mirroring route limit -->
- [ ] A failed post surfaces an inline error and leaves the text editable for retry; it does not lose the investigation. <!-- InvestigationSuggestionCard.tsx error state -->

## Tests

- [ ] Parser test: a message containing `<investigation>...</investigation>` yields the investigation result and strips the tag from the displayed text. <!-- ChatMessageParts.test.tsx -->
- [ ] Card test: renders the editable body, edits update the value, the char-count guard blocks > 10000 chars, and "Post as comment" calls `onPostComment` with the current (edited) text. <!-- InvestigationSuggestionCard.test.tsx -->
- [ ] Handler test: `onPostComment` POSTs to `/api/tickets/[key]/jira-comments` and shows posted/error states. <!-- useStoryWriterActions.test.tsx or ChatApp.test.tsx -->
- [x] ADF test: `addComment` converts markdown (heading + list + code) to the expected ADF nodes, not flat paragraphs. <!-- src/lib/jira-client.add-comment.test.ts -->

## Related

- Story Writer architecture: `docs/architecture/story-writer.md` (suggestion display, `SuggestionCard`, chat flow).
- Reuses the Title Suggestions pattern (`TitleSuggestionChips.tsx`, `ChatMessageParts.tsx`) and the existing Jira comment route (`src/app/api/tickets/[key]/jira-comments/route.ts`, `jiraClient.addComment`).
- `codebaseResearch` flag / "Technical analysis" quick prompt (`src/lib/story-writer-messages.ts`, `quick-prompts/route.ts`).
