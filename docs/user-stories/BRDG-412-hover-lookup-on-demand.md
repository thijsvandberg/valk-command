# BRDG-412: Hover-lookup on-demand maken — Fase 2 (whole-backlog fetch elimineren)

**Status:** Not Started
**Priority:** Medium
**Type:** Performance / Architecture
**Execution order:** 2 of 2 (api-tickets-fetch reeks) — Fase 1 = [BRDG-411](BRDG-411-bound-all-tickets-fetch.md)
**Depends on:** [BRDG-411](BRDG-411-bound-all-tickets-fetch.md) (Fase 1 verlaagt eerst de kost; Fase 2 verwijdert de oorzaak)
**Herkomst:** logging-audit ([docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema F).

## Description

Als PO wil ik dat de app **nooit meer de hele backlog (~44.000 tickets) ophaalt** om hover-kaartjes te tonen. De hover-lookup moet alleen de gegevens halen voor de **zichtbare** verwijzingsrijen, zodat de kost niet meeschaalt met de omvang van het project.

## Why

- De app-brede hover-lookup ([useTicketHoverData.ts:44-58](../../src/hooks/useTicketHoverData.ts#L44-L58)) haalt via `useTickets("__all__")` **alle** tickets op en bouwt er een Map van, puur om bij een hover een kaartje te kunnen tonen. Dat is tientallen MB's JSON + een Map van 44k entries, op de meeste pagina's. Fase 1 stopte de 60s-herhaling; Fase 2 verwijdert de fetch zelf.
- Hover-kaartjes zijn **on-demand** (alleen bij hover), en de zichtbare verwijzingsrijen zijn een **begrensde, bekende set keys** — precies waar de architectuur al een patroon voor heeft ([client-data-and-memory.md](../architecture/client-data-and-memory.md): resolve een bounded set keys, laad niet alles).

## Current state (waar de stukken zitten)

- **De lookup:** [useTicketHoverData.ts:44-58](../../src/hooks/useTicketHoverData.ts#L44-L58) — `useTickets("__all__")` → `Map<key, TicketPillHoverData>`; geeft een synchrone `(key) => data | undefined` terug. `buildTicketHoverData` ([:16-35](../../src/hooks/useTicketHoverData.ts#L16)) levert de hover-shape (title, SP, BV, sprint, epic, assignee, subtask-counts, readiness, qualityScore, notes, editState).
- **Consumenten** (roepen de lookup aan voor verwijzingsrijen): ChildIssueRow, LinkedIssueRow, SessionQueueItem, RecentlyViewedView, TicketRefPill. Elk rendert een bekende set keys (epic-children, gelinkte issues, queue-items).
- **Bestaande bounded-tool:** [useTicketsByKeys(keys)](../../src/hooks/useSprintBoard.ts#L143-L157) — resolveert een expliciete set keys via het single-ticket-endpoint, tolerant voor 404. Bedoeld voor precies dit soort begrensde sets.
- **Refinement-aanroepers die ook `__all__` trekken:** [RefinementPageContent.tsx:114](../../src/components/refinement-session/RefinementPageContent.tsx#L114), [SessionEndModal.tsx:51](../../src/components/refinement-session/SessionEndModal.tsx#L51), [session/[ticketKey]/page.tsx:87](../../src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx#L87).
- **Bewust uitgezonderd:** het expliciete board-**"All view"** ([SprintBoard.tsx](../../src/components/sprint-board/SprintBoard.tsx)) mag `__all__` blijven gebruiken — de gebruiker vraagt daar expliciet om alle sprints.

## Approach (Fase 2)

1. **Minimaal hover-endpoint:** voeg `GET /api/tickets/hover?keys=a,b,c` toe ([src/app/api/tickets/hover/route.ts]) dat **alleen de hover-velden** (de `buildTicketHoverData`-shape) teruggeeft voor de gevraagde keys. Begrensd door de keys; respecteer de list-vs-detail-split (geen detail-velden). Cap het aantal keys per call en/of batch server-side.
2. **`useHoverData(keys: string[])`-hook:** fetcht de begrensde set (gebatcht, gededupliceerd, SWR-gecached op de gesorteerde keys, zoals `useTicketsByKeys`) en geeft dezelfde `(key) => TicketPillHoverData | undefined` terug. Hergebruik `buildTicketHoverData`.
3. **Vervang de bron in `useTicketHoverData`:** laat de hover-lookup gevoed worden door de keys die de consumenten daadwerkelijk renderen i.p.v. `useTickets("__all__")`. De row-containers (epic-children-lijst, linked-issues-sectie, queue) verzamelen hun zichtbare keys en geven die door. Behoud de bestaande aanroep-API van de consumenten waar mogelijk om regressie te beperken.
4. **Scope de refinement-aanroepers** (de drie hierboven) naar de sessie-keys via `useTicketsByKeys`.
5. **Resultaat:** er resteert geen `useTickets("__all__")`-aanroeper meer behalve het expliciete board-"All view".

> Risico/aandacht: dit raakt meerdere hover-consumenten. Vermijd een N+1 (batch de zichtbare keys per container, niet per rij). Behoud `buildTicketHoverData` als enige plek die de shape bouwt. Dek met tests (hover-kaartjes, refinement-queue, linked issues, epic-children, ticket-pills).

## Acceptance Criteria

- [ ] `useTicketHoverData` haalt niet langer de hele backlog op; hover-data wordt on-demand geresolved voor alleen de zichtbare verwijzing-keys (gebatcht via het nieuwe endpoint).
- [ ] `GET /api/tickets/hover` geeft uitsluitend de hover-velden terug (geen detail-velden), begrensd door de gevraagde keys.
- [ ] De refinement-pagina's fetchen alleen hun sessie-keys (geen `__all__`).
- [ ] Er zijn geen `useTickets("__all__")`-aanroepers meer, behalve het expliciete board-"All view".
- [ ] Bij normale navigatie verschijnt `GET /api/tickets` (ongescopet) niet meer in de slow-query-stats (BRDG-404); alleen het expliciete "All view" triggert het nog.
- [ ] Hover-kaartjes, refinement-queue, gelinkte issues, epic-children en ticket-pills tonen nog steeds de juiste data (tests).
- [ ] Geen N+1: de zichtbare keys worden per container gebatcht.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References
- [BRDG-411](BRDG-411-bound-all-tickets-fetch.md) — Fase 1 (de goedkope winst die hieraan voorafgaat).
- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema F.
- [Client Data & Memory](../architecture/client-data-and-memory.md) — `useTicketsByKeys`, list-vs-detail-split, "never fetch the whole backlog".
