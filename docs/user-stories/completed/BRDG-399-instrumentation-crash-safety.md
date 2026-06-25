# BRDG-399: Server-side foutcontext en crash-vangnet (instrumentation.ts + centrale swallow-fix)

**Status:** Done
**Priority:** High
**Type:** Observability (foundation)
**Execution order:** 2 of 7 (logging-observability reeks)
**Depends on:** niets (kan na BRDG-398)
**Unblocks:** BRDG-400, BRDG-401, BRDG-403 (allen leunen op `instrumentation.ts` en/of de logger-conventies)

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema B + C.

## Description

Als PO wil ik dat **elke server-fout een spoor met context achterlaat** en dat een fatale fout de server niet stil omlegt. Vandaag verdwijnen alle database-fouten op één centrale plek zonder spoor, en fatale Next.js-fouten verschijnen zonder tijdstempel of route.

## Why

- De centrale service-foutafhandeling slikt onbekende fouten in: een kale 500 zonder enige logregel. Dat raakt elke route die erlangs loopt, inclusief alle DB-fouten (locked db, constraint-schending).
- Er is geen `instrumentation.ts` en geen eigen crash-handler. Fatale fouten worden door Next.js geprint zonder tijdstempel/route en kunnen het proces omleggen; `start-prod.sh` heeft geen auto-restart.
- Eén `onRequestError`-haak geeft **elke** route in één keer pad/method-context, zonder 187 bestanden aan te raken.

## Current state (where the pieces are)

- **Geen `instrumentation.ts`** in `src/` of root; geen `onRequestError`; geen `process.on(...)` ergens in `src/`. (Next 15.5.18 ondersteunt de stabiele `onRequestError`-haak.)
- **Centrale swallow:** [src/services/handle-service-error.ts:15](../../src/services/handle-service-error.ts#L15) geeft voor elke niet-`ServiceError` `{error:"Internal server error"}` (500) terug en logt het `err`-argument nooit. ~13 call-sites (o.a. [placeholders/route.ts:22](../../src/app/api/placeholders/route.ts#L22), local-edits, metadata, promote) sturen `err` rechtstreeks hierheen. Omdat de catch een `NextResponse` teruggeeft, logt ook Next.js niets meer.
- **Geen proces-vangnet:** waargenomen in de logs als `uncaughtException: [Error: aborted] { code: 'ECONNRESET' }` en `Error: failed to pipe response` (van de SSE-stream-route), zonder tijdstempel/route (o.a. `logs/prod-20260623-101156.log`, `logs/prod-20260624-082656.log`).

## Approach

1. **`src/instrumentation.ts` toevoegen:**
   - Exporteer `onRequestError(err, request, context)` → `logger.error("request-error", \`${method} ${path}\`, err)` met, waar beschikbaar, de `digest` en de user-id uit `x-bridge-user-id`.
   - `register()` installeert `process.on('uncaughtException')` en `process.on('unhandledRejection')`, gerouteerd via de logger (zodat ze tijdstempel + tag krijgen). **Filter verwachte client-aborts** (`ECONNRESET`, `"aborted"`, SSE-stream-aborts) naar `warn` of negeer ze, zodat ze de echte fouten niet bedelven.
2. **`handle-service-error.ts` laten loggen:** in de onbekende-fout-tak `logger.error("service", "unhandled error", err)` vóór de 500; in de `ServiceError`-tak `logger.warn("service", ...)` met `code`/`statusCode`. Dit geeft alle ~13 routes in één klap een stacktrace in de prod-log.
3. **Low-priority opruiming (mag meeliften):** de handvol routes met `} catch { return ...500 }` zonder error-binding ([src/app/api/search/local/route.ts:42-44](../../src/app/api/search/local/route.ts#L42-L44) e.a.) een binding + `logger.error(tag, msg, err)` geven, zodat die niet meer stil falen.

## Open questions

- [x] Precieze filterlijst voor "verwachte" aborts (ECONNRESET, `ResponseAborted`, SSE-client-disconnect). Voorstel: loggen op `warn` met korte boodschap, geen stacktrace. **Beslist:** gefilterd op `code` (`ECONNRESET`, `ERR_STREAM_PREMATURE_CLOSE`), `name` (`AbortError`, `ResponseAborted`) en message-substrings (`aborted`, `request aborted`, `failed to pipe response`, `the stream has been aborted`); gelogd op `warn` met korte boodschap, geen stacktrace.

## Acceptance Criteria

- [x] `src/instrumentation.ts` bestaat; `onRequestError` logt elke server-fout met method + pad (+ digest/user waar beschikbaar) via de logger.
- [x] `process.on('uncaughtException')` en `('unhandledRejection')` loggen via de logger (met tijdstempel + tag); verwachte client-aborts worden op `warn` gelogd of gefilterd, niet als fatale stacktrace.
- [x] `handleServiceError` logt onbekende fouten (incl. DB-fouten) met stacktrace; een DB-constraint/lock-fout op een van de ~13 routes verschijnt nu in `logs/prod-*.log`.
- [x] `ServiceError`-gevallen loggen op `warn` met code/statusCode (geen ruis als fatale fout).
- [x] Routes met een lege `catch {}`-zonder-binding loggen voortaan de oorzaak. (De vier echte stille-500-swallows: `search/local`, `search/local/keys`, `story-writer/finalize-draft`, `story-writer/logs/[taskId]`. De overige lege catches geven bewust een fallback-success-response of zijn geen error-pad.)
- [x] Tests dekken: `onRequestError` logt pad+method; `handleServiceError` logt onbekende fout maar behandelt `ServiceError` als `warn`; crash-handler filtert ECONNRESET.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema B + C.
- [Next.js instrumentation / onRequestError] — stabiel in Next 15.5.18.
