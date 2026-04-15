# BRDG-104: Code Investigation Skill

**Status:** Open
**Priority:** High

## Description

As the PO, I want to run code investigations from Bridge chat so I can answer ad-hoc technical questions about the Valk Platform codebase without switching to a local terminal session.

This brings the existing `/investigate` command from the local workspace (valk-workspace) to the remote workspace (VRW), making it accessible via Bridge chat. Two modes are supported:

1. **Tech analysis mode** (default): search the codebase and return a structured technical report with file paths, function references, and data flows.
2. **Explain mode**: same investigation, but with an additional non-technical summary appended that stakeholders can understand.

### Example usage in chat

```
/investigate When do we show the cancellation button in my account on the reservation details page, and when not?
```

```
/investigate explain How does the upgrade service determine available room types?
```

Optionally linked to a Jira ticket for context:

```
/investigate VPL-20661 When do we show the cancellation button in my account on the reservation details page?
```

## Acceptance Criteria

### Phase 1: VRW Skill Definition

- [ ] Create `investigate.md` skill in VRW (`.claude/skills/investigate.md`)
- [ ] Skill accepts a free-text question as input
- [ ] Skill detects `explain` prefix (case-insensitive) and strips it before processing
- [ ] Skill detects optional Jira key in input (e.g. `VPL-20661`) and fetches the ticket for context
- [ ] Skill plans which repos to search based on the question (frontend `valk-nx`, backend `valk-platform-microservices`, admin `valk-platform-admin`)
- [ ] Skill searches the codebase using parallel agents (source-side + target-side, or frontend + backend)
- [ ] Skill synthesizes findings into the structured output format (see below)
- [ ] In explain mode: appends a non-technical summary after the technical findings
- [ ] All output is in English regardless of input language

### Phase 2: Bridge Chat Integration

- [ ] Skill is discoverable via `/api/workspace-tasks/skills` (auto, since VRW exposes its skills)
- [ ] Chat recognizes `/investigate <question>` and dispatches to VRW as skill invocation
- [ ] Streaming progress is shown in chat while investigation runs (reuse existing TaskProgress component)
- [ ] Investigation result renders nicely in chat (markdown with tables, code references)
- [ ] If a Jira key is detected in the question, the conversation's `relatedTicket` is set accordingly

### Phase 3: Save & Share

- [ ] After the investigation completes, offer a "Save as investigation" action
- [ ] Saving creates a file at `docs/investigations/YYYY-MM-DD-<topic>.md` in the workspace
- [ ] If explain mode was used, offer to copy the non-technical summary (reuse `/rtf` pattern if available)

## Output Format

The VRW skill should produce output in this structure:

```markdown
## Question

[The user's original question, rephrased clearly]

## Finding

[2-3 sentence summary answering the question directly. Lead with the answer.]

## How it works

[What is currently implemented. Reference actual code paths and files.
Use numbered steps for flows, with file:function references inline.]

## What's missing

[Gaps, missing implementations, incomplete flows. Only include if applicable.]

## What would be needed

[What would need to be built to close the gap. Only include if there is a gap.]

## Key files

| File | Purpose |
|------|---------|
| `apps/service/src/path/file.go` | Brief description |
| ... | ... |
```

When explain mode is active, append:

```markdown
## Summary (non-technical)

[Bold title summarizing the finding]

[Plain-language paragraphs. No file paths, function names, or code snippets.
Use domain terminology (hotels, reservations, Shiji, Loyal) but not developer terminology.]
```

## Technical Notes

### VRW Skill

- Based on the existing `/investigate` command in `valk-workspace/.claude/commands/investigate.md`
- Adapted to run as a VRW skill (`.claude/skills/` format with frontmatter) instead of a local slash command
- The skill is read-only: it searches code but never modifies it
- Uses parallel Explore agents for efficient cross-repo searching
- Project configuration (repo names, architecture doc paths) should be embedded in the skill definition

### Bridge Side

- Minimal Bridge-side changes expected: the existing skill invocation pipeline (`/skill args` -> `POST /api/workspace-tasks` -> VRW) handles this
- Chat already renders markdown output from skill results, so investigation output should display correctly
- The "Save as investigation" action (Phase 3) could be a follow-up message or a button in the chat UI

### Differences from local `/investigate`

| Aspect | Local (valk-workspace) | Remote (VRW via Bridge) |
|--------|----------------------|------------------------|
| Trigger | `/investigate` in terminal | `/investigate` in Bridge chat |
| Execution | Local Claude Code session | VRW agent session |
| Output | Terminal markdown | Chat message (rendered markdown) |
| Save prompt | Interactive terminal prompt | Chat action/button |
| Jira context | Manual lookup | Optional auto-fetch via Jira key in input |

### Related

- Jira ticket [VPL-20661](https://new-story.atlassian.net/browse/VPL-20661) may serve as a test case for the first investigation
- Existing VRW skills for reference: `review-story.md`, `write-story-draft.md`
- Local investigate command: `valk-workspace/.claude/commands/investigate.md`
- Local technical-analysis command: `valk-workspace/.claude/commands/technical-analysis.md`
- Local explain command: `valk-workspace/.claude/commands/explain.md`
