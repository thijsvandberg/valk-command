@CLAUDE: DO NOT ALTER THIS FILE WITHOUT EXPLICIT PERMISSION

# User Story Backlog (scratch notes)

Notes and ideas for future user stories. Items that are fleshed out get promoted to their own `VC-XXX-name.md` file.

## Story Writer

- **Pane system**: Replace current layout with a 1-3 pane toggle system. Each app (Chat, Editor, Diff, History, Draft preview, Related, Story preview) opens in its own pane. Default assignments: Chat=pane1, Editor=pane2, Diff/History/Preview=pane3. Support drag-and-drop to move apps between panes. Only one app active per pane. State preserved when closing an app.
- **Header structure**: (1) Story writer action bar (split/save/push/discard), (2) Application list with pane toggle, (3) App toolbar showing active apps per pane with their actions.
- **View toggle buttons**: Chat, Editor, Diff, History as toggle buttons. Click to show/hide each view. Chat always left, Editor always center or left if Chat hidden.
- **Related stories in chat**: Look up related stories via chat. Present with scores, clickable links that open in side panel. CMD+click opens in new tab. Mark stories as related via chat or sidebar. Uses existing find-related skill (`/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace/.claude/skills/find-related.md`), needs rebuild. Accessible via quick actions button in chat.
- **Per-type skills**: See VC-033.
- **acceptanceCriteria field**: Stored in ticket and storyVersion tables, synced from Jira custom field. Included in contentHash calculation but no UI to edit separately. Effectively null if not used in Jira. Evaluate whether to clean up.

## Sprint Board

- Right-click context menu on tickets
- Sprint grouping mode in All/Saved tab: group by sprint with drag-and-drop to move items between sprints
- Respect Jira sprint ordering unless explicit sorting is active
- Fix drag-and-drop reorder: order changes must sync back to Jira

## Editor

- Slash commands (`/`) for quick insertion of notes, callouts, etc.

## Chat

- System prompt should clarify that the AI has no write access, so suggesting self-modifications will not work
- Note dat stories in begrijpelijk EN geschreven moeten worden. EN level B2/C1?
- Skill moet ook al kennis hebben van ADF formatting rules


## Misc

- Epic children: show child issues when viewing an epic
- Log retention: clear logs after 7 days
- Log badge: clear warning counter/badge when log viewer is opened
