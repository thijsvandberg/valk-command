# BRDG-411: Whole-backlog `/api/tickets`-kost verlagen — Fase 1 (goedkope winst)

## Status

**Done (2026-06-26).** `useTickets` zet `refreshInterval` op `0` voor de `__all__`-sleutel en houdt `60000` voor gescopete sprints ([useSprintBoard.ts](../../src/hooks/useSprintBoard.ts)). De pipelines multi-sprint-view gebruikt nu `useTicketsForSprints(ids)` (fetcht per geselecteerde sprint gescopet + merge/dedup), nooit meer `__all__` + client-side filteren. Geverifieerd in de draaiende app via de BRDG-404 slow-query-stats (`/api/dev/query-stats`): op een rustige ticket-detailpagina blijft de ongescopete `GET /api/tickets` op count 1 over een idle-venster van >80s (geen 60s-poll meer); de pipelines-view triggert alleen `GET /api/tickets?sprintId=...`. Tests toegevoegd (refreshInterval-poll-gedrag + `useTicketsForSprints`). Alle gates groen (lint, typecheck, 6823 tests, build).

**Status:** Not Started
**Priority:** Medium
**Type:** Performance
**Execution order:** 1 of 2 (api-tickets-fetch reeks) — Fase 2 = [BRDG-412](BRDG-412-hover-lookup-on-demand.md)
**Depends on:** niets
**Unblocks:** [BRDG-412](BRDG-412-hover-lookup-on-demand.md) (de echte hover-refactor)
**Herkomst:** vondst uit de logging-audit ([docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema F), zichtbaar geworden door de slow-query-logging van BRDG-404.

## Description

Als PO wil ik dat de app niet **elke 60 seconden** de hele backlog (~44.000 tickets) opnieuw ophaalt, zodat de server en de browser minder onnodig werk doen — een snelle, laag-risico ingreep vooruitlopend op de echte fix in Fase 2.

## De analyse (kort): is dit slim?

**Ja, maar met de juiste verwachting.** Het trage `GET /api/tickets` (~1s, piek 1.5s) is **niet het board** — dat laadt gescopet per sprint en is snel. De ~1s komt van de **ongescopete** aanroep (`useTickets("__all__")`), die de hele backlog ophaalt. Die wordt aangejaagd door de app-brede **hover-lookup** ([useTicketHoverData.ts:45](../../src/hooks/useTicketHoverData.ts#L45)) en **ververst elke 60s** omdat `useTickets` standaard een `refreshInterval: 60000` heeft.

Het is dus een **achtergrond-/schaalbaarheidskost** (serverlast + browsergeheugen, en het groeit mee met de backlog), geen "board voelt traag"-fix. Fase 1 haalt de goedkope, terugkerende kost weg zonder risico; Fase 2 ([BRDG-412](BRDG-412-hover-lookup-on-demand.md)) elimineert de whole-backlog-fetch helemaal. Een **index helpt niet** (de query haalt zowat de hele set op; minder rijen/kolommen is de hefboom).

> Eerder besluit [BRDG-391](completed/BRDG-391-scope-remaining-all-tickets-fetches.md) liet deze fetch staan op de **geheugen**-as; dit ticket pakt de **latency/serverlast**-as, die we pas konden meten na BRDG-404.

## Current state (waar de stukken zitten)

- **De 60s-refresh is gedeeld:** [useSprintBoard.ts:58](../../src/hooks/useSprintBoard.ts#L58) — `useTickets` gebruikt `useSWR(key, fetcher, { revalidateOnFocus: true, dedupingInterval: 15000, refreshInterval: 60000 })`. Die `refreshInterval` geldt voor **alle** aanroepers, dus ook voor de `__all__`-sleutel (de hover-lookup). De `__all__`-tak triggert géén Jira-sync ([:64](../../src/hooks/useSprintBoard.ts#L64)), alleen de SWR-fetch + de 60s-poll.
- **De hover-lookup** ([useTicketHoverData.ts:45](../../src/hooks/useTicketHoverData.ts#L45)) roept `useTickets("__all__")` aan zonder eigen opties, dus erft de 60s-poll. Dit is de hoofd-aanjager van de whole-backlog-fetch (Fase 2 pakt dit aan).
- **Pipelines multi-sprint** ([pipelines/page.tsx:101](../../src/app/(app)/pipelines/page.tsx#L101)) haalt bij >1 geselecteerde sprint `"__all__"` op en filtert client-side — onafhankelijk van de hover-lookup.
- Vers blijven kan ook zonder poll: `revalidateOnFocus: true` + de gedeelde SSE/event-bus-revalidatie ([event-bus.ts](../../src/lib/event-bus.ts)) houden de lijst actueel.

## Approach (Fase 1)

1. **Zet de 60s-poll uit voor de `__all__`-sleutel** in [useTickets](../../src/hooks/useSprintBoard.ts#L51-L58): maak `refreshInterval` afhankelijk van de sleutel — `0` (uit) voor `sprintId === "__all__"`, en behoud `60000` voor de gescopete sprint-fetches. De `__all__`-lijst blijft vers via `revalidateOnFocus` + SSE; polling is daar overbodig. Dit haalt de terugkerende whole-backlog-rebuild weg op elke pagina met hover-rijen.
2. **Scope de pipelines multi-sprint-view** ([pipelines/page.tsx](../../src/app/(app)/pipelines/page.tsx#L101)): haal alleen de **geselecteerde** sprints op (per sprint via `useTickets(sprintId)` en samenvoegen) i.p.v. `"__all__"` + client-side filteren, zodat die pagina nooit de hele backlog trekt.

> Niet in Fase 1: de hover-lookup haalt de `__all__`-lijst nog steeds **één keer per paginaload** op; dat volledig elimineren is [BRDG-412](BRDG-412-hover-lookup-on-demand.md). De refinement-aanroepers (die ook via de hover-hook `__all__` trekken) horen daarom ook bij Fase 2.

## Acceptance Criteria

- [x] De `__all__`-fetch (`/api/tickets` zonder `sprintId`) ververst niet meer automatisch elke 60s; de gescopete sprint-fetches behouden hun 60s-refresh.
- [x] Op een rustige pagina met hover-rijen verdwijnt het **terugkerende** `GET /api/tickets` (~1s) uit de slow-query-stats (meetbaar via het BRDG-404-widget / `/api/dev/query-stats`); er blijft hooguit één fetch per paginaload over.
- [x] De pipelines multi-sprint-view haalt alleen de geselecteerde sprints op (geen `__all__`) en toont dezelfde resultaten als voorheen.
- [x] Hover-kaartjes blijven correct werken (de lijst wordt nog wel één keer geladen).
- [x] Tests dekken: `refreshInterval` is uit voor `__all__` en aan voor een gescopete sprint; de pipelines-view fetcht de geselecteerde sprints i.p.v. `__all__`.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References
- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema F (de vondst).
- [BRDG-412](BRDG-412-hover-lookup-on-demand.md) — Fase 2: de hover-lookup on-demand maken (elimineert de whole-backlog-fetch).
- [Client Data & Memory](../architecture/client-data-and-memory.md) — "never fetch the whole backlog".
- [BRDG-391](completed/BRDG-391-scope-remaining-all-tickets-fetches.md) — eerder besluit (geheugen-as).
