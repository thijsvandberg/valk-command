# BRDG-401: Stop stil dataverlies + validatie-logging + eerlijke statuscodes

**Status:** Done
**Priority:** High
**Type:** Observability + UX
**Execution order:** 4 of 7 (logging-observability reeks)
**Depends on:** BRDG-398 (client-error sink / `reportClientError`), BRDG-399 (`handleServiceError` logt)

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema B + frontend.

## Description

Als PO wil ik dat een **mislukte opslag van mijn gegevens niet stil verdwijnt**: ik wil het zien (een melding), en de ontwikkelaar wil het in de log terugvinden. Vandaag worden o.a. mijn refinement-notities weggeschreven met een "negeer fouten"-vangnet, springt een ticket-veld stil terug, en meldt een handmatige scheduler-run "gelukt" terwijl hij faalde.

## Why

- Echte gebruikersdata wordt weggeschreven met `.catch(() => {})`: mislukt het, dan is de notitie weg en blijft de refinement-sessie eeuwig `in_progress`, zonder enig spoor. "Mijn notities zijn verdwenen" wordt onbewijsbaar.
- Ticket-detail-edits rollen stil terug met alleen `console.error` (browser-only) en zonder toast; het board doet dit juist wél goed, dus het is inconsistentie.
- Validatie-/bad-body-fouten worden stil ge-400't (0 van ~80 validerende routes logt iets).
- Een handmatig getriggerde taak retourneert HTTP 200 "ran:true" terwijl hij faalde.

## Current state (where the pieces are)

- **Stille data-writes:** [src/components/refinement-session/SessionEndModal.tsx:106-107](../../src/components/refinement-session/SessionEndModal.tsx#L106-L107), [:157-158](../../src/components/refinement-session/SessionEndModal.tsx#L157-L158), [:342](../../src/components/refinement-session/SessionEndModal.tsx#L342) en [src/contexts/RefinementSessionContext.tsx:185](../../src/contexts/RefinementSessionContext.tsx#L185),[:199](../../src/contexts/RefinementSessionContext.tsx#L199) gebruiken `.catch(() => {})` op notitie-/status-writes.
- **Stille rollback zonder toast:** [src/components/ticket-detail/TicketMetaContent.tsx](../../src/components/ticket-detail/TicketMetaContent.tsx) 8 handlers (regels 189,206,223,244,282,308,325,339) doen `console.error("Operation failed:", err)` + rollback, geen toast (bestand importeert geen toast). Contrast: het board doet het goed via [src/components/sprint-board/useTicketActions.ts:54](../../src/components/sprint-board/useTicketActions.ts#L54) ("Change reverted").
- **Validatie stil ge-400't:** [src/lib/request-parser.ts:28](../../src/lib/request-parser.ts#L28) (`Invalid JSON`) en [src/lib/api-response.ts:20](../../src/lib/api-response.ts#L20) (`validationError`) loggen niets.
- **Handmatige run liegt:** [src/lib/scheduler.ts:218](../../src/lib/scheduler.ts#L218) `runTaskNow` vangt + bewaart de fout maar logt niet (anders dan `tick()` op [:188](../../src/lib/scheduler.ts#L188)); [src/app/api/scheduler/run/[name]/route.ts:32](../../src/app/api/scheduler/run/[name]/route.ts#L32) geeft `200 {ran:true}` terug.

## Approach

1. **Data-writes niet meer stil:** vervang de `.catch(() => {})` op de notitie-/status-writes door een handler die (a) `reportClientError` aanroept (uit BRDG-398) met `ticketKey`/`sessionId` + operatienaam, en (b) een toast toont ("Opslaan mislukt, probeer opnieuw"). Geldt voor [SessionEndModal.tsx](../../src/components/refinement-session/SessionEndModal.tsx) (auto-save, flush, bulk-readiness-reset) en [RefinementSessionContext.tsx](../../src/contexts/RefinementSessionContext.tsx) (saveSession/finishSession).
2. **Ticket-detail-pariteit met het board:** voeg in [TicketMetaContent.tsx](../../src/components/ticket-detail/TicketMetaContent.tsx) een "Change reverted"-toast + `reportClientError` toe aan de 8 edit-handlers, zodat ik weet dat het faalde en de dev de route/status kan terugvinden. Hergebruik het toast-patroon van het board.
3. **Validatie-fouten loggen:** in [request-parser.ts](../../src/lib/request-parser.ts) en [api-response.ts](../../src/lib/api-response.ts) een `logger.warn` op het 400-pad met de route-tag en de **veldnamen + aantal** van de zod-issues (geen waarden, om geen secrets te lekken).
4. **Eerlijke statuscode voor handmatige runs:** in [scheduler.ts](../../src/lib/scheduler.ts) `runTaskNow` een `logger.error` toevoegen (spiegel `tick()` op :188); de route [run/[name]/route.ts](../../src/app/api/scheduler/run/[name]/route.ts) laat een 500 teruggeven wanneer `result.error` aanwezig is, i.p.v. 200 "ran:true".

## Acceptance Criteria

- [x] Een mislukte refinement-notitie/-status-write wordt gelogd (server-zichtbaar via de sink) én toont een toast; geen `.catch(() => {})` meer op gebruikersdata-writes.
- [x] De 8 ticket-detail edit-handlers tonen bij mislukken een "Change reverted"-toast en rapporteren de fout (pariteit met het board).
- [x] Validatie-/bad-body-400's loggen de route + veldnamen + aantal issues (geen waarden) op `warn`.
- [x] Een mislukte handmatige scheduler-run logt de fout en geeft HTTP 500 terug (niet 200 "ran:true").
- [x] Geen PII/secrets in de gelogde validatie-info of de doorgestuurde fout.
- [x] Tests dekken: mislukte write logt + toont toast; ticket-detail-toast bij fout; validatie logt paden niet waarden; handmatige run geeft 500 bij fout.
- [x] Toasts/knoppen volgen de bestaande interactie-states (hover/focus-visible/active, `cursor: pointer`; geen `transition-all`).
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## Implementation notes

- Naast de drie genoemde sites in `SessionEndModal.tsx` is ook `handleCommentBlur` (de algemene sessie-comment, PO-data) omgezet van `.catch(() => {})` naar report + toast, zodat de AC "geen `.catch(() => {})` meer op gebruikersdata-writes" echt klopt.
- `persistCurrentIndex` (`RefinementSessionContext.tsx`) houdt bewust een stille catch: dat is navigatie-cursor (welke ticket je bekijkt), geen door de PO ingevoerde data, en elke debounced-persist-fout rapporteren zou ruis geven.

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema B + frontend.
- [Optimistic Updates](../architecture/optimistic-updates.md) — pending-edits-overlay; lees dit vóór wijzigingen aan editbare board/ticket-velden.
