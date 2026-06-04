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

## Checklist

- [ ] On/off setting (default off) + configurable daily count (default ~10)
- [ ] Auto-enqueue policy reuses the BRDG-284 queue/runner and selection ordering
- [ ] Respects dismiss cooldown; daily budget enforced across ticks
- [ ] Setting + status indicator in the scan backlog view; auto runs logged
- [ ] Tests (toggle, daily budget, cooldown, ordering)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update docs and reference the epic
