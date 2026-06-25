# BRDG-403: Opstart- en config-signalen (DB-boot, env, middleware)

**Status:** Done
**Priority:** Medium
**Type:** Observability
**Execution order:** 6 of 7 (logging-observability reeks)
**Depends on:** BRDG-399 (`instrumentation.ts` voor eager init / boot-haak)

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema E.

## Description

Als PO wil ik dat **opstart- en configuratieproblemen meteen een duidelijk signaal geven** in de log, in plaats van later als een vage 500 of "lege data" op te duiken. Een vergeten token of een kapotte database moet bij het starten zichtbaar zijn, niet als mysterieuze feature-bug.

## Why

- De DB wordt lazy geopend bij het eerste verzoek, zonder try/catch en zonder "db ready"-regel. Een kapotte DB verschijnt als een willekeurige 500, niet als opstartfout.
- Ontbrekende secrets falen stil: vrijwel alles heeft `.default("")`, dus een vergeten token slipt erdoor en de feature geeft gewoon lege data terug. Een config-fout lijkt op een feature-bug.
- Middleware logt niets bij 401/403/413: "ik word steeds naar login gegooid" of een 403 org-mismatch laat geen spoor na.

## Current state (where the pieces are)

- **DB-init:** [src/db/index.ts:21](../../src/db/index.ts#L21) `new Database(env.DB_PATH)` + `migrate(...)` in `getDb()` zonder try/catch en zonder logger; de geëxporteerde `db` is een Proxy ([:46](../../src/db/index.ts#L46)) die `getDb()` lazy aanroept bij het eerste property-access. Geen "db ready"-regel.
- **Env:** [src/lib/env.ts:9](../../src/lib/env.ts#L9) e.v. gebruikt `.default("")` voor `JIRA_API_TOKEN`, `VALK_AGENT_KEY`, `BITBUCKET_*`, `CONFLUENCE_*`, `CLERK_ORG_ID`; `parseEnv()` faalt alleen op een echte zod-fout. [src/lib/agent-proxy.ts:12](../../src/lib/agent-proxy.ts#L12) gooit pas lazy bij de eerste agent-call.
- **Middleware:** [src/middleware.ts:44-88](../../src/middleware.ts#L44-L88) geeft 413 (body-cap), 401 (geen userId), 403 (org-mismatch) en redirects zonder enige logregel; importeert geen logger. (Let op: middleware draait in de Edge-runtime, dus de `server-only` logger kan hier niet; gebruik `console.warn`.)

## Approach

1. **DB-boot zichtbaar maken:** in [db/index.ts](../../src/db/index.ts) het connect+migrate-blok in try/catch zetten → `logger.error("db", "open/migrate failed", { DB_PATH }, err)` vóór rethrow, en bij succes `logger.info("db", "ready (migrations applied)")`. Eager-initialiseer de DB vanuit `register()` in [instrumentation.ts](../../src/instrumentation.ts) (uit BRDG-399), zodat een fout en de ready-regel bij boot verschijnen, niet midden in een verzoek.
2. **Config-status bij boot:** vanuit `register()`/[env.ts](../../src/lib/env.ts) één `logger.warn`-regel die de lege integratie-credentials opsomt (bv. "Jira disabled: JIRA_API_TOKEN missing"). Niet hard falen; de gedegradeerde staat expliciet maken in de log.
3. **Middleware-afwijzingen loggen:** in [middleware.ts](../../src/middleware.ts) een `console.warn` per afwijzing (401/403/413) met method + pad + reden (+ content-length voor 413, org-mismatch voor 403). Bewust `console.warn` i.p.v. de server-only logger vanwege de Edge-runtime; output landt alsnog in de getee'de prod-log.

## Open questions

- [x] Eager DB-init bij boot: altijd, of alleen in productie? **Besloten: altijd**, geguard op de Node-runtime in `register()` (de ready/fail-regel is ook in dev nuttig). Bevestigd in dev: `INFO [db] ready (migrations applied)` verschijnt bij boot.

## Acceptance Criteria

- [x] Bij boot verschijnt een "db ready (migrations applied)"-regel; een mislukte DB-open/migratie logt een duidelijke fout met `DB_PATH` bij boot (niet als willekeurige latere 500).
- [x] Bij boot logt één `warn`-regel welke integratie-credentials leeg zijn (gedegradeerde staat expliciet); de app faalt hier niet hard op.
- [x] Middleware logt elke 401/403/413-afwijzing met method + pad + reden; de 403 org-mismatch en 413 bevatten hun specifieke detail.
- [x] Geen secrets in de boot-/config-regels (alleen namen van ontbrekende variabelen, geen waarden).
- [x] Tests dekken: DB-init-fout logt `DB_PATH`; boot-warn somt ontbrekende creds op; middleware logt elke afwijzingstak.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema E.
- [Database Schema](../architecture/database-schema.md) — DB-client/migraties.
