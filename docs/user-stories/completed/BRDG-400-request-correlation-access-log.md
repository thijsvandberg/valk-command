# BRDG-400: Request-correlatie, toegangslog en leesbare logniveaus

**Status:** Done
**Priority:** High
**Type:** Observability
**Execution order:** 3 of 7 (logging-observability reeks)
**Depends on:** BRDG-399 (`instrumentation.ts` bestaat; logger-conventies)
**Unblocks:** koppelt fouten aan verzoeken voor alle latere stories

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema C.

## Description

Als PO wil ik dat een ontwikkelaar de vraag **"er ging iets mis rond 10:15, wat was het?"** uit de log kan beantwoorden: elk verzoek herkenbaar, elke fout koppelbaar aan het verzoek dat hem veroorzaakte, en filterbaar op niveau ("toon alle fouten").

## Why

- Er is geen request-id en geen regel-per-verzoek: normale 200's en 4xx/5xx zijn onzichtbaar, en een 500-regel heeft niets om hem te koppelen aan het verzoek, de gebruiker of de omliggende logregels. ~54 routes geven een 500, ~34 catch-blokken loggen niets.
- Het log-niveau staat niet in de regel: WARN en ERROR zien er identiek uit, dus `grep ERROR` werkt niet.
- Hoogfrequente waarschuwingen (Jira rate-limit) bedelven de echte stacktrace (~150x dezelfde regel).

## Current state (where the pieces are)

- **Middleware** [src/middleware.ts:37-88](../../src/middleware.ts#L37-L88) stuurt `x-bridge-user-id` door maar logt geen verzoek en zet geen correlatie-id.
- **Logger** [src/lib/logger.ts:28-37](../../src/lib/logger.ts#L28-L37): de regel is `tijdstempel [tag] message`; het niveau zit alleen in welke `console`-methode vuurt, niet in de regel. Geen veld voor request-id.
- **Spam:** [src/lib/jira-client.ts:233](../../src/lib/jira-client.ts#L233) rate-limit-warn vuurt per call (zie ~150x in `logs/prod-20260617-140115.log`); de `fields=`-lijst is ~400 tekens en wordt per ticket herhaald.

## Approach

1. **Request-id in middleware:** genereer `crypto.randomUUID()`, zet hem als `x-request-id` op zowel de doorgestuurde request als de response. Sla hem op in een request-context (voorstel: `AsyncLocalStorage` in een `src/lib/request-context.ts`, geïnitialiseerd vroeg per verzoek) zodat server-logs hem automatisch kunnen meenemen.
2. **Niveau-token in de logger:** [logger.ts](../../src/lib/logger.ts) elke regel laten beginnen met het niveau, bv. `2026-06-25 10:15:03 ERROR [tag] ...`, zodat `grep ERROR`/`grep WARN` werkt. Voeg, wanneer een request-context aanwezig is, de `reqId` toe aan de regel.
3. **Toegangslog (één regel per verzoek):** method, pad, status, duur (ms), user-id, request-id. Voorgesteld mechanisme: een dunne wrapper `withRequestLog`/`logResponse` ([src/lib/request-log.ts]) die de standaard wordt voor nieuwe/aangepaste routes, plus de `onRequestError`-haak (uit BRDG-399) uitgebreid met de `reqId` zodat fouten aan de toegangsregel koppelen. Pas de wrapper toe op de meest fout-gevoelige/druk bezochte routes nu, en documenteer hem als de norm. (Volledige dekking is incrementeel; geen retrofit van alle 187 routes in deze story.)
4. **Spam dempen:** de Jira rate-limit-warn aggregeren/throttlen (tel over een venster i.p.v. per call) en de statische `fields=`-lijst inkorten of eenmalig loggen ([jira-client.ts](../../src/lib/jira-client.ts)).

## Open questions

- [x] Mechanisme voor auto-correlatie: `AsyncLocalStorage` (automatisch in elke logregel) vs. `reqId` expliciet meegeven aan catch-logs. **Besloten:** `AsyncLocalStorage` (`src/lib/request-context.ts`) met fallback; de logger voegt `reqId=` alleen toe als de context aanwezig is, anders logt hij als voorheen. De context wordt geactiveerd in de `withRequestLog`-wrapper, niet in de Edge-middleware (daar is ALS niet beschikbaar).
- [x] Toegangslog op `info` (alles) of alleen 4xx/5xx + traag? **Besloten:** alle verzoeken op `info` (laag prod-volume, eenmans-app).

## Acceptance Criteria

- [x] Elk verzoek krijgt een `x-request-id` (response-header) en die id is beschikbaar in server-logs.
- [x] Elke logregel bevat het niveau als token (`DEBUG`/`INFO`/`WARN`/`ERROR`); `grep ERROR` levert alleen fouten op.
- [x] Er is één toegangslogregel per verzoek (method, pad, status, ms, user, reqId) via de gedocumenteerde wrapper; toegepast op de fout-gevoelige routes (`/api/tickets`, `/api/workspace-tasks`, `/api/jira/sync-incremental`, `/api/client-error`) en beschreven als de norm in `docs/architecture/api-routes.md`.
- [x] Een fout (`onRequestError` of catch-log) bevat dezelfde `reqId`, zodat hij aan de toegangsregel te koppelen is.
- [x] De Jira rate-limit-warn wordt geaggregeerd/gethrottld (één regel per 60s-venster + tellertje); de `fields=`-lijst wordt in logregels ingekort tot een count (`redactJiraPath`); de echte stacktrace wordt niet meer bedolven.
- [x] Tests dekken: request-id gegenereerd + op response; niveau-token in de regel; reqId in de regel bij actieve context; toegangsregel-formaat; reqId in `onRequestError`; throttle dedupt de rate-limit-warn; `fields=`-truncatie.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema C.
- [API Routes](../architecture/api-routes.md) — routeconventies.
