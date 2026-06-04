# BRDG-290: Auto Background Scanning (Deferred)

**Status:** Planned (deferred — build after the manual flow is proven)
**Priority:** Low
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Adds a hands-off mode: with a single **on/off setting**, Bridge automatically queues a small number of
tickets per day (default ~10) into the Tier-2 deep dive, so the backlog keeps getting evaluated without
the PO selecting anything. Explicitly deferred per PO: ship and validate the **manual** selection flow
(BRDG-284) first, then automate it.

## Requirements

- A setting (default **off**) to enable auto background deep scanning, with a configurable daily count
  (default ~10).
- When enabled, a lazy-cron task auto-queues that many tickets per day using the existing selection
  ordering (worst-staleness / oldest-scanned first), respecting the dismiss cooldown.
- Reuses the BRDG-284 queue + runner; this story only adds the auto-enqueue policy + the toggle.
- Surface the setting and a "auto mode: on, N/day" indicator in the scan backlog view; log auto runs.

## Testing

- Toggle off = no auto-enqueue; on = exactly N/day, cooldown respected, correct ordering.
- Daily budget not exceeded across multiple ticks in a day.

## Implementation Plan

**Setting keys** (stored in `app_setting`):
- `deprecation-auto-scan:enabled` — `"true"` | `"false"`, default `"false"`
- `deprecation-auto-scan:daily-count` — integer string, default `"10"`
- `deprecation-auto-scan:budget:<YYYY-MM-DD>` — integer string, count of tickets already enqueued today

**Settings API**: `GET/POST /api/cleanup/auto-scan-settings` — reads/writes the enabled + daily-count settings.

**New source value**: Add `"auto"` to `QueueSource` in `src/lib/deprecation-scan-queue.ts`.

**New task**: `deprecation-auto-enqueue` in `src/lib/scheduled-tasks.ts`, interval 10 minutes. When enabled: loads eligible backlog, applies `worst-staleness` ordering (natural default — most likely to yield actionable results), excludes cooldown tickets, reads today's budget counter, enqueues up to `(dailyCount - usedToday)` tickets, increments counter. Does nothing when disabled.

**UI**: Inline in the `/cleanup` controls bar — a compact toggle + count input appended before the queue progress area. Status badge reads "Auto: ON, N/day" or "Auto: off" depending on state.

**Shared selection**: `selectDeepScanKeys` already lives in `src/lib/deprecation-deep-scan-selection.ts` (extracted in BRDG-284); reused directly here without further extraction.

## Checklist

- [x] On/off setting (default off) + configurable daily count (default ~10)
- [x] Auto-enqueue policy reuses the BRDG-284 queue/runner and selection ordering
- [x] Respects dismiss cooldown; daily budget enforced across ticks
- [x] Setting + status indicator in the scan backlog view; auto runs logged
- [x] Tests (toggle, daily budget, cooldown, ordering)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` <!-- full epic verify + build run by orchestrator: lint/typecheck clean, 4551 tests pass (1 unrelated pre-existing TicketSidebar failure), build succeeds -->

**Status:** Done
- [x] Update docs and reference the epic
