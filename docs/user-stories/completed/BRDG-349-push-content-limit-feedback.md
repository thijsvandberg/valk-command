# BRDG-349: Surface Jira content-limit failures before and after push

**Status:** Done
**Priority:** Medium
**Type:** Improvement

## Description

As a PO, I want to know *while editing* when a description is growing past Jira's content limit (and by how much), and I want a clear toast telling me *why* a push failed, so that I am never surprised by a silent "Failed to push to Jira" and can fix the content before I even try to push.

Today a push of an oversized description fails with Jira returning `400 CONTENT_LIMIT_EXCEEDED`. The real reason is parsed correctly in the service layer but **never reaches the PO**: the toolbar shows only the generic red text "Failed to push to Jira", and there is no warning at all while editing. The PO is left guessing ("did the remote change? is this a conflict?") when the actual cause is simply that the content is too large.

## Observed today

- Editing a large description (e.g. dozens of repeated expand blocks), the push button stays fully enabled with no warning.
- On push, the toolbar shows `Failed to push to Jira` in red. No toast, no field, no size.
- The activity log *does* record the truth: `Jira 400: description: CONTENT_LIMIT_EXCEEDED` (`activity_log`, type `push-to-jira`, `error_detail`), but the PO never sees it.

## What we want

1. **Live editor warning** - while editing the description, show how close the content is to the Jira limit, and once it exceeds it, show how far *over* (e.g. "1,240 over limit"). This must be visible in the editor toolbar before pushing, not only after a failed push.
2. **Clear failure toast (bottom-right)** - when a push fails, show a toast with the real reason (the parsed Jira detail, e.g. "Description is too large for Jira"), in addition to / instead of the bare "Failed to push to Jira" toolbar text.
3. **Document the real limits** (see below) and align our own client-side guards to them.

## The actual limits (research)

Jira Cloud's documented limits for the fields we push (to be **empirically confirmed during implementation** against our instance, because Jira counts the *rendered ADF content*, not our raw markdown):

| Field | Jira sends as | Jira limit (documented) | Our current guard | Aligned? |
|-------|---------------|--------------------------|-------------------|----------|
| Description | ADF JSON | ~32,767 characters of text content (`CONTENT_LIMIT_EXCEEDED`) | 50,000 chars of markdown (`ticket-service.ts:310`) | **No - our guard is too loose** |
| Title (summary) | plain string | 255 characters | 500 chars (`ticket-service.ts:310`) | **No - our guard is too loose** |
| Comment | ADF JSON | same ~32,767 rich-text limit | 10,000 chars (`jira-comments/route.ts:35`) | Stricter than Jira (OK) |

Key findings:

- **The size that matters is the ADF the server sends, not the markdown the PO types.** `markdownToAdf` (`src/lib/markdown-to-adf.ts`) expands markdown into a JSON document; the character count Jira validates is the text content of that ADF, which does **not** equal `markdown.length`. A live counter based purely on `markdown.length` will be approximate. Implementation must decide whether an approximation (raw length with a safety margin) is good enough for the live warning, or whether to compute the ADF text length.
- **Title and comments are separate fields with their own limits** - they are *not* pooled into the description limit. A title-only push is unaffected by a large description (confirmed: the two title-only pushes succeeded while the description push failed).
- **Our client-side guards are looser than Jira's real limits**, so oversized content passes our validation and only fails at Jira. The 50,000 (description) and 500 (title) guards in `ticket-service.ts:310` should be tightened toward Jira's real ceilings (with a margin), so we reject *before* the round-trip when possible.

## Why the real reason is lost today

`src/hooks/useTicketDetailPage.ts` `handlePushToJira` (~lines 284-325):

- On a Jira error the push API route returns a non-2xx (`502`) with a body `{ error, code, detail }` (`handle-service-error.ts`), where `detail` carries the parsed Jira message (e.g. `Jira 400: description: CONTENT_LIMIT_EXCEEDED`).
- `apiFetch` throws on the non-2xx response, so control jumps straight to the `catch {}` block, which sets the hardcoded `"Failed to push to Jira"` and **discards the thrown error entirely**. The `detail` field is never read.

So the fix is to read the error detail off the thrown `ApiError` (it should carry the response body) and surface it.

## Proposed approach

**Error surfacing (toast + toolbar):**
- In `handlePushToJira`'s `catch`, extract the Jira detail from the thrown `ApiError` (response body `detail`/`error`) and use it for both the `pushError` toolbar text and a failure **toast** (bottom-right, via the shared toast). Map known Jira codes to friendly copy, e.g. `CONTENT_LIMIT_EXCEEDED` -> "This description is too large for Jira. Trim it and try again." Fall back to the raw detail for unknown codes.
- Confirm `ApiError` exposes the parsed body; if not, extend `apiFetch`/`ApiError` to retain it (small, shared change - flag in review).

**Live editor warning:**
- Add a character/size indicator in the description editor toolbar actions (`EditableDescription.tsx`, the `actions` block passed to `RichEditor`, near the existing "Saved · Done" indicator). The current value is available as `value` in the component.
- States: hidden when comfortably under; subtle counter when within ~10% of the limit; red "N over limit" once exceeded. Animate color/opacity only.
- Decide the counting basis (raw markdown length with margin vs. ADF text length) per the research note above. Start with raw length + conservative margin if ADF length is expensive to compute client-side; document the choice.
- Optionally disable / guard the Push button while over the limit, with a tooltip explaining why (decision for the PO - see Open questions).

**Guard alignment:**
- Tighten the `ticket-service.ts:310` guards (title -> 255, description -> ~32,767 with margin) so the server rejects oversized content with a clear `ValidationError` *before* hitting Jira, and the same message flows to the toast.

## Open questions for the PO (confirm before coding)

1. Should the Push button be **blocked** while over the limit, or stay enabled (push fails with the toast)? Recommendation: block + tooltip, since we know it will fail.
2. Live counter: always visible, or only when nearing the limit? Recommendation: only when nearing/over, to keep the toolbar calm.
3. Do we want the same live warning + toast for **comments** and **title**, or description only in this story? Recommendation: description in this story; title (255) is a cheap add; comments can follow.

## Out of scope

- Reducing ADF payload size / smarter serialization to fit more content - this story is feedback, not compression.
- Splitting oversized descriptions across fields or attachments.
- The phantom-edit / round-trip comparison work - BRDG-348/267/268.

## Technical notes

- Push path: `useTicketDetailPage.ts` `handlePushToJira` -> `tickets.pushToJira` -> `POST /api/tickets/[key]/push-to-jira/route.ts` -> `ticket-service.ts` `pushToJira` -> `markdownToAdf` (`src/lib/markdown-to-adf.ts`) -> `jiraClient.updateIssue` (`src/lib/jira-client.ts`, REST v3 `PUT /rest/api/3/issue/{key}`).
- Error parse already done: `ticket-service.ts:210-225` builds `userMessage` from `errorMessages`/`errors`; thrown as `JiraOperationError`; `handle-service-error.ts` returns `{ error, code, detail }` (status 502).
- Existing guards: `ticket-service.ts:310` `const maxLen = field === "title" ? 500 : 50000;`.
- Comment guard: `src/app/api/tickets/[key]/jira-comments/route.ts:35` (max 10,000); comment errors also return a generic message (`route.ts:42-47`) - same surfacing gap if we extend to comments.
- Editor toolbar actions to host the counter: `EditableDescription.tsx` `actions` prop (the block with `pushError`, conflict checkbox, and the `Saved · Done` indicator). `value` holds the current markdown.
- Toast: shared toast component (BRDG-241).

## Related

- BRDG-340 (done) - autosave-first detail editor; the toolbar indicator area this story extends.
- BRDG-241 (done) - shared toast component (reuse for the failure toast).
- BRDG-189 / BRDG-267 / BRDG-268 / BRDG-348 - other Jira push/round-trip content stories (different mechanisms; not blocking).

## Implementation Plan

(Generated by Opus Plan agent, grounded in the actual code. PO decisions applied: Push stays enabled, counter only near/over, description-only scope.)

### Grounding findings
- `ApiError` already retains the parsed body at runtime (`src/lib/api-client.ts`), but its TYPE drops `detail`. Existing code reads it with a cast (`useStoryWriterActions.ts`). Fix: widen the type, no runtime change to `apiFetch`.
- The hook bug: `handlePushToJira` `catch {}` ignores the thrown `ApiError` and hardcodes "Failed to push to Jira". The `detail` is never read.
- Server chain intact: `ticket-service.ts pushToJira` builds `userMessage` -> `JiraOperationError` -> `handle-service-error.ts` returns `{ error, code, detail }` at 502. Note: `code` is `JIRA_OPERATION_ERROR`, NOT `CONTENT_LIMIT_EXCEEDED`; the Jira code lives inside the `detail` string -> mapping must substring-match `detail`.
- Guard is in `src/services/ticket-service.ts` `upsertLocalEdit` (`field === "title" ? 500 : 50000`), fires on autosave.
- Toast: `useToast().showToast(message, durationMs?, opts?)`, renders bottom-right, but always shows a green check (no error variant today).
- Editor toolbar `actions` block in `EditableDescription.tsx` has `value` (current markdown) in scope.

### Counting basis: raw markdown length + margin
markdown.length is a conservative over-estimate of ADF text length (syntax chars drop out of ADF), so it warns early, never late. Computing true ADF length per keystroke is expensive. Use `value.length` vs a shared constant. Document the approximation.

### Steps (in order)
1. New `src/lib/jira-content-limits.ts`: `JIRA_DESCRIPTION_LIMIT=32767`, `JIRA_TITLE_LIMIT=255`, `DESCRIPTION_GUARD_MAX (~30000)`, `NEAR_LIMIT_RATIO=0.9`, and `describeDescriptionSize(len) -> { state: "hidden"|"near"|"over", over }`. Single source of truth for client + server.
2. Widen `ApiError.body` type in `src/lib/api-client.ts` to include `detail?: string`.
3. `useTicketDetailPage.ts handlePushToJira`: `catch (err)`, extract `detail`/`error` from `ApiError.body`, map known content-limit reasons to friendly copy (substring-match `CONTENT_LIMIT_EXCEEDED` / "content exceeds" / "maximum allowed length"), fall back to raw detail then generic. Set `pushError` AND `showToast`.
4. `EditableDescription.tsx`: derive `describeDescriptionSize(value.length)` in render (no state/effect/ref -> React Compiler safe); render nothing when hidden, subtle muted hint when near, red "N over limit" when over; animate color/opacity only.
5. `src/services/ticket-service.ts upsertLocalEdit`: replace 500/50000 with `JIRA_TITLE_LIMIT`/`DESCRIPTION_GUARD_MAX`; PO-friendly `ValidationError` messages.
6. Empirical limit confirmation requires live Jira write access -> not runnable here; document the documented limit + margin in `jira-content-limits.ts` and note manual follow-up.

### Risks / decisions
- Toast has no error variant (always green check). This story calls it a "failure toast" -> add a minimal `variant: "error"` to the shared Toast.
- Counter over-counts vs real ADF -> possible false-positive "over limit" warning; acceptable since Push stays enabled and it is advisory; documented.
- Tightening the autosave guard means oversized drafts fail to save; autosave swallows errors today, so that rejection is silent by design (live counter is the in-editor feedback).

### Tests
- `jira-content-limits.test.ts`: boundary transitions of `describeDescriptionSize`.
- `useTicketDetailPage` push-error: friendly copy for content-limit `detail`, raw fallback for unknown, `error` fallback when no `detail`; `showToast` called.
- `EditableDescription` counter: hidden / near / over rendering + correct over count.
- `ticket-service` `upsertLocalEdit`: rejects over-limit title/description with friendly message; accepts just-under.

## Checklist

- [x] **Before coding: confirm the 3 Open questions with the PO** (block-on-over vs allow; counter visibility; scope for title/comments)
  <!-- PO decisions (2026-06-17): 1) Push button STAYS ENABLED (do not block); push fails with toast. 2) Counter only visible near/over limit. 3) Description only this story (title/comments deferred). -->
- [ ] Empirically confirm Jira's real description limit against our instance (push graduated sizes; record the exact threshold and update the table above)
  <!-- skipped: requires live Jira write access + a throwaway ticket, not runnable in this environment. Used the documented limit (32,767) with the approximation rationale documented in src/lib/jira-content-limits.ts. Manual graduated-push verification noted as a follow-up. -->
- [x] Surface the real failure reason: read the Jira detail off the thrown `ApiError` in `handlePushToJira` and show it in the toolbar
- [x] Show a failure **toast** (bottom-right) with friendly copy for known codes (`CONTENT_LIMIT_EXCEEDED`) and raw detail fallback
- [x] Live size indicator in the description editor toolbar: subtle near the limit, red "N over limit" when exceeded
- [ ] (If PO confirms) block the Push button while over the limit, with an explanatory tooltip
  <!-- skipped: PO chose to keep the Push button ENABLED (open question 1). Push fails and surfaces the failure toast instead. -->
- [ ] Align server guards in `ticket-service.ts` to Jira's real limits (title 255, description ~32,767 with margin) so oversized content is rejected with a clear message before the Jira round-trip
  <!-- not done by design: the `ticket-service.ts` guard sits on the LOCAL draft-save path (upsertLocalEdit), not the push. Tightening it to Jira's limit blocked autosave of oversized drafts (the PO would lose work) - caught in review. Kept the generous local sanity cap (title 500, description 50000). Jira's limit is communicated by the live editor counter (pre-push) and the failure toast (post-push), consistent with the PO decision to keep Push enabled. No hard pre-flight reject (the markdown-length count is approximate and could falsely block a valid push). -->
- [x] Tests: error-detail surfacing (toast + toolbar), guard rejection messages, and the live-counter threshold states
- [x] All tests pass, build succeeds
