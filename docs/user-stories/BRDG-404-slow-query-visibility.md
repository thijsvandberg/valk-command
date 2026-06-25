# BRDG-404: Trage queries vindbaar en oplosbaar maken

**Status:** Done
**Priority:** Medium
**Type:** Observability + Performance
**Execution order:** 7 of 7 (logging-observability reeks)
**Depends on:** niets strikt (kan na BRDG-399 voor de logger-conventies); staat als laatste in de reeks

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema F.

## Description

Als PO wil ik **trage database-queries kunnen vinden en daarna onderzoeken/oplossen**. Vandaag bestaat er een meet-mechanisme, maar het hangt aan slechts ~3 plekken, de cijfers zijn nergens zichtbaar en resetten bij elke herstart, en je ziet niet wélke query traag is.

## Why

- Het slow-query-net is te klein: `timedQuery` hangt aan ~3 van de ~791 query-plekken, dus een trage query buiten die paden zie je nooit.
- De aggregaten (`getQueryStats`: gemiddelde/max/aantal-traag per label) zitten alleen in het geheugen, worden nergens getoond en resetten bij herstart. "Welke query is structureel traag?" kun je nu niet opvragen.
- Het label wordt met de hand meegegeven ("GET /api/tickets"), niet de echte SQL. Om een trage query op te lossen wil je weten wélke query (en idealiter de SQL).

## Current state (where the pieces are)

- **Timer:** [src/lib/query-timer.ts](../../src/lib/query-timer.ts) — `timedQuery` logt `[slow-query]` boven 100ms ([:29-30](../../src/lib/query-timer.ts#L29-L30)) en houdt in-memory aggregaten ([:33-53](../../src/lib/query-timer.ts#L33-L53), `MAX_STATS_ENTRIES=200`); `getQueryStats()` ([:58-63](../../src/lib/query-timer.ts#L58-L63)) geeft avg/max/slowCount per label.
- **Te weinig dekking:** `timedQuery` wordt maar op ~3 plekken aangeroepen ([src/lib/ticket-detail-builder.ts](../../src/lib/ticket-detail-builder.ts), [src/app/api/tickets/route.ts](../../src/app/api/tickets/route.ts)). De ~791 overige query-aanroepen worden niet gemeten.
- **Onzichtbaar:** `getQueryStats()` wordt nergens via een endpoint of UI ontsloten; de cijfers resetten bij elke proces-herstart.
- **DB-client:** [src/db/index.ts](../../src/db/index.ts) — Drizzle + better-sqlite3 (Drizzle ondersteunt een `logger`-optie op de client, bruikbaar als centraal meetpunt).

## Approach

1. **Brede dekking via de centrale DB-laag:** meet queries automatisch op de Drizzle-client (bv. via de Drizzle `logger`-optie of een dunne wrapper in [db/index.ts](../../src/db/index.ts)) i.p.v. handmatig per route. Leg een stabiele query-identiteit vast (operatie + tabel, en waar mogelijk de aanroepende route) en de **SQL-tekst (ingekort, zonder gebonden waarden** om geen data te lekken).
2. **Aggregaten ontsluiten:** voeg `GET /api/dev/query-stats` toe (achter de bestaande dev-bypass/auth) die `getQueryStats()` teruggeeft, plus een klein diagnostics-widget (in een bestaande settings-/dev-view) dat de traagste queries toont (avg/max/slowCount/laatste). Overweeg de stats periodiek te persisteren zodat ze een herstart overleven.
3. **Logregel actionable maken:** behoud de `[slow-query]`-warn maar voeg de query-identiteit toe, zodat een gelogde trage query direct te herleiden is naar de plek in de code.

## Open questions

- [x] Drempel blijft 100ms, of per query-soort instelbaar? **Besloten:** 100ms standaard, env-overschrijfbaar via `QUERY_SLOW_MS`.
- [x] Stats persisteren (overleeft herstart) of in-memory laten? **Besloten:** in-memory + endpoint; persistentie niet nodig gebleken.
- [x] Waar komt het widget? **Besloten:** Settings → Integrations (bestaande diagnostics-view), geen nieuw topmenu-item.

## Acceptance Criteria

- [x] Queries worden automatisch gemeten via de centrale DB-laag; een trage query buiten de huidige ~3 plekken wordt nu ook gelogd.
- [x] Een gelogde `[slow-query]`-regel bevat de query-identiteit (en ingekorte SQL zonder waarden), zodat hij herleidbaar is.
- [x] `GET /api/dev/query-stats` geeft de aggregaten terug; een klein widget toont de traagste queries (avg/max/slowCount).
- [x] Geen gebonden waarden/PII in de gelogde of getoonde SQL.
- [x] Tests dekken: een query boven de drempel logt met identiteit; het stats-endpoint geeft aggregaten; SQL-inkorting laat geen waarden zien.
- [x] Widget-controls volgen de interactie-states (hover/focus-visible/active, `cursor: pointer`; geen `transition-all`).
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema F.
- [Client Data & Memory](../architecture/client-data-and-memory.md) — begrensde fetches; relevant voor het stats-endpoint/widget.
- [Database Schema](../architecture/database-schema.md) — DB-client (Drizzle + better-sqlite3).
