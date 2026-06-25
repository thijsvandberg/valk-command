# BRDG-402: Achtergrondtaken observeerbaar (scheduler, agent-SSE, after(), Bitbucket)

**Status:** Done
**Priority:** Medium
**Type:** Observability
**Execution order:** 5 of 7 (logging-observability reeks)
**Depends on:** BRDG-399 (logger-conventies / niveaus)

> Onderdeel van de logging-audit, zie [docs/investigations/2026-06-25-logging-audit.md](../investigations/2026-06-25-logging-audit.md), Thema D.

## Description

Als PO wil ik dat **achtergrondtaken niet in stilte falen of vertragen** (sync, scheduler, agent-taken, Bitbucket), want daar kijkt niemand live mee. Vandaag is "de sync draait niet meer" of "een agent-taak hangt" niet uit de log te reconstrueren, en zie je bij een agent-fout wel *dat* het faalde maar niet *waarom*.

## Why

- De scheduler logt alleen harde fouten: geen start/eind/duur per taak, geen log bij overgeslagen taken. Een trage of overgeslagen taak is onzichtbaar.
- Bij een mislukte achtergrond-agenttaak wordt alleen `Stream failed: HTTP 500` bewaard; de uitleg van de agent (auth, foute skill-arg, crash) wordt weggegooid.
- `after()`-achtergrondjobs hebben geen foutafhandeling: een DB-fout wordt een context-loze unhandled rejection en de taak blijft eeuwig op "running".
- Bitbucket/http-client loggen niets (of alleen op `info`) bij non-2xx; een verlopen app-password (401) ziet er identiek uit als een tijdelijke hapering.

## Current state (where the pieces are)

- **Scheduler:** [src/lib/scheduler.ts:163-203](../../src/lib/scheduler.ts#L163-L203) meet geen duur en logt geen start/eind; enige logregel is `logger.error` op [:188](../../src/lib/scheduler.ts#L188). Skip-paden zonder log: [src/lib/scheduled-tasks.ts:74](../../src/lib/scheduled-tasks.ts#L74) (`Jira not configured`), :569 (`scan disabled`), :593 (`budget exhausted`).
- **Agent-SSE body weggegooid:** [src/lib/task-stream-handler.ts:121-123](../../src/lib/task-stream-handler.ts#L121-L123) zet `Stream failed: HTTP ${res.status}` en roept nooit `res.text()` aan. [src/lib/agent-fetch.ts:179](../../src/lib/agent-fetch.ts#L179) en [:218](../../src/lib/agent-fetch.ts#L218) gooien de ruwe `err` weg na classificatie; `classifyHttpError` gebruikt de body alleen voor >=500. [src/app/api/workspace-tasks/[id]/stream/route.ts:67-71](../../src/app/api/workspace-tasks/[id]/stream/route.ts#L67-L71) slikt mid-stream pipe-fouten in (`.catch(() => {...})`).
- **Ongevangen `after()`:** [src/app/api/workspace-tasks/route.ts:223](../../src/app/api/workspace-tasks/route.ts#L223) en [src/app/api/conversations/[id]/chat-messages/route.ts:81](../../src/app/api/conversations/[id]/chat-messages/route.ts#L81),[:114](../../src/app/api/conversations/[id]/chat-messages/route.ts#L114) spawnen `captureTaskStream` zonder try/catch; de leidende `db.insert` ([task-stream-handler.ts:96-104](../../src/lib/task-stream-handler.ts#L96-L104)) en de DB-writes na het `finally` zitten in geen catch. Geen reconciler zet vastgelopen "running"-rijen op "failed".
- **Bitbucket/http-client:** [src/lib/bitbucket-fetch.ts:52-54](../../src/lib/bitbucket-fetch.ts#L52-L54) logt op `info`; `bbFetchUrl` ([:59-68](../../src/lib/bitbucket-fetch.ts#L59-L68)) en `bbFetchStatus` ([:76-84](../../src/lib/bitbucket-fetch.ts#L76-L84)) loggen niets; [src/lib/pipeline-sync.ts:128-137](../../src/lib/pipeline-sync.ts#L128-L137) slikt throws in; [src/lib/http-client.ts](../../src/lib/http-client.ts) logt nergens.

## Approach

1. **Scheduler-tijdlijn:** in `tick()` ([scheduler.ts](../../src/lib/scheduler.ts)) een `info`-regel per daadwerkelijk gedraaide taak met naam + duur + compacte uitkomst (`ran`/`skipped:reason`/`error`). Optioneel één `debug`-regel per tick met gecheckt/gedraaid/overgeslagen.
2. **Agent-fout met oorzaak:** in [agent-fetch.ts](../../src/lib/agent-fetch.ts) een `logger.warn("agent-fetch","terminal failure",{path,code,cause})` vóór de geclassificeerde return (beide catch-blokken); bewaar (ingekorte) 4xx-body in `classifyHttpError`. In [task-stream-handler.ts](../../src/lib/task-stream-handler.ts): op `!res.ok` `await res.text()` (ingekort) meenemen in `errorMessage` + `logger.warn`. In de stream-proxy ([stream/route.ts](../../src/app/api/workspace-tasks/[id]/stream/route.ts)) de `pipeTo().catch` niet-abort-fouten laten loggen met de task-id.
3. **`after()`-vangnet + reconciler:** wikkel elke `after(async () => ...)`-body in try/catch → `logger.error` met `taskId`/`skillName`/`conversationId`, of wikkel de hele `captureTaskStream`-body zodat de leidende insert en de na-stream-writes gedekt zijn en een mislukte taak altijd op "failed" eindigt. Voeg een reconciler toe (scheduled-task) die te lang op "running" staande `workspaceTask`-rijen op "failed" zet.
4. **Bitbucket/http-client loggen:** [http-client.ts](../../src/lib/http-client.ts) `logger.warn` de uiteindelijke non-ok uitkomst (host, status, code, retryCount) zodat elke client dit erft; verhoog `bbFetch` van `info` naar `warn` met ingekorte body; log `bbFetchUrl`/`bbFetchStatus` op non-2xx; log de `classifyRunDeployment`-catch ([pipeline-sync.ts](../../src/lib/pipeline-sync.ts)). Onderscheid een aanhoudende 401/403 ("Bitbucket auth failing") van een tijdelijke fout.

## Acceptance Criteria

- [x] De scheduler logt per gedraaide taak een regel met naam + duur + compacte uitkomst; overgeslagen taken loggen hun reden.
- [x] Een mislukte agent-taak logt de onderliggende oorzaak (transport-fout of agent-body, ingekort), niet alleen de HTTP-status; mid-stream pipe-fouten worden gelogd met task-id.
- [x] Een fout in een `after()`-achtergrondjob wordt gelogd met task-context, en de taak-rij eindigt op "failed" i.p.v. eeuwig "running"; een reconciler ruimt vastgelopen rijen op.
- [x] Bitbucket/http-client loggen non-2xx op `warn` met (ingekorte) body; een aanhoudende 401/403 is in de log te onderscheiden van een tijdelijke hapering.
- [x] Geen secrets in de gelogde bodies (tokens/Authorization-headers blijven eruit).
- [x] Tests dekken: scheduler logt per taak + skip-reden; agent-fout logt oorzaak; `after()`-fout gelogd + rij op "failed"; `bbFetchUrl` logt non-2xx; http-client warnt op non-ok.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, en `npm run build` slagen.

## Implementation notes

Delivered in four areas (all logging through the shared `src/lib/logger.ts`):

1. **Scheduler timeline** (`src/lib/scheduler.ts`): `tick()` now logs one `info` line per task that runs with name + `durationMs` (via `Date.now()`) + a compact outcome (`ran` / `skipped:<reason>` / `error`) built by `summariseResult()`, plus one `debug` tick-summary line (checked/ran/notDue). A skipped task's `{ skipped, reason }` reason is surfaced. The return value and the existing `logger.error` are unchanged.
2. **Agent failure cause** (`src/lib/agent-fetch.ts`, `src/lib/task-stream-handler.ts`, `src/app/api/workspace-tasks/[id]/stream/route.ts`): both `agent-fetch` catch blocks `logger.warn("agent-fetch","terminal failure",{path,code,cause})` before returning the unchanged discriminated union; `classifyHttpError` retains a truncated body for any non-2xx (was >=500 only). The stream handler reads a truncated upstream body into `errorMessage` and warns it. The stream proxy logs non-abort pipe failures with the task id (abort detection mirrors `instrumentation.ts`; expected client aborts stay silent).
3. **`after()` safety + reconciler**: `captureTaskStream` is wrapped end-to-end (the cleaner of the two options) so the leading insert and post-stream writes are covered — an unexpected throw is logged with `taskId`/`skillName`/`conversationId` and the row is best-effort flipped to `failed`. New scheduled task `reconcile-stuck-tasks` (every 10m) flips `workspaceTask` rows stuck in `running` past **30 minutes** to `failed`; the threshold sits safely above the 10-minute stream timeout so a live task is never killed.
4. **Bitbucket/http-client** (`src/lib/http-client.ts`, `src/lib/bitbucket-fetch.ts`, `src/lib/pipeline-sync.ts`): `httpFetch` warns the final non-ok outcome (host, status, code, retryCount) so every client inherits it; `bbFetch` raised info→warn with truncated body, `bbFetchUrl`/`bbFetchStatus` warn on non-2xx; `classifyRunDeployment`'s swallowed throws are logged with repoSlug/buildNumber. A sustained 401/403 is distinguishable via the `AUTH` code. No Authorization header, bearer token, app-password, or full URL is ever logged (host only); covered by explicit no-secret tests in each suite.

## References

- [Logging-audit](../investigations/2026-06-25-logging-audit.md) — Thema D.
- [Scheduler](../architecture/scheduler.md), [Workspace Integration](../architecture/workspace-integration.md) — lazy-cron, agent-proxy/SSE, Bitbucket.
