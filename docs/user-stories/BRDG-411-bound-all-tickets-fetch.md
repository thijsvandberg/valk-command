# BRDG-411: De whole-backlog `/api/tickets`-fetch afbouwen (hover-lookup + refinement/pipelines scopen)

**Status:** Not Started (analyse afgerond)
**Priority:** Medium
**Type:** Performance / Architecture
**Herkomst:** vondst uit de logging-audit ([docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema F) — pas zichtbaar geworden dankzij de slow-query-logging van BRDG-404.

## Description

Als PO wil ik dat de app niet onnodig de **hele backlog (~44.000 tickets)** ophaalt en dat herhaaldelijk doet, zodat de server minder werk doet, de browser minder schokt, en het meeschaalt als de backlog groeit.

## De analyse: is dit slim om te doen? (kort: ja, maar met de juiste framing)

**Wat de logs lieten zien:** `GET /api/tickets` duurt ~800-1228ms, 14x in een kort venster. Maar de cruciale nuance uit de codebase-verkenning:

- Het **trage pad is de óngescopete aanroep** (`/api/tickets` zonder `?sprintId`). Het board zelf laadt standaard **gescopet per sprint** en is snel (die calls staan niet eens in de slow-log).
- De ongescopete fetch (`useTickets("__all__")`) wordt vooral aangejaagd door **`useTicketHoverData`** ([src/hooks/useTicketHoverData.ts:44-58](../../src/hooks/useTicketHoverData.ts#L44-L58)): een app-brede opzoektabel zodat hover-kaartjes op verwijzingsrijen (epic-children, gelinkte issues, refinement-queue, ticket-pills) elk ticket kunnen tonen. Die haalt **alle** tickets op en **ververst elke 60s** (`refreshInterval: 60000`), terwijl er een server-cache met korte TTL voor staat die de 60s-refresh telkens mist.
- Twee andere ongescopete aanroepers: de **refinement-sessie** ([RefinementPageContent.tsx:114](../../src/components/refinement-session/RefinementPageContent.tsx#L114)) en de **pipelines multi-sprint-view** ([pipelines/page.tsx:101](../../src/app/(app)/pipelines/page.tsx#L101)), plus het bewuste **"All view"** van het board (alleen bij expliciete klik).

**Verdict — waarom het de moeite waard is:**
1. Het is een **terugkerende, backlog-grote kostenpost** die op de achtergrond op de meeste pagina's draait: ~1s DB + tientallen MB's JSON serialiseren + in de browser een Map van 44k entries (her)bouwen, elke 60s.
2. De hover-lookup **hoeft de hele backlog conceptueel niet** te kennen: hover-kaartjes zijn on-demand, en de zichtbare verwijzingsrijen zijn een **begrensde, bekende set keys**. Dat is precies waar de architectuur al een patroon voor heeft (`useTicketsByKeys` / een server-side by-keys endpoint, zie [client-data-and-memory.md](../architecture/client-data-and-memory.md)).
3. Het **schaalt slecht**: 44k vandaag, en het wordt erger naarmate het Jira-project groeit.

**Eerlijke framing (waarom dit geen P0 is):** het **board dat je dagelijks gebruikt is al snel** (gescopet). Dit is vooral een **achtergrond- en schaalbaarheidswinst** (serverbelasting, browsergeheugen/-haperingen), geen "het board voelt traag"-fix. Daarom: doen, maar gefaseerd — de goedkope winst eerst, de echte refactor als overwogen vervolg.

**Belangrijk — eerder besluit:** [BRDG-391](../user-stories/completed/BRDG-391-scope-remaining-all-tickets-fetches.md) bekeek deze `__all__`-fetches al en liet ze staan, maar puur op de **geheugen**-as (de SWR-LRU-cap begrenst geheugen). De **latency/serverkost**-as is nieuw (we konden het pas meten na BRDG-404). Dit is dus geen heropening van een afgesloten besluit, maar nieuwe informatie.

## Current state (waar de stukken zitten)

- **Route:** [src/app/api/tickets/route.ts](../../src/app/api/tickets/route.ts) — ongescopet (geen `sprintId`) → alleen `draftFilter`, dus ~de hele backlog (44.654 rijen) met joins (metadata, sprintnaam, local edits, story-versions, subtask-counts). Korte server-TTL-cache vóór de query; geen paginatie. Payload = de lichte `Ticket`-summary-shape (de list-vs-detail-split is al in orde en getest).
- **Aanjager #1 (hover):** [useTicketHoverData.ts](../../src/hooks/useTicketHoverData.ts) `useTickets("__all__")`, `refreshInterval: 60000`. Gebruikt door ChildIssueRow, LinkedIssueRow, SessionQueueItem, RecentlyViewedView, TicketRefPill.
- **Aanjager #2:** [RefinementPageContent.tsx:114](../../src/components/refinement-session/RefinementPageContent.tsx#L114) — laadt alles om sessie-tickets te matchen (ook die uit de board-feed vallen).
- **Aanjager #3:** [pipelines/page.tsx:101](../../src/app/(app)/pipelines/page.tsx#L101) — bij >1 sprint: alles ophalen en client-side filteren.
- **Board default:** [SprintBoard.tsx:261](../../src/components/sprint-board/SprintBoard.tsx#L261) `useTickets(activeSprintId)` — gescopet, snel; alleen "All view" is ongescopet (bewuste keuze).

## Approach (gefaseerd)

### Fase 1 — Goedkope winst, laag risico (aanrader om mee te starten)
1. **Stop de 60s-refresh van de hover-lookup.** Haal `refreshInterval: 60000` weg in [useTicketHoverData.ts](../../src/hooks/useTicketHoverData.ts); laat verversen via de bestaande SSE/focus-revalidatie. Hover-metadata mag licht verouderd zijn. Dit haalt de meeste terugkerende ~1s/backlog-churn weg.
2. **Scope de refinement-aanroeper** naar de sessie-keys (resolve via `useTicketsByKeys`) i.p.v. `__all__`.
3. **Scope de pipelines multi-sprint-view** naar de geselecteerde sprints (de `ticket_sprint`-bridge levert de keys) i.p.v. alles client-side filteren.

### Fase 2 — De echte fix (medium effort, medium risico; los vervolg)
4. **Vervang de whole-backlog hover-lookup door on-demand by-keys-resolutie.** Resolveer hover-data alleen voor de **zichtbare** verwijzingsrijen (gebatcht), via `useTicketsByKeys` of een nieuw, minimaal **`/api/tickets/hover?keys=`**-endpoint dat alleen de hover-velden teruggeeft. Hiermee verdwijnt de laatste `__all__`-aanjager. Raakt meerdere hover-consumenten, dus met zorg + tests (regressie op hover-kaartjes vermijden).

> Indexen lossen dit niet op: de query retourneert (vrijwel) de hele set, dus de winst zit in **minder rijen/kolommen ophalen**, niet in een index.

## Acceptance Criteria

### Fase 1
- [ ] De hover-lookup ververst niet meer elke 60s de hele backlog; verversing loopt via SSE/focus.
- [ ] De refinement-sessie en de pipelines multi-sprint-view halen niet langer `__all__` op maar alleen de keys/sprints die ze nodig hebben.
- [ ] In de prod-log verdwijnt het terugkerende `GET /api/tickets` (~1s) op pagina's die alleen hover nodig hebben (meetbaar via BRDG-404's slow-query-stats).
- [ ] Geen regressie: hover-kaartjes, refinement-queue en pipelines blijven correct werken (tests).

### Fase 2 (indien doorgezet)
- [ ] `useTicketHoverData` haalt niet meer de hele backlog op; hover-data wordt on-demand per zichtbare key (gebatcht) geresolved.
- [ ] Er zijn geen `useTickets("__all__")`-aanroepers meer behalve het expliciete "All view".
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References
- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema F (de vondst).
- [Client Data & Memory](../architecture/client-data-and-memory.md) — "never fetch the whole backlog"; `useTicketsByKeys`; list-vs-detail-split.
- [BRDG-391](../user-stories/completed/BRDG-391-scope-remaining-all-tickets-fetches.md) — eerder besluit (geheugen-as); dit ticket pakt de latency-as.
- [BRDG-404](../user-stories/completed/BRDG-404-slow-query-visibility.md) — leverde de meting die dit zichtbaar maakte.
