# BRDG-375: Close XSS and injection vectors at system boundaries

**Status:** Done
**Priority:** High
**Type:** Security — hardening across renderer, Jira/Confluence clients, search

## Description

The codebase audit ([2026-06-22-codebase-audit.md](../investigations/2026-06-22-codebase-audit.md))
found a cluster of injection/XSS sinks where externally-controlled data (Jira-synced content,
search terms, ticket/epic keys) reaches a sensitive sink without escaping or validation. The app
is single-user behind Clerk auth, so blast radius is bounded — but these are genuine defects: a
Jira ticket edited by anyone on the team, a search term containing a quote, or a malformed key all
trip them. This story closes them together because they share helpers and a single test surface.

The headline item is a **stored XSS**: markdown links in Jira-synced descriptions/comments are
rendered as `<a href={...}>` with no URL-scheme check, so a `[click](javascript:...)` link runs
script in the PO's Bridge session when clicked.

## Current Behaviour

- **Markdown link XSS.** [renderMarkdown.tsx:202-212,242-249](../../src/components/ticket-detail/renderMarkdown.tsx)
  emits `<a href={match[...]} target="_blank">` directly; React does not sanitize `href`.
  [markdown-to-adf.ts:573-582](../../src/lib/markdown-to-adf.ts) stores the raw href into the ADF
  link mark too, so an unsafe URL can also round-trip back into Jira. There is **no `safeHref`
  helper anywhere in `src/lib`** (verified by grep). The rendered content includes externally
  controlled Jira descriptions/comments (`EditableDescription`, `CommentsSection`, `VersionPreview`).
- **JQL injection.** [search/jira/route.ts:22-52](../../src/app/api/search/jira/route.ts) sends a
  raw `jql` override verbatim (length-capped at 1000 only) and interpolates `issuetype` with
  quote-wrap only. The free-text `text ~ "..."` path (line 50) and
  [tickets/search/route.ts:142](../../src/app/api/tickets/search/route.ts) escape `"` but **not**
  `\`, so a trailing backslash escapes the literal.
- **Unencoded Jira key.** [jira-client.ts](../../src/lib/jira-client.ts) builds `/rest/api/3/issue/${key}...`
  in ~13 methods (lines 735, 749, 770, 809, 830, 971, 995, 1013, 1025, 1342, 1378, 1400, 1623,
  1671) with no `encodeURIComponent`. [check-updated/route.ts:37](../../src/app/api/jira/check-updated/route.ts)
  passes the raw `key` query param straight in with zero format validation. A key with `/ ? # &`
  injects path/query segments into the authenticated Jira request.
- **Epic-key JQL.** [jira-client.ts:889](../../src/lib/jira-client.ts) (`getEpicIssueTimestamps`)
  builds `parent = ${epicKey}` from an unvalidated query param (`resolveGroupTarget`).
- **CQL injection.** [confluence-client.ts:138-152](../../src/lib/confluence-client.ts) builds
  `title~"${query}"` / `space="${space}"` without escaping `"`/`\`, reachable from
  [confluence/search/route.ts:54-56](../../src/app/api/confluence/search/route.ts) (the dedicated
  `mode=cql` raw passthrough is intentional and length-capped — leave it).
- **Sanitizer gaps.** [sanitize-html-config.ts:5-20](../../src/lib/sanitize-html-config.ts) allows
  `target` without forcing `rel="noopener noreferrer"` (reverse tabnabbing) and does not constrain
  `img` `src` schemes (DOMPurify permits `data:` by default). The core `javascript:` href is
  already blocked by DOMPurify defaults (confirmed by `sanitize.test.ts:21-24`); these are the
  remaining gaps in the defense-in-depth layer.
- **LIKE wildcards.** [tickets/search/route.ts:76](../../src/app/api/tickets/search/route.ts) uses
  `%${q}%` as a bound value (no SQL injection) but does not escape `%`/`_`; the shared
  `escapeLikePattern` helper exists and is unused here.

## Proposed Approach

1. **`safeHref` helper (new, `src/lib/safe-href.ts`).** Allowlist `http:`, `https:`, `mailto:`,
   and relative URLs; reject `javascript:`/`data:`/`vbscript:` (trim + strip control chars +
   resolve protocol-relative first). Used in `renderMarkdown.tsx` (drop the anchor, keep the label
   as plain text when unsafe) and in the `markdown-to-adf` link rule before storing the mark.
2. **JQL escaping.** Shared `escapeJql(value)` / `escapeCql(value)` (escape `\` then `"`) in
   `src/lib/jql.ts`, applied to the `text ~`, `issuetype =`, and `parent =` clauses. `issuetype`
   validated against the known issue-type set; `epicKey`/`key` validated against
   `/^[A-Z][A-Z0-9]+-\d+$/i`.
3. **Jira-key encoding.** One `issuePath(key, suffix)` helper in `jira-client.ts` that asserts the
   key pattern + `encodeURIComponent`s it, used by all ~13 `/issue/${key}` paths so every current
   and future caller is protected. Key-shape validation added in `check-updated` (400 on malformed).
4. **CQL escaping.** Escape `"`/`\` in `query`/`space` in `confluence-client.ts` title/text modes;
   the raw `searchByCql` (`mode=cql`) passthrough is left unchanged.
5. **Sanitizer hardening.** `afterSanitizeAttributes` hook forces `rel="noopener noreferrer"` on any
   `target` link and strips `data:` image `src`.
6. **LIKE escaping.** Wrap the local-search pattern with the existing `escapeLikePattern` and add an
   `ESCAPE '\'` clause so `%`/`_`/`\` match literally.

No user-facing behaviour change beyond rejecting hostile input; legitimate links, searches, and
keys behave identically.

## Acceptance Criteria

- [x] A markdown/ADF link with a `javascript:`/`data:`/`vbscript:` scheme is not rendered as a
      live, script-executing anchor (neutralized or dropped), in both the renderer and on push to Jira.
- [x] Search terms, `issuetype`, epic keys, and ticket keys containing `"`, `\`, or JQL/CQL
      operators cannot alter the query structure sent to Jira/Confluence.
- [x] Ticket keys are URL-encoded (or pattern-validated) before interpolation into every Jira API
      path; `check-updated` rejects malformed keys.
- [x] Sanitized HTML forces `rel="noopener noreferrer"` on `target="_blank"` links and rejects
      `data:` image URIs.
- [x] Local ticket search treats `%`/`_` in the query as literals.
- [x] No regression for legitimate links, searches, and keys (existing search/render tests pass).

## Tests

- [x] `safe-href.test.ts`: allows http/https/mailto/relative; rejects `javascript:`/`data:`/
      `vbscript:` and protocol-relative tricks; renderer + markdown-to-adf use it.
- [x] `jql.test.ts` (`escapeJql`/`escapeCql`) unit tests with quote, backslash, and operator payloads.
- [x] `jira-client` `issuePath` tests assert keys are encoded/validated; `check-updated` rejects a
      malformed key (400).
- [x] Confluence title/text search escapes `"`/`\`; raw `mode=cql` still passes through unchanged.
- [x] Sanitizer test: `target` link gains `rel`; a `data:` `img` is stripped.
- [x] Local search test: a query containing `%`/`_` matches them literally.

## Open Questions — Resolved

- **Raw `jql` override.** RESOLVED: **kept** (cap only). The override powers the intentional "JQL
  override" advanced-search box in `SearchModal.tsx`; only the trusted single operator can type into
  it (self-directed risk against their own Jira). Behaviour is unchanged: the 1000-char cap stays
  and the override is passed verbatim. Hardening was focused on the structured `text ~` / `issuetype`
  / `parent` paths that untrusted Jira content and the UI's own params reach.
- **safeHref on neutralize.** RESOLVED: **render the visible label as plain text** and drop the
  anchor (least surprising). Applied in both the renderer and the markdown-to-adf link rule.

## Related

- [[2026-06-22-codebase-audit]] — source audit (Security section).
- Touch points: `renderMarkdown.tsx`, `markdown-to-adf.ts`, `jira-client.ts`, `confluence-client.ts`,
  `sanitize-html-config.ts`, `sanitize.ts`, `sanitize-client.ts`, `safe-href.ts` (new), `jql.ts` (new),
  `search/jira` + `tickets/search` + `check-updated` routes.
