# BRDG-180: Fix suggest-subtasks skill registration in VRW

**Status:** Open
**Priority:** High
**Related:** BRDG-127 (Refinement Session Mode), BRDG-164 (Subtask Rename and Delete)

## Description

The "AI-Suggested Subtasks" feature in the refinement view fails with a Claude Code API refusal: "Claude Code is unable to respond to this request, which appears to violate our Usage Policy". The root cause is that the `suggest-subtasks` skill exists as a prompt file in VRW (`.claude/skills/suggest-subtasks.md`) but is not registered in the `SKILL_REGISTRY` in `src/skills.ts`.

## Context

The suggest-subtasks route in valk-command was recently refactored from sending a plain prompt via the `"chat"` skill to sending structured args via a dedicated `"suggest-subtasks"` skill. However, the corresponding skill registration in VRW was never added.

When running against the old VRW code, the request falls back to the `"chat"` skill which has a broad toolset (`Bash, Write, WebFetch, WebSearch, Agent` + Jira tools). The combination of this broad toolset with the headless-mode automation instruction triggers Claude's safety classifier as a false positive, even though the ticket content is benign (booking/hospitality domain).

## Root Cause

- **VRW `src/skills.ts`**: `SKILL_REGISTRY` has no `"suggest-subtasks"` entry
- **VRW `src/task-queue.ts:56-58`**: `getSkill("suggest-subtasks")` returns `undefined`, throws `Unknown skill: suggest-subtasks`
- **Fallback behavior**: If VRW runs older code, it uses the `"chat"` skill with broad tool access, which triggers the safety classifier

## Acceptance Criteria

### VRW skill registration

- [ ] Add `suggest-subtasks` to `SKILL_REGISTRY` in VRW `src/skills.ts`
- [ ] Use minimal tools: `"Read"` only (no Bash, Write, WebFetch, etc.)
- [ ] Set timeout to `60_000` (60s, same as other lightweight skills)
- [ ] Set outputFormat to `"text"`
- [ ] Verify the prompt file `.claude/skills/suggest-subtasks.md` is loaded correctly

### End-to-end verification

- [ ] Trigger "suggest subtasks" on a ticket with description and acceptance criteria
- [ ] Verify the numbered subtask list is returned and displayed in the UI
- [ ] Verify it works for tickets with long descriptions
- [ ] Verify it works for tickets with minimal content (title only, no description)
- [ ] Verify existing subtasks are excluded from suggestions

### Error handling improvements (valk-command)

- [ ] When VRW returns a Usage Policy error, show a user-friendly message instead of raw API error (e.g. "Could not generate suggestions. Try again or add subtasks manually.")
- [ ] Add retry logic: if first attempt fails with API refusal, retry once (the safety classifier is non-deterministic)

## Implementation Notes

The skill registration in VRW should look like:

```typescript
"suggest-subtasks": {
  id: "suggest-subtasks",
  name: "Suggest Subtasks",
  promptFile: ".claude/skills/suggest-subtasks.md",
  tools: "Read",
  timeout: 60_000,
  outputFormat: "text",
},
```

This matches the pattern of other lightweight, context-only skills like `stakeholder-briefing`, `suggest-sprint-goal`, and `export-stakeholder-summary`.

The valk-command route (`src/app/api/tickets/[key]/suggest-subtasks/route.ts`) already sends the correct structured args format. No changes needed there.
