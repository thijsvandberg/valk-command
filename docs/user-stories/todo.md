 acceptanceCriteria
  Dit veld wordt opgeslagen in zowel de ticket als storyVersion tabel, gesynchroniseerd vanuit Jira. Het is een apart custom field dat sommige Jira-projecten gebruiken. Het wordt meegenomen in de contentHash berekening, maar er is geen UI om het apart te bewerken. Als jullie het in Jira niet gebruiken, is het effectief altijd null. We kunnen het voor nu negeren.
  -> kijken of we dit moeten opschonen

Tests
scenario package uitwerken, voor test agent


---
Chat: in de system prompt misschien toevoegen dat de AI zelf geen schrijrechten heeft, dus voorstellen om zelf dingen aan te passen gaat nooit werken.

---------------------------------------

Story writer
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

- Chat moet ook een knop zijn naast editor / diff / history. Met deze knoppen moet je bepaalde view modes aan en uit zetten. Klik je op chat, dan opent/verdijnt de chat. Klik je op edit, dan verdwijnt de edit mode. Hierdoor kun je dus ook de edit mode verbergen en enkel de chat zien.
- Volgorde:
  - chat window altijd links
  - editor altijd midden of links (als chat verborgen is)








- Per-type skills: zie VC-033



Ik wil in de story writer chat related stories kunnen opzoeken. Deze moeten vervolgens doorgegeven worden aan VC. In VC chat, moet dit netjes (incl score) gepresenteerd worden en moet je de links aan kunnen klikken. Deze moeten in de sidepannel (rechts) openen. en met CMD click moet de story single view in nieuw tabblad geopend worden. Deze related storires moet je via de chat en de sidebar view kunnen markeren om te linken aan de story als related story.
Er is al een skill: /Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace/.claude/skills/find-related.md, deze moet omgebouwd worden.
Deze find related kan via de quick actions (achter het knopje) in de chat worden gestart.

### Sprint board
- Right click context menu
- In all / saved tab een modus dat hij per sprint groeppeert, zodat je met drag&drop een item kunt verplaatsen naar een andere sprint
- De volgorde van jira in een sprint moet ook de volgorde zijn in een sprint board op VC, tenzij er een sorting actief is.
- De drag & drop volgorde veranderen werkt niet. Het updaten van de volgorde moet ook bijgewerkt worden in Jira.

### Editor
- Met / moet je makkelijk een note etc kunnen toevoegen

### Chat & Story writer


### Misc
- Bij een epic moet je de children kunnen zien


### Logs
- Logs moeten na 7 dagen gecleared worden
- Als er een warning in de logs staat, moet de counter/badge gecleared worden als je de logviewer geopend hebt


 Claude
 - Reageer in beknopte berichten
 - Niet te technisch