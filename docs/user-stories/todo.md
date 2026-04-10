@CLAUDE: DO NOT ALTER THIS FILE WITHOUT EXPLICIT PERMISSION

# User Story Backlog (scratch notes)

 acceptanceCriteria
  Dit veld wordt opgeslagen in zowel de ticket als storyVersion tabel, gesynchroniseerd vanuit Jira. Het is een apart custom field dat sommige Jira-projecten gebruiken. Het wordt meegenomen in de contentHash berekening, maar er is geen UI om het apart te bewerken. Als jullie het in Jira niet gebruiken, is het effectief altijd null. We kunnen het voor nu negeren.
  -> kijken of we dit moeten opschonen


## Story Writer

- **Pane system**: Replace current layout with a 1-3 pane toggle system. Each app (Chat, Editor, Diff, History, Draft preview, Related, Story preview) opens in its own pane. Default assignments: Chat=pane1, Editor=pane2, Diff/History/Preview=pane3. Support drag-and-drop to move apps between panes. Only one app active per pane. State preserved when closing an app.
- **Header structure**: (1) Story writer action bar (split/save/push/discard), (2) Application list with pane toggle, (3) App toolbar showing active apps per pane with their actions.
- **View toggle buttons**: Chat, Editor, Diff, History as toggle buttons. Click to show/hide each view. Chat always left, Editor always center or left if Chat hidden.
- **Related stories in chat**: Look up related stories via chat. Present with scores, clickable links that open in side panel. CMD+click opens in new tab. Mark stories as related via chat or sidebar. Uses existing find-related skill (`/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace/.claude/skills/find-related.md`), needs rebuild. Accessible via quick actions button in chat.
- **Per-type skills**: See BRDG-033.
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


## Search


# BACKUP



---------------------------------------

## Story writer
Ik wil dat de pannels op een andere manier gaan werken. Je moet via een knop kiezen hoeveel pannels je ziet 1 tot 3 (pane toggle). Elke 'app' (Chat / Editor / Diff / etc) opent in een eigen pane. De Chat opent  dus ook in een pane. De main balk met editor / diff / history moet uitgebreid worden met chat, zodat je via die knop de chat kunt openen en sluiten.

De verschillende 'apps' openen standaard in dezelfde pane:
- Chat -> default pane 1
- Editor -> default pane 2
- Diff -> default pane 3
- History -> default pane 3
- Draft preview -> default pane 3
- Related -> default pane 3
- Story preview (full story openen in de story writer) -> default pane 3

Het moet ook mogelijk zijn om doormiddel van drag & drop een 'app' te verplaatsen naar een andere pane. Er is altijd maar 1 app actief in een pane. Als je een app sluit in de pane, dan moet alle info bewaard blijven.

Zo zie ik het voor me; 3 horizontale bars met app info en actions.

Header: Story writer action bar met oa split / save / push / discard (hier veranderen we nu niets aan)
--
Application list: (hiermee zet kun je de verschillende applicaties inklappen uitklapen) + pane toggle
--
App toolbar met verschllende pane voorbeelden: CHAT    <chat actions: logs> | Editor: VPL-123 Title of the story <editor actions> | Diff: Name/number draft <diff actions: dropdown / preview button>

---------------------------------------



 Global Claude rules
 - Reageer in beknopte berichten
 - Niet te technisch