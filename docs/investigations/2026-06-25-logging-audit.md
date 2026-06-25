# Logging-audit: kunnen we fouten op productie (:3101) onderzoeken?

Datum: 2026-06-25
Type: ad-hoc codebase-onderzoek
Methode: parallelle audit (35 agents) over 6 deelgebieden, elk gat adversarieel geverifieerd tegen de echte code. 29 bevindingen bevestigd, 0 weerlegd; meerdere zijn tijdens verificatie van "hoog" naar "midden" bijgesteld.

## Korte conclusie

Het server-side fundament is verrassend goed. Maar voor het *echte* doel ("er ging iets mis rond 10:15, wat was het?") schiet de logging op drie punten structureel tekort:

1. **Fouten in het scherm (client-side) zijn vrijwel onzichtbaar op de server.** Bridge is een client-zware app (board, ticket-edits, chat). Een fout daar landt alleen in de browserconsole van de PO, nooit in `logs/prod-*.log`. Dit is het grootste gat.
2. **Sommige fouten worden volledig ingeslikt.** Op een paar centrale plekken verdwijnt een fout zonder enig spoor: geen stacktrace, geen melding, soms zelfs een HTTP 200 "gelukt".
3. **Je kunt een fout niet koppelen aan het verzoek of het moment.** Er is geen request-id en geen regel-per-verzoek, en het log-niveau (WARN/ERROR) staat niet in de regel. Zoeken op "alle fouten van het afgelopen uur" kan niet.

Niets hiervan is een ramp op een eenmans-app, maar samen maken ze "PO meldt iets, dev kijkt in de log" vaak een doodlopende weg.

---

## Feiten over het logbestand (locatie, isolatie, retentie)

- **Locatie:** `logs/` in de projectmap (`PROD_LOG_DIR` wijst standaard naar `$ROOT/logs`). Het staat dus fysiek binnen het project, maar is **gitignored** (`.gitignore`: "prod server logs (local only)"), dus niet in git.
- **Isolatie:** het bevat **alleen de output van het ene `next start --port 3101`-proces**. De `tee` vangt enkel stdout/stderr van dat proces (en z'n kinderen). Andere lokaal draaiende apps (valk-agent, de dev-server op :3100) schrijven naar hun eigen terminal/bestanden en lekken hier niet in. Elke (her)start maakt een nieuw bestand `prod-<timestamp>.log`.
- **Retentie:** opschoning gebeurt **bij elke (her)start** van prod: bewaar de laatste 15 bestanden (`PROD_LOG_KEEP=15`) en gooi alles ouder dan 14 dagen weg (`PROD_LOG_MAX_AGE_DAYS=14`); de strengste van de twee wint. Beide instelbaar via env. Let op: opschonen gebeurt alleen bij een start, dus zonder herstart blijven oude bestanden staan tot de volgende start.

---

## Wat al goed is (en moet blijven)

- **Productie-output wordt bewaard.** [tools/scripts/start-prod.sh](../../tools/scripts/start-prod.sh) schrijft alle stdout/stderr van `next start --port 3101` naar een getimestampte `logs/prod-*.log`, met automatische opschoning (laatste 15, max 14 dagen). Een crash die door de terminal scrolt is dus terug te vinden.
- **Eén consistente server-logger.** [src/lib/logger.ts](../../src/lib/logger.ts) zet een tijdstempel + `[tag]` voor elke regel, met niveaus debug/info/warn/error. ~95% van het bewuste loggen loopt hierlangs, dus `grep '[jira-client]'` filtert netjes per subsysteem. Geen rauwe `console.*` in routes.
- **Echte stacktraces bereiken het bestand** voor afgevangen fouten (de logger krijgt het ruwe error-object mee).
- **De best-gelogde gebieden:** de Jira-client (status + body + pad bij elke fout, retries met teller), de agent/workspace-proxy (gestructureerde retry-logs met foutcodes), en de scheduler bij *harde* fouten (logt + maakt een notificatie aan).
- **Geen secrets in de logs.** Tokens/wachtwoorden/e-mails worden niet gelogd; alleen ticket-keys en Jira-foutbodies.

---

## De gaten, gegroepeerd per thema (impact, niet techniek)

### Thema A - Client-side fouten zijn onzichtbaar op de server (grootste gat)
Bridge's belangrijkste schermen (board, ticket-detail, chat) draaien in de browser. De logger is bewust `server-only`, en er is **geen kanaal van browser naar server**: geen `/api/client-error`-endpoint, geen globale `window.onerror`/`unhandledrejection`-handler, geen foutmelding-doorgifte in SWR.

Gevolg:
- De error-boundaries ([global-error.tsx](../../src/app/global-error.tsx), [(app)/error.tsx](../../src/app/(app)/error.tsx)) doen alleen `console.error` in de browser. Het "Something went wrong"-scherm laat geen enkel spoor achter op de server, ook de `error.digest` (juist bedoeld om aan een serverregel te koppelen) wordt weggegooid.
- Op ticket-detail rollen mislukte veld-edits stil terug met alleen `console.error("Operation failed:", ...)` en zonder toast ([TicketMetaContent.tsx](../../src/components/ticket-detail/TicketMetaContent.tsx)). De PO ziet de waarde terugspringen en denkt "het slaat niet op"; de dev heeft niets om op te zoeken. (Het board doet dit wél goed met een "Change reverted"-toast, dus het is inconsistentie, geen ontwerp.)
- Story-writer- en chat-acties loggen ook alleen naar de browserconsole.

### Thema B - Fouten die volledig worden ingeslikt
- **Centrale service-foutafhandeling slikt onbekende fouten in.** [handle-service-error.ts](../../src/services/handle-service-error.ts) geeft voor elke niet-herkende fout (incl. *alle* database-fouten: locked db, constraint-schending) een kale `500 "Internal server error"` terug en logt het error-object **nergens**. Dit raakt ~13 routes. De `start-prod.sh` bestaat juist om stacktraces te bewaren; deze plek verslaat dat doel.
- **Echte gebruikersdata wordt weggeschreven met `.catch(() => {})`.** In de refinement-sessie ([SessionEndModal.tsx](../../src/components/refinement-session/SessionEndModal.tsx), [RefinementSessionContext.tsx](../../src/contexts/RefinementSessionContext.tsx)) worden PO-notities en sessie-status zo opgeslagen. Mislukt het, dan is de notitie weg en blijft de sessie eeuwig "in_progress", zonder enig spoor. "Mijn notities van gisteren zijn verdwenen" wordt onbewijsbaar.
- **Validatie-/bad-body-fouten worden stil ge-400't.** [request-parser.ts](../../src/lib/request-parser.ts) en [api-response.ts](../../src/lib/api-response.ts) loggen niets. 0 van de ~80 validerende routes logt welk veld faalde. "Hij blijft mijn verzoek weigeren" is server-side niet te diagnosticeren.
- **Handmatige scheduler-runs melden 200 "gelukt" bij een fout.** [scheduler.ts](../../src/lib/scheduler.ts) `runTaskNow` vangt de fout, slaat hem op, maar logt niet (anders dan de automatische `tick()`), en de route geeft `200 {ran:true}` terug.

### Thema C - Een fout is niet te koppelen aan verzoek of moment
- **Geen request-id en geen toegangslog.** [middleware.ts](../../src/middleware.ts) logt niets per verzoek. Normale 200's en 4xx/5xx zijn onzichtbaar; een 500-regel heeft geen id om hem te koppelen aan het verzoek, de gebruiker of de omliggende logregels. ~54 routes geven een 500, ~34 catch-blokken loggen helemaal niets.
- **Geen niveau-token in de regel.** WARN en ERROR zien er in het bestand identiek uit. `grep ERROR` werkt niet; je kunt alleen op tag of giswerk-tekst zoeken. Bovendien spamt de Jira rate-limit-warning ~150x dezelfde regel en wordt de echte stacktrace eronder bedolven.
- **Geen `instrumentation.ts` en geen eigen crash-handlers.** Geen `onRequestError` (zou elke route in één klap context geven) en geen `process.on('uncaughtException'/'unhandledRejection')`. Fatale Next.js-fouten verschijnen zonder tijdstempel en zonder route; `start-prod.sh` heeft geen auto-restart, dus een proces-killende fout legt de server stil zonder herstel.

### Thema D - Achtergrondtaken falen in stilte
- **Scheduler logt alleen harde fouten.** Geen start/eind/duur per taak, geen log bij overgeslagen taken ("Jira niet geconfigureerd", "budget op"). "De sync draait niet meer" is uit de log niet te reconstrueren. (Lazy-cron draait op een browser-tick: tab dicht = niets draait = geen log.)
- **Agent-SSE gooit de fout-body weg.** Bij een mislukte achtergrond-agenttaak ([task-stream-handler.ts](../../src/lib/task-stream-handler.ts)) wordt alleen `Stream failed: HTTP 500` bewaard; de uitleg van de agent (auth, foute skill-arg, crash) wordt niet gelezen. Je weet *dat* het faalde, niet *waarom*.
- **Transport-oorzaak van agent-fouten wordt niet gelogd.** [agent-fetch.ts](../../src/lib/agent-fetch.ts) classificeert naar "Cannot reach workspace" maar logt de echte oorzaak (poort/cert/DNS/refused) niet.
- **`after()`-achtergrondjobs hebben geen foutafhandeling.** Een DB-fout in de capture-flow wordt een context-loze unhandled rejection en laat de taak eeuwig op "running" staan.
- **Bitbucket/http-client loggen niets bij non-2xx** (of alleen op info-niveau). Een verlopen app-password (401) ziet er in de log identiek uit als een tijdelijke hapering.

### Thema F - Trage queries: meten kan, maar het net is te klein en de uitkomst onzichtbaar
Er bestaat al een mechanisme: [query-timer.ts](../../src/lib/query-timer.ts) `timedQuery` logt een `[slow-query]`-WARN bij >100ms en houdt in-memory aggregaten bij (gemiddelde/max/aantal-traag per label). Maar:
- **Te weinig dekking.** Het is op slechts ~3 plekken aangesloten (van ~791 query-aanroepen): de tickets-route en de ticket-detail-builder. De rest van de queries wordt niet gemeten, dus een trage query buiten die paden zie je nooit.
- **Aggregaten zijn onzichtbaar.** `getQueryStats()` (gemiddelde/max/slowCount per label) wordt nergens via een endpoint of UI getoond, en de cijfers resetten bij elke herstart. "Welke query is structureel traag?" kun je nu niet opvragen.
- **Geen query-identiteit.** Het label wordt met de hand meegegeven (bv. "GET /api/tickets"), niet de echte SQL/parameters. Om een trage query op te *lossen* wil je weten welke query en idealiter de SQL erbij.

### Thema E - Opstart- en config-problemen geven geen signaal
- **DB-init faalt zonder duidelijk signaal.** [db/index.ts](../../src/db/index.ts) opent de DB en draait migraties lazy bij het eerste verzoek, zonder try/catch en zonder "db ready"-regel. Een kapotte DB verschijnt als een willekeurige 500, niet als een opstartfout.
- **Ontbrekende secrets falen stil.** [env.ts](../../src/lib/env.ts) geeft vrijwel alles `.default("")`, dus een vergeten token slipt erdoor; de feature geeft gewoon lege data terug. Een config-fout lijkt op een feature-bug.
- **Middleware logt niets bij 401/403/413.** "Ik word steeds naar login gegooid" of een 403 org-mismatch laat geen spoor na.

---

## Voorgesteld plan (gefaseerd op impact)

### Fase 1 - Maak het onzichtbare zichtbaar (grootste effect, weinig plekken)
1. **Client-error-sink.** Eén `POST /api/client-error`-route die via de bestaande server-logger met tag `[client]` wegschrijft. Aangeroepen vanuit: een globale `window.onerror`/`unhandledrejection`-handler, beide error-boundaries (incl. `digest`), en SWR `onError`. Met throttling/dedup tegen log-floods. -> hele klasse onzichtbare fouten wordt opeens grep-baar.
2. **Log in `handleServiceError`.** Eén plek aanpassen (`logger.error` in de onbekende-fout-tak) fixt ~13 routes en alle stille DB-fouten in één keer.
3. **`instrumentation.ts` toevoegen** met `onRequestError` (elke route krijgt pad/method/context) en `process.on`-crash-handlers via de logger (gefilterd voor verwachte client-aborts/ECONNRESET).

### Fase 2 - Maak fouten koppelbaar en stop stille data-verlies
4. **Request-id + één toegangslogregel per verzoek** (method, pad, status, duur, user-id, request-id) vanuit middleware/instrumentation; request-id meenemen in catch-logs.
5. **Niveau-token in de logregel** (`WARN`/`ERROR`) zodat `grep ERROR` werkt; de Jira rate-limit-spam throttlen/aggregeren en de lange `fields=`-lijst inkorten.
6. **Stille `.catch(() => {})` op gebruikersdata vervangen** door log + toast (refinement-notities, sessie-status), zodat de PO weet dat opslaan faalde.
7. **Validatie-400's loggen** (alleen veldnamen + aantal, geen waarden) met een route-tag.

### Fase 3 - Achtergrond, performance en robuustheid
8. **Scheduler:** info-regel per gedraaide taak met naam + duur + compacte uitkomst (ran/skipped/error).
8b. **Trage queries vindbaar en oplosbaar maken:** `timedQuery` om de centrale DB-laag heen leggen i.p.v. handmatig per route (brede dekking), de echte query-identiteit/SQL meeloggen, en de aggregaten (`getQueryStats`) ontsluiten via een endpoint of klein dashboard-widget zodat structureel trage queries opvraagbaar worden i.p.v. te resetten bij herstart.
9. **Agent-SSE:** fout-body lezen en (ingekort) loggen; transport-oorzaak in `agent-fetch` loggen; mid-stream pipe-fout loggen.
10. **`after()`-jobs in try/catch** met taak-context; een reconciler die vastgelopen "running"-rijen op "failed" zet.
11. **Bitbucket/http-client** op warn-niveau loggen bij non-2xx (incl. ingekorte body); aanhoudende 401/403 als auth-probleem onderscheiden.
12. **Boot-log:** "db ready (migrations applied)", duidelijke fout bij DB-open/migratie, en één warn-regel met ontbrekende integratie-credentials.
13. **Middleware:** warn-regel bij 401/403/413 (let op: Edge-runtime, dus `console.warn` i.p.v. de server-only logger).

### Lage prioriteit (opruimen, kan meeliften)
- Routes met `catch {}` zonder error-binding netjes loggen.
- Stille `.catch(() => {})` op achtergrond-fetches via een lichte client-logger op warn.
- Server-fallbacks `catch { return null }` die "fout" en "niet gevonden" door elkaar halen.
- `logActivity` eigen try/catch geven zodat een mislukte audit-write niet stil verdwijnt.
- SSE live-update-kanaal: na N mislukte reconnects een (throttled) signaal + "verbinding verbroken"-indicator.

---

## Aanbevolen aanpak
De Fase 1-items zijn een klein aantal centrale plekken met disproportioneel grote winst (de client-sink + `handleServiceError` + `instrumentation.ts` dekken samen de meerderheid van de "geen spoor"-gevallen af).

## Uitwerking in stories (uitvoervolgorde)

Uitgewerkt als 7 opeenvolgend uitvoerbare user stories, elk met een implementatieplan (`## Approach`) en eigen tests in de acceptatiecriteria. Tussentijds testen gebeurt automatisch via de `PostToolUse`-hook (`npm run test` na elke source-edit) plus de per-story testopdracht.

| # | Story | Thema | Hangt af van |
|---|-------|-------|--------------|
| 1 | [BRDG-398 Client-error sink](../user-stories/BRDG-398-client-error-sink.md) | A | - |
| 2 | [BRDG-399 instrumentation.ts + crash-vangnet + swallow-fix](../user-stories/BRDG-399-instrumentation-crash-safety.md) | B, C | - |
| 3 | [BRDG-400 Request-id + toegangslog + niveaus](../user-stories/BRDG-400-request-correlation-access-log.md) | C | 399 |
| 4 | [BRDG-401 Stop stil dataverlies + validatie-logging](../user-stories/BRDG-401-stop-silent-data-loss.md) | B, frontend | 398, 399 |
| 5 | [BRDG-402 Achtergrondtaken observeerbaar](../user-stories/BRDG-402-background-task-observability.md) | D | 399 |
| 6 | [BRDG-403 Opstart- en config-signalen](../user-stories/BRDG-403-boot-and-config-signals.md) | E | 399 |
| 7 | [BRDG-404 Trage queries vindbaar/oplosbaar](../user-stories/BRDG-404-slow-query-visibility.md) | F | (399) |

De volgorde respecteert de afhankelijkheden: BRDG-399 levert de `instrumentation.ts` en logger-conventies waar 400/401/402/403 op leunen; BRDG-398 levert de client-sink die 401 gebruikt. 402, 403 en 404 zijn onderling onafhankelijk en kunnen in elke volgorde na 399.

### Status: alle 7 stories opgeleverd en geverifieerd (2026-06-25)

De volledige reeks is sequentieel geïmplementeerd en na elke story onafhankelijk geverifieerd (lint, typecheck, volledige testsuite, build). Eindstaat: alle gates groen; testsuite gegroeid van 6615 (baseline) naar 6818 tests. Rooktest bij dev-boot bevestigt het live resultaat: `INFO [db] ready (migrations applied)` (niveau-token + boot-log werken). Wijzigingen staan in de working tree (nog niet gecommit). Om het nieuwe loggen in de lokale prod op :3101 te zien moet `npm run start` opnieuw worden gestart.
