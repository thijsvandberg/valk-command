# BRDG-398: Client-side foutrapportage naar de server (client-error sink)

**Status:** Done
**Priority:** High
**Type:** Observability (foundation)
**Execution order:** 1 of 7 (logging-observability reeks)
**Depends on:** niets (start hier)
**Unblocks:** BRDG-401 (gebruikt deze sink voor save-fouten)

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema A.

## Description

Als PO wil ik dat fouten die in het scherm gebeuren (board, ticket-detail, chat) **terechtkomen in de productie-log** (`logs/prod-*.log`), zodat een ontwikkelaar ze kan onderzoeken. Vandaag landen client-side fouten alleen in mijn browserconsole en zijn ze server-side volledig onzichtbaar.

## Why

- De belangrijkste schermen van Bridge draaien in de browser. De logger is bewust `server-only` ([src/lib/logger.ts:1](../../src/lib/logger.ts#L1)), dus er is geen enkel pad voor een client-fout naar de server.
- De meeste echte client-fouten zijn async (een fetch in een klik-handler, een SSE-parse, een achtergrond-sync) en raken nooit een React error-boundary, dus zelfs het `console.error`-pad vuurt niet.
- Dit is het grootste gat uit de audit: een hele klasse gebruikersfouten ("ik bewaarde iets en het bleef niet staan") laat nul sporen na waar een dev kijkt.

## Current state (where the pieces are)

- **Geen endpoint:** er is geen `/api/client-error` (of vergelijkbaar) en geen telemetrie (geen Sentry/Datadog).
- **Geen globale handler:** geen `window.addEventListener('error')` of `('unhandledrejection')` in `src/` (alleen niet-fout-listeners zoals storage/keydown).
- **Error-boundaries loggen alleen lokaal:** [src/app/global-error.tsx:13-15](../../src/app/global-error.tsx#L13-L15) en [src/app/(app)/error.tsx:13-15](../../src/app/(app)/error.tsx#L13-L15) doen alleen `console.error` in een `useEffect`; de `error.digest` (bedoeld om aan een serverregel te koppelen) wordt weggegooid.
- **SWR heeft geen centrale fout-afhandeling:** [src/components/SWRProvider.tsx:20-32](../../src/components/SWRProvider.tsx#L20-L32) zet wel een fetcher maar geen `onError`.
- **api-client gooit, maar logt niet centraal:** [src/lib/api-client.ts:66-76](../../src/lib/api-client.ts#L66-L76) `apiFetch` gooit een `ApiError` (met status/code/body); elke call-site beslist zelf (en negeert vaak) de fout.

## Approach

1. **Nieuwe route** `POST /api/client-error` ([src/app/api/client-error/route.ts]): valideer met zod een begrensde payload `{ message, stack?, digest?, pathname?, source?, userAgent? }`, cap de grootte, en schrijf via de bestaande logger weg met tag `[client]` (`logger.error("client", ...)`). Server-side throttle/dedup op (message+pathname) zodat een loop de log niet overspoelt. Lees waar mogelijk de user-id uit de `x-bridge-user-id`-header mee.
2. **Globale client-reporter** ([src/components/ClientErrorReporter.tsx], "use client"), gemonteerd in de app-layout: registreert `window.addEventListener('error')` en `('unhandledrejection')` en POST't naar de sink (gebruik `navigator.sendBeacon` voor betrouwbaarheid bij unload). Client-side throttle/dedup.
3. **Gedeelde helper** `reportClientError(context, err)` ([src/lib/client-error.ts]) voor expliciete call-sites (gebruikt door BRDG-401). Houdt het tag/context-veld vast zodat de logregel zegt wélke operatie faalde.
4. **Error-boundaries koppelen:** in [global-error.tsx](../../src/app/global-error.tsx) en [(app)/error.tsx](../../src/app/(app)/error.tsx) de `useEffect` laten doorsturen naar de sink met `message + stack + digest + pathname`; toon de `digest` ook aan de gebruiker zodat die hem kan citeren.
5. **SWR koppelen:** voeg `onError` toe aan de `SWRConfig` in [SWRProvider.tsx](../../src/components/SWRProvider.tsx) die fetch-fouten (met de SWR-key + status) naar dezelfde sink stuurt, met throttle.

## Open questions

- [x] Throttle-venster en dedup-sleutel: max 1 identieke fout per 30s per message+pathname (client- en server-side gelijk).
- [x] Tonen we de `digest` standaard in het "Something went wrong"-scherm, of achter een "details"-toggle? Besloten: klein, kopieerbaar, onder de "Try again"-knop (`ErrorDigest`).

## Acceptance Criteria

- [x] `POST /api/client-error` schrijft een `[client]`-regel naar de server-log met message, stack, digest, pathname en (indien aanwezig) user-id; de payload is begrensd en gevalideerd.
- [x] Een ongevangen client-fout en een unhandled promise-rejection worden automatisch naar de sink gestuurd en verschijnen in `logs/prod-*.log`.
- [x] Beide error-boundaries sturen de fout + `digest` door; de `digest` is zichtbaar/kopieerbaar voor de gebruiker.
- [x] SWR fetch-fouten worden centraal doorgestuurd (met SWR-key + status).
- [x] Throttle/dedup voorkomt dat een herhaalde fout de log overspoelt (zowel client- als server-side).
- [x] De gedeelde `reportClientError`-helper bestaat en is klaar voor gebruik door BRDG-401.
- [x] Geen secrets/PII in de doorgestuurde payload (geen tokens, geen volledige request-bodies).
- [x] Tests dekken: route logt met `[client]`-tag + begrenst payload; throttle dedupt; boundary stuurt digest door; SWR `onError` stuurt door; `sendBeacon`-pad.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## Implementation notes

Artifacts created at the paths later stories rely on:

- `src/app/api/client-error/route.ts` — `POST` handler (handlers-only). Validation, caps, and throttle live in `src/lib/client-error-sink.ts` (`clientErrorSchema`, `shouldThrottle`, size caps) so the route exports only `POST`.
- `src/lib/client-error.ts` — `reportClientError(context, error, extra?)`; sendBeacon-first with fetch+keepalive fallback, client throttle, never throws.
- `src/components/ClientErrorReporter.tsx` — global `error` + `unhandledrejection` listeners; mounted once in `src/app/(app)/layout.tsx`.
- `src/components/ErrorDigest.tsx` — small copyable digest shown under "Try again" in both boundaries.
- Wired: `src/app/global-error.tsx`, `src/app/(app)/error.tsx` (forward + digest), `src/components/SWRProvider.tsx` (`onError` forwards key + status).

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema A.
- [src/lib/logger.ts](../../src/lib/logger.ts) — bestaande server-logger (tag + niveau + tijdstempel).
