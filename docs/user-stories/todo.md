 acceptanceCriteria                                                                                                                           
  Dit veld wordt opgeslagen in zowel de ticket als storyVersion tabel, gesynchroniseerd vanuit Jira. Het is een apart custom field dat sommige Jira-projecten gebruiken. Het wordt meegenomen in de contentHash berekening, maar er is geen UI om het apart te bewerken. Als jullie het in Jira niet gebruiken, is het effectief altijd null. We kunnen het voor nu negeren.                 
  -> kijken of we dit moeten opschonen


Tests
scenario package uitwerken, voor test agent



Story writer
- Chat moet ook een knop zijn naast editor / diff / history. Met deze knoppen moet je bepaalde view modes aan en uit zetten. Klik je op chat, dan opent/verdijnt de chat. Klik je op edit, dan verdwijnt de edit mode. Hierdoor kun je dus ook de edit mode verbergen en enkel de chat zien.
- Volgorde: 
  - chat window altijd links
  - editor altijd midden of links (als chat verborgen is)

                                                                            


Chat
- als je veel aan het typen bent, dan moet het chat input veld automatisch groter worden.                                
- Je moet het chat input veld zelf ook groter kunnen maken
- De chat responses vanuit de valk remote workspace moet niet alleen een draft (dus draft knopje) returnen, maar ook een kort begeleidend berichtje, en wanneer relevant een vervolg vraag.
- Je moet de "Draft" ook in de chat kunnen bekijken
- Voeg in de chat berichten ook subtiel een tijd toe (verzonden en ontvangen). Evt achter een hover / "i" tje oid.
- Toon bij de laatste reactie hoe lang de AI er over heeft gedaan
- Lange berichten moeten afgekort worden, en moet een nette uitklap knop bij
- Ik zie nog geen sessie kosten, er was wel al wat voor gebouwd.


Issue type: "Bug" format



### Problem 
In one short sentence a description of the problem. Don't describe the full flow, focus on the actual effect of the bug.

#### Actual:
A short, but precise description of the problem.

#### Expected: 

#### Impact: 
A short description of the impact/scope and thus priority of the problem.

### Steps to Reproduce:

### In Scope:
Optional, only needed for complex situations

### Out of Scope:
Optional, usually not neccecary.

### Acceptance Criteria:

-----

### Problem
[One sentence describing the bug's effect, not the full flow.]
 
#### Actual:
[Short, precise description of what's happening.]
 
#### Expected:
[What should happen instead.]
 
#### Impact:
[Scope and priority context.]
 
### Steps to Reproduce:
[Repro path, if not obvious.]
 
### In Scope:
[Optional — only for complex situations.]
 
### Out of Scope:
[Optional — usually not needed.]
 
### Acceptance Criteria:
[Testable statements.]


