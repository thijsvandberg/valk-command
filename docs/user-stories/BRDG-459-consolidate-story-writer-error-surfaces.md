# BRDG-459: Consolidate Story Writer error surfaces

**Status:** To Do
**Priority:** Medium
**Type:** Refactor

## Description

When the remote workspace is unreachable, a single failed Story Writer message currently produces four overlapping error indicators at once: an inline "Message could not be sent" bubble, a red session-level banner ("Cannot reach the workspace. Is it running?"), a "Clear failed messages" row, and an app-wide "Action failed" toast showing a raw JSON error body. That is noisy and the toast is unreadable.

Decided behaviour (confirmed with PO):

1. **The error lives on the failed message itself**, where the user's focus already is: the failed-message bubble carries the friendly reason (e.g. "Cannot reach the workspace. Is it running?") plus the existing "Tap to retry" action and a small per-bubble dismiss (×).
2. **A compact workspace status indicator in the Story Writer chat toolbar** (next to "1 draft · 2 messages"), shown **only when there is a problem** (PO choice: nothing is rendered while the workspace is healthy). Red dot + short label, hover tooltip with details.
3. The red banner above the composer remains **only for errors that have no message to attach to** (stream timeout, task failure, draft-save failure).
4. The activity-log toast is **suppressed for failed story-writer entries** (they stay visible in the Activity Log page). Any failed toast that still renders a structured errorDetail shows the friendly message instead of raw JSON.
5. The "Clear failed messages" row is removed; the per-bubble × replaces it.

## Current Behaviour

All four surfaces fire on the same failed send:

- **Inline bubble** — `src/components/story-writer/StoryWriterChat.tsx:486-503` renders "Message could not be sent." + "Tap to retry" when `msg.status === "failed"`. The message only carries a status, not the error reason.
- **Red banner** — `StoryWriterChat.tsx:555-559` renders `streamError`. On a send failure, `useStoryWriter.ts` (`sendMessage` catch at ~306-324, `retryMessage` catch at ~353-364) sets both the message status to `failed` AND `streamError` via `friendlyAgentError(err.body)` (`src/lib/agent-errors.ts:18-28`, maps `UNREACHABLE` → "Cannot reach the workspace. Is it running?"). So bubble + banner duplicate the same error.
- **"Clear failed messages" row** — `StoryWriterChat.tsx:567-577`, shown whenever any failed/pending message exists; calls `clearFailedMessages` (`useStoryWriter.ts:367-372`, `DELETE .../messages?failed=true`).
- **Toast** — a completely separate path: the server logs the failure to the activity log with `type: "story-writer"` and `errorDetail: JSON.stringify({code, error, httpStatus, retryCount})` (`src/lib/story-writer-messages.ts:228-256` `logAndThrowAgentError`, also the 410 path at ~851-856). `ActivityContext.tsx` polls `/api/activity-log?limit=20` and `collectNewToasts` (`src/contexts/ActivityContext.tsx:97-108`) toasts every newly-seen failed entry. `SyncToast.tsx:112` renders `errorDetail` raw, hence the JSON in the toast.
- `streamError` is also set by non-send errors in `src/hooks/useTaskMonitoring.ts` (timeout ~192, task failed ~209, draft-save failure ~111, structured error ~266). These have no failed user message and must keep using the banner.
- The Chat view has a workspace status label (`src/components/chat/WorkspaceStatus.tsx`) driven by `useWorkspaceHealth` (`src/hooks/useWorkspaceHealth.ts`, 30s poll, pauses on hidden tab, states `connected | unreachable | checking`). The Story Writer has no workspace status indicator.
- The Story Writer chat toolbar is registered in `src/components/story-writer/panes/apps/ChatApp.tsx:79-122` (`registerToolbar("chat", ...)`); the "1 draft · 2 messages" span is at lines 107-117.
- Tooltip primitive exists at `src/components/shared/Tooltip.tsx` (portal-based, smart flip/clamp).

## Proposed Approach

**1. Per-message error reason (bubble becomes the primary surface)**
- In `useStoryWriter.ts` `sendMessage`/`retryMessage` catch blocks: store the friendly error on the failed message (e.g. `errorMessage` field on the client-side `Message` shape) instead of setting `streamError`. The `DUPLICATE` (409) path is unchanged.
- In `StoryWriterChat.tsx`, the failed bubble renders `msg.errorMessage ?? "Message could not be sent."` + "Tap to retry" + a small × that dismisses that one failed message (reuse the existing failed-message delete; extend `DELETE .../messages` with a `messageId` param or clear locally for temp-id messages).
- Remove the "Clear failed messages" row.

**2. Toolbar workspace indicator (problem-only)**
- In `ChatApp.tsx`, add a small status element to the registered toolbar actions next to the counts span, driven by `useWorkspaceHealth()`.
- Render **nothing** when `connected` or `checking`; when `unreachable`, render a red dot + short label ("Workspace"), wrapped in `Tooltip` with the friendly detail ("Cannot reach the workspace. Is it running?").
- To avoid the indicator lagging up to 30s behind a failed send, trigger a health re-check when a send fails (expose a `refresh` from `useWorkspaceHealth` or re-use its existing check function).

**3. Banner narrowed to message-less errors**
- `streamError` banner (`StoryWriterChat.tsx:555-559`) stays, but is now only fed by `useTaskMonitoring` paths (timeout, task failure, draft-save failure, structured errors) and the DUPLICATE warning path. Send failures no longer set it.

**4. Toast suppression + friendly detail**
- In `collectNewToasts` (`ActivityContext.tsx`): failed entries with `type === "story-writer"` are marked seen but never toasted. They remain in the Activity Log page and in `unacknowledgedErrors` (nav/activity indicator behaviour unchanged).
- In `SyncToast.tsx`: before rendering `errorDetail`, detect a structured JSON body (`{code, error, ...}`) and render `friendlyAgentError` output instead of the raw string, so no remaining toast ever shows raw JSON.

**Out of scope / non-goals**
- The main Chat view's error handling and its `WorkspaceStatus` label are untouched.
- Activity Log page rendering of `errorDetail` stays as is (it is a log; raw detail is useful there).
- No changes to server-side error logging (`story-writer-messages.ts` keeps writing full errorDetail).

## Implementation Plan

1. **Per-message error + dismiss** — `src/hooks/useStoryWriter.ts`, `src/components/story-writer/StoryWriterChat.tsx`, client `Message` type, `src/app/api/tickets/[key]/story-writer/messages/route.ts` (per-message delete).
2. **Toolbar indicator** — `src/components/story-writer/panes/apps/ChatApp.tsx`, `src/hooks/useWorkspaceHealth.ts` (expose refresh), `src/components/shared/Tooltip.tsx` (reuse).
3. **Banner narrowing** — `src/hooks/useStoryWriter.ts` (stop setting `streamError` on send failure).
4. **Toast suppression + friendly detail** — `src/contexts/ActivityContext.tsx` (`collectNewToasts`), `src/components/sync/SyncToast.tsx`.
5. **Cleanup** — remove "Clear failed messages" row and its now-unused wiring if nothing else consumes it.

## Acceptance Criteria

- [ ] A failed send shows exactly one indicator in the message list: the failed bubble with the friendly reason (e.g. "Cannot reach the workspace. Is it running?"), "Tap to retry", and a dismiss ×. <!-- StoryWriterChat.tsx failed-bubble block; errorMessage set in useStoryWriter.ts catch blocks via friendlyAgentError -->
- [ ] A failed send does NOT set the red `streamError` banner. <!-- useStoryWriter.ts sendMessage/retryMessage catch blocks -->
- [ ] The banner still appears for message-less errors: stream timeout, task failure, draft-save failure. <!-- useTaskMonitoring.ts onError paths unchanged -->
- [ ] The dismiss × removes only that failed message (state and, when persisted, server-side). <!-- StoryWriterChat.tsx bubble; DELETE messages route with messageId -->
- [ ] The "Clear failed messages" row no longer exists. <!-- StoryWriterChat.tsx:567-577 removed -->
- [ ] While the workspace is healthy (connected/checking), the Story Writer toolbar shows no status indicator. <!-- ChatApp.tsx toolbar actions, useWorkspaceHealth -->
- [ ] When the workspace is unreachable, the toolbar shows a red dot + short label with a hover tooltip containing the friendly detail. <!-- ChatApp.tsx + shared Tooltip -->
- [ ] A failed send triggers an immediate workspace health re-check so the indicator appears without waiting for the next poll. <!-- useWorkspaceHealth refresh, called from useStoryWriter failure path -->
- [ ] Failed activity-log entries with type "story-writer" never produce a toast; they remain visible in the Activity Log page. <!-- ActivityContext.tsx collectNewToasts -->
- [ ] Failed toasts of other types with a structured JSON errorDetail render the friendly message, not raw JSON. <!-- SyncToast.tsx via friendlyAgentError -->
- [ ] Retry from the bubble still works and clears the error state on success. <!-- useStoryWriter.ts retryMessage -->

## Tests

- [ ] Failed bubble renders per-message friendly reason, retry, and dismiss; no banner rendered for the same failure. <!-- src/components/story-writer/StoryWriterChat.test.tsx -->
- [ ] `sendMessage` failure sets `errorMessage` on the message and leaves `streamError` null; DUPLICATE path unchanged. <!-- src/hooks/useStoryWriter.test.ts -->
- [ ] Toolbar indicator: nothing rendered for `connected`/`checking`, red dot + tooltip for `unreachable`. <!-- src/components/story-writer/panes/apps/ChatApp.test.tsx (mock useWorkspaceHealth) -->
- [ ] `collectNewToasts` skips failed `story-writer` entries but still marks them seen (no toast on later polls either). <!-- src/contexts/ActivityContext.test.tsx -->
- [ ] Toast errorDetail formatting: structured `{"code":"UNREACHABLE",...}` renders the friendly message; plain-string errorDetail renders unchanged. <!-- src/components/sync/SyncToast.test.tsx -->
- [ ] Per-message dismiss removes only the dismissed failed message. <!-- src/hooks/useStoryWriter.test.ts -->

## Related

- [docs/architecture/story-writer.md](../architecture/story-writer.md) — Story Writer architecture (chat, drafts, panes).
- `src/lib/agent-errors.ts` — existing friendly error mapping this builds on.
- `src/components/chat/WorkspaceStatus.tsx` — Chat view's equivalent health indicator (pattern source, untouched).
