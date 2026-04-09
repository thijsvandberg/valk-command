# VC-034: Story Writer Streaming Resilience

**Status:** Completed
**Priority:** High

## Context
When a story writer message is sent, the workspace task completes but the result sometimes never reaches the UI. Both SSE and polling can fail silently, leaving the user stuck on "Starting..." with no feedback. The execution log stays empty because it's only populated after `apply-draft` runs. Usage/cost data is also lost when neither delivery path fires.

## Changes

### 1. `src/hooks/useStoryWriter.ts` - Polling progress + usage + timing

**a) Reduce initial poll delay:** `POLL_DELAY_MS` from 5000 to 2000, `MAX_POLL_MS` from 90000 to 120000.

**b) Update `streamProgress` during polling:**
- When task is still running: show `"Processing on workspace... ({elapsed}s)"`
- When poll returns non-ok: show `"Waiting for workspace..."`
- When poll throws: show `"Reconnecting... ({elapsed}s)"`

**c) Fix usage extraction:** Default `inputTokens`/`outputTokens`/`cost` to `0` instead of `undefined`. Remove the `!== undefined` guard so `setUsage` always fires on completion. Apply to both SSE result handler and polling handler.

### 2. `src/components/story-writer/ExecutionLogViewer.tsx` - Auto-refresh during streaming

- Add optional `isStreaming` prop
- Add `useRef` import
- Add interval effect: poll logs every 5s while `isStreaming` is true
- Add transition effect: refresh once when `isStreaming` goes from true to false

### 3. `src/components/story-writer/StoryWriterLayout.tsx` - Pass streaming state

- Pass `isStreaming={writer.status === "streaming" || writer.status === "sending"}` to `ExecutionLogViewer`

## Files
- `src/hooks/useStoryWriter.ts`
- `src/components/story-writer/ExecutionLogViewer.tsx`
- `src/components/story-writer/StoryWriterLayout.tsx`

## Verification
1. `npm run typecheck && npm run lint`
2. `npx vitest run`
3. `npm run build`
4. Manual test: send a message in story writer, verify progress updates from "Starting..." to "Processing on workspace... (Xs)", verify usage shows after completion, verify execution log populates during/after streaming
