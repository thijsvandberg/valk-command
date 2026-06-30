# BRDG-446: Surface a new UAT deployment on the board statusline

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description
When a ticket in **Test** or **In Progress** gets a fresh deployment to **UAT**, the board should tell the PO in-context. Two cases, both requested:

1. **A statusline is already visible** for that row (it has a recent status change / sprint-add). Today the line already folds in a deploy badge, so a new UAT deploy is reflected there automatically. Keep this.
2. **No statusline is visible** (no recent status change). Today the row shows nothing, so a fresh UAT deploy is invisible. Add a **standalone statusline** under the row that reads "New version on UAT" with the deploy badge.

The standalone line is **newness-gated** (it is not an ambient "last deployed" marker) so it does not light up on every Test ticket. Scope and lifetime, confirmed with the PO:
- **Environment:** UAT only (Bitbucket `environmentType = "Staging"`, environment `UAT1/2/3`). Production and Test deploys do not trigger the standalone line.
- **Lifetime:** dismissable via the existing "mark as seen" affordance, and bounded by the same recency window the status-change queue already uses, so old deploys do not all surface at once.

## Current Behaviour
- The board "statusline" is `StatusChangeLine` (`src/components/sprint-board/StatusChangeLine.tsx`, BRDG-414/439). It renders the quiet line beneath a row: status transition / sprint-add sentence, new-comment + story-edited signals, a `DeploySignal` deploy badge, open-subtasks indicator, and a dismiss checkmark.
- It is rendered **only when the row carries an unseen change**: `BoardRow.tsx:1036` gates on `statusChange && onStatusChangeSeen && onStatusChangeMoveToBottom`. No status change → no line.
- That queue comes from `GET /api/status-changes` → `listUnseenStatusChanges()` (`src/lib/status-changes-query.ts`), scoped to the active sprint's ticket keys and filtered to recent + unseen (per-user seen state in the `status_change_seen` table; dismissed via `POST /api/status-changes/seen`). `useStatusChanges` (`src/hooks/useStatusChanges.ts`) feeds it to `SprintBoard` / `TicketTable`.
- The deploy badge inside the line: `DeploySignal` shows only when `showsDeploy && deploy?.environment`, where `showsDeploy = isTest || change.toStatus === "IN PROGRESS"` (`StatusChangeLine.tsx:92`). Its data is `useLastDeployed()` → `GET /api/pipelines/last-deployed` → `Record<ticketKey, LastDeployedInfo { environment, completedAt, state }>` (latest deploy per ticket, ambient; `src/hooks/usePipelines.ts:145` + `src/app/api/pipelines/last-deployed/route.ts`). So the badge already reflects a new UAT deploy **when a line is present** (case 1 is effectively covered).
- Deployment data is fully captured already: `pipeline_run` table (`src/db/schema.ts`) has `isDeployment`, `environment`, `environmentType` (`"Staging"` for UAT), `state`, `completedAt`, `ticketKey` + `ticketKeys` (BRDG-269 range attribution). Environment classification: `detectEnvironment()` / `inferEnvironmentFromBranch()` in `src/lib/bitbucket-deploy-heuristics.ts`. In-flight statuses: `IN_FLIGHT_STATUSES = ["IN PROGRESS", "TEST"]` (`src/lib/ticket-status.ts`).
- A deploy **notification** already fires on a new deploy (`processDeploymentNotifications()`, `src/lib/pipeline-sync.ts`), category `"deployment"`. That is the bell/inbox surface; this story is the on-board, in-row surface and is independent of it.

**Gap:** an in-flight ticket with a fresh UAT deploy but no unseen status change renders no line, so the deploy is invisible on the board.

## Proposed Approach
Reuse the existing changed-row queue + statusline rather than building a parallel widget. Treat "new UAT deploy" as another **reason a row enters the unseen queue**, mirroring how `sprintAdded` already produces a line with no status transition.

1. **Queue: add a deploy reason.** Extend `listUnseenStatusChanges()` (`src/lib/status-changes-query.ts`) so a row also surfaces when, for an in-flight ticket (`IN_FLIGHT_STATUSES`), its latest UAT deploy (`pipeline_run`: `isDeployment = true`, `environmentType = "Staging"`, `state = "SUCCESSFUL"`, joined on `ticketKey`/`ticketKeys`) is within the same recency window and unseen by the user. Carry it on `StatusChangeItem` as an optional `deployAdded` field (env, completedAt, state), exactly parallel to `sprintAdded: SprintAddInfo | null`. A row that has a status change AND a fresh deploy stays one line (case 1); a row that has only the deploy becomes a deploy-only line (case 2).
2. **Seen state.** Reuse `status_change_seen` + `POST /api/status-changes/seen`. A deploy-only line has `id = null`, so dismissal must key on the deploy (ticket key + deploy completedAt/build) rather than a status-change id. Add a deploy-keyed seen marker (smallest change: a nullable deploy key column on `status_change_seen`, or a sibling seen table) so marking the deploy seen drops it from the queue without affecting status-change seen state.
3. **Render: deploy-only sentence.** In `StatusChangeLine.tsx`, when there is no status transition and no sprint-add but `deployAdded` is present, lead the sentence with "New version on UAT" (+ relative time, same tooltip pattern as the status sentence) and render the existing `DeploySignal` badge. Keep the dismiss checkmark; suppress the status-only affordances (Move to bottom, Generate test prompt) for a deploy-only line. The existing-line case is unchanged: the badge already folds in via `showsDeploy && deploy?.environment`.
4. **No new fetching.** All deploy data is already synced into `pipeline_run`; this is a query + render change. `last-deployed` route logic for dedup/range-attribution (`ticketKeys`) is the reference for resolving the latest UAT deploy per ticket.

**Non-goals / out of scope:**
- Production and Test environment deploys (UAT only).
- The deploy notification / bell surface (already exists; untouched).
- Ambient "last deployed" badges elsewhere (`TicketStatusPill` hover card, Pipelines view) — unchanged.
- Any new Bitbucket fetching or polling cadence change.

## Acceptance Criteria
- [ ] An in-flight ticket (Test or In Progress) with a recent, unseen, SUCCESSFUL UAT deploy and **no** unseen status change shows a standalone statusline reading "New version on UAT" with the deploy badge. <!-- StatusChangeLine.tsx deploy-only branch; listUnseenStatusChanges deployAdded reason -->
- [ ] An in-flight ticket that has **both** an unseen status change and a fresh UAT deploy shows a single line: the status sentence with the UAT deploy badge folded in (current behaviour, preserved). <!-- BoardRow.tsx:1036 + StatusChangeLine.tsx:171 -->
- [ ] Deploys to Production or Test environments do **not** produce a standalone line. <!-- environmentType === "Staging" filter in listUnseenStatusChanges -->
- [ ] A ticket not in Test/In Progress does **not** get a standalone deploy line. <!-- IN_FLIGHT_STATUSES guard -->
- [ ] The standalone deploy line is dismissable via the existing "mark as seen" checkmark, and stays dismissed across reloads. <!-- POST /api/status-changes/seen, deploy-keyed seen marker -->
- [ ] Old UAT deploys (outside the recency window) do not surface as standalone lines. <!-- same recency bound as status changes in listUnseenStatusChanges -->
- [ ] A deploy-only line shows no "Move to bottom" / "Generate test prompt" buttons. <!-- StatusChangeLine.tsx isFinished/isTest affordances suppressed when status is absent -->

## Tests
- [ ] `listUnseenStatusChanges` returns a `deployAdded` reason for an in-flight ticket with a recent unseen UAT deploy and none for a non-UAT / non-in-flight / out-of-window / seen deploy. <!-- src/lib/status-changes-query.test.ts -->
- [ ] `StatusChangeLine` renders the "New version on UAT" deploy-only line (badge present, status affordances absent) when only `deployAdded` is set, and folds the badge into the status sentence when both are set. <!-- src/components/sprint-board/StatusChangeLine.test.tsx -->
- [ ] Marking a deploy-only line seen removes it from the queue without affecting status-change seen state for the same ticket. <!-- status-changes/seen route test -->

## Related
- [[BRDG-414]] — introduced the changed-row statusline (`StatusChangeLine`) and the seen/dismiss queue this builds on.
- [[BRDG-439]] — added `sprintAdded` as a non-status reason for a line; `deployAdded` mirrors that pattern.
- [[BRDG-269]] — UAT deploy range attribution across multiple tickets (`ticketKeys`); reuse when resolving the latest UAT deploy per ticket.
- `src/app/api/pipelines/last-deployed/route.ts` — reference for latest-deploy-per-ticket dedup and `ticketKeys` fan-out.
