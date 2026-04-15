# BRDG-104: Code Investigation Skill

**Status:** Done
**Priority:** High

## Description

As the PO, I want to run code investigations from Bridge chat so I can answer ad-hoc technical questions about the Valk Platform codebase without switching to a local terminal session.

This brings the existing `/investigate` command from the local workspace (valk-workspace) to the remote workspace (VRW), making it accessible via Bridge chat. Two modes are supported:

1. **Tech analysis mode** (default): search the codebase and return a structured technical report with file paths, function references, and data flows.
2. **Explain mode**: same investigation, but with an additional non-technical summary appended that stakeholders can understand.

Results are displayed directly in the chat. No files are created. The user can copy and share results via Copy RTF or Copy Markdown actions.

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

## Implementation Plan

1. **VRW investigate skill** - Create `.claude/skills/investigate.md` in VRW
2. **DB migration** - Add `type` column to `conversation` table + update schema.ts
3. **TypeScript types** - Add `type` to `Conversation` interface
4. **API: accept type** - Update `POST /api/conversations` to accept `type`
5. **API: PATCH endpoint** - Add PATCH to `/api/conversations/[id]` for setting `relatedTicket`
6. **Hook update** - `useConversations.createConversation()` accepts `type`
7. **Auto-dispatch** - Investigation conversations auto-wrap messages as `/investigate` skill invocations
8. **ConversationTypePicker** - Popover component for the `+` button
9. **Integrate picker** - Wire into ConversationList, add investigation icon in sidebar
10. **handleCreate with type** - ChatLayout passes type through
11. **InvestigationInput** - Tailored input with Tech/Explain toggle and Jira key field
12. **Wire InvestigationInput** - Conditionally render in ChatLayout
13. **Command Palette** - Add "New Investigation" action
14. **Clipboard utilities** - `copyAsMarkdown()` and `copyAsRTF()` in `src/lib/clipboard.ts`
15. **Copy buttons** - Add copy Markdown/RTF buttons to assistant messages

## Acceptance Criteria

### Phase 1: VRW Skill Definition

- [x] Create `investigate.md` skill in VRW (`.claude/skills/investigate.md`)
- [x] Skill accepts a free-text question as input
- [x] Skill detects `explain` prefix (case-insensitive) and strips it before processing
- [x] Skill detects optional Jira key in input (e.g. `VPL-20661`) and fetches the ticket for additional context
- [x] Skill plans which repos to search based on the question (frontend `valk-nx`, backend `valk-platform-microservices`, admin `valk-platform-admin`)
- [x] Skill searches the codebase using parallel agents (source-side + target-side, or frontend + backend)
- [x] Skill synthesizes findings into the structured output format (see below)
- [x] Skill identifies related Jira stories: tickets where the investigated functionality was built, changed, or referenced
- [x] In explain mode: appends a non-technical summary after the technical findings
- [x] All output is in English regardless of input language

### Phase 2: Bridge Chat Integration

- [x] Skill is discoverable via `/api/workspace-tasks/skills` (auto, since VRW exposes its skills)
- [x] Chat recognizes `/investigate <question>` and dispatches to VRW as skill invocation
- [x] Streaming progress is shown in chat while investigation runs (reuse existing TaskProgress component)
- [x] Investigation result renders nicely in chat (markdown with tables, code references)
- [x] If a Jira key is detected in the question, the conversation's `relatedTicket` is set accordingly

### Phase 3: Conversation Type Picker

The `+` button for new conversations becomes a type picker so the user lands in the right flow immediately:

- [x] Clicking `+` opens a small menu with conversation types: **Chat** (default, existing behavior) and **Investigation**
- [x] Choosing "Investigation" creates a new conversation with `type: "investigation"` stored in the DB
- [x] Investigation conversations show a tailored UI:
  - Placeholder text: "Ask a question about the codebase..."
  - A **Tech / Explain** toggle next to the input to select the mode (default: Tech)
  - Optional Jira key input field (small, inline) to provide ticket context
- [x] Submitting a message in an investigation conversation automatically dispatches it as an `/investigate` skill invocation (no need to type the slash command)
- [x] Investigation conversations are visually distinct in the sidebar (e.g. a search/magnifying glass icon instead of the default chat icon)
- [x] The existing `/investigate` slash command in a regular chat conversation still works as a fallback
- [x] **Command Palette**: add "New Investigation" to `Cmd+K`, opens directly in investigation mode

### Future: Chat input chips

In a future story, add quick-action chips (Investigate, Review, etc.) directly above the chat input. This aligns with a broader effort to bring the chat experience closer to the story writer chat pattern. Out of scope for now.

### Phase 4: Copy & Share

- [x] **Copy as Markdown** button on investigation results: copies the raw markdown to clipboard
- [x] **Copy as RTF** button on investigation results: copies formatted rich text to clipboard (pasteable into Slack, email, Confluence, etc.)
- [x] Both actions available as icon buttons on the investigation result message in chat

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

## Related stories

| Key | Summary | Relevance |
|-----|---------|-----------|
| VPL-12345 | Implement cancellation flow | Built the original feature |
| VPL-12400 | Fix cancellation button visibility | Recent change to this area |

[Stories where the investigated functionality was built, changed, or referenced.
Found via git blame, Jira search, or code comments referencing ticket keys.]

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
- Related stories: found by extracting Jira keys from git blame, commit messages, and code comments in the relevant files, then optionally enriched via Jira MCP

### Bridge Side

- Results are chat messages only. No files are created or saved.
- Chat already renders markdown output from skill results, so investigation output should display correctly
- Copy RTF: convert markdown to rich text using a library like `turndown` (reverse) or a lightweight markdown-to-HTML-to-clipboard approach
- Copy Markdown: straightforward clipboard copy of the raw output
- **Conversation type**: add a `type` column to the `conversation` table (text, default `"chat"`). Values: `"chat"`, `"investigation"`. This drives the UI variant shown for the conversation.
- The conversation type picker (`+` menu) is a small popover or dropdown, not a modal. Keep it lightweight.
- Investigation conversations auto-wrap the user's message: if mode is "explain", prepend `explain` to the args. If a Jira key is provided, prepend it. The user just types their question.

### Differences from local `/investigate`

| Aspect | Local (valk-workspace) | Remote (VRW via Bridge) |
|--------|----------------------|------------------------|
| Trigger | `/investigate` in terminal | New Investigation conversation, or `/investigate` in chat |
| Execution | Local Claude Code session | VRW agent session |
| Output | Terminal markdown | Chat message (rendered markdown) |
| Sharing | Manual copy | Copy RTF / Copy Markdown buttons |
| Jira context | Manual lookup | Optional auto-fetch via Jira key in input |
| Related stories | Not included | Included in output |
| File saving | Offers to save .md file | No file saving, results stay in chat |

### Future: Confluence integration

When Confluence is connected (see BRDG-105), the investigate skill can be extended to also search Confluence for relevant documentation, decisions, and specs alongside the codebase. This is out of scope for this story.

### Related

- Jira ticket [VPL-20661](https://new-story.atlassian.net/browse/VPL-20661) may serve as a test case for the first investigation
- BRDG-105 (Confluence integration) is a prerequisite for adding Confluence search to investigations
- Existing VRW skills for reference: `review-story.md`, `write-story-draft.md`
- Local investigate command: `valk-workspace/.claude/commands/investigate.md`
- Local technical-analysis command: `valk-workspace/.claude/commands/technical-analysis.md`
- Local explain command: `valk-workspace/.claude/commands/explain.md`
