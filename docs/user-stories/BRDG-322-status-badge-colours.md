# BRDG-322: Status badge colour set (collision-free with the marker family)

**Status:** To Do
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-321 (row meta-marker family — introduces the teal/slate/violet markers this set must avoid), BRDG-298 (sprint/backlog badge)
**Exploration:** `/dev/exploration/refinement-badge` § 4 "Status badges"

## Description

As a PO scanning the board, I want the Jira **status** badges to use a coherent colour set that does
**not collide** with the new row meta-markers from BRDG-321. Status badges are the legitimate place for
semantic / progression colour (the markers deliberately are not), but three current status colours now
clash with the marker family:

- **TO DO** uses `--color-status-neutral` = `#94a3b8` = **slate** → collides with the **SP** chip (slate).
- **IN PROGRESS** uses brand **teal** (`.status-count-progress`) → collides with the **Refinement** marker (teal).
- **TEST** uses **violet** → collides with the **BV** chip (violet).

This story re-hues the status set so no status uses teal / slate / violet, applies it everywhere status
badges render, and adds explicit treatments for the **DEPRECATED** and **DELETED** exception states.

> Scope note: this is a **colour** change only — status badges keep their current shape (count pill in
> the header, dot + label row pill). No status glyphs/icons are introduced.

## Approved colour set

**Lifecycle** (cool → warm → success):

| Status | Hue | Was | Why |
|--------|-----|-----|-----|
| TO DO | **zinc** (neutral) | slate (`status-neutral`) | not started; zinc differs from the slate SP chip |
| IN PROGRESS | **sky / blue** | brand teal | active; off teal so it doesn't read as the refinement marker |
| TEST | **amber** | violet | in verification; warm contrast vs In progress; frees violet for BV |
| DONE | **emerald / green** | green | complete / success (unchanged) |

**Exception** (muted + strikethrough, sit outside the flow):

| Status | Hue | Why |
|--------|-----|-----|
| DEPRECATED | **muted zinc** + strikethrough | retired, ignore — not an alarm |
| DELETED | **muted rose** + strikethrough | removed; rose is fine for a terminal status |

Principles: lifecycle statuses use clear mid-saturation hues; exception states use low chroma so they
recede. No status uses a marker hue (teal / slate / violet).

## Theme-awareness

Must work in both `[data-theme]` modes (the app has no working Tailwind `dark:` variant). Reuse the
existing token + `color-mix(... %, transparent)` pattern already used by `.status-count-*` and
`JIRA_STATUS_STYLES` (CSS-var driven, so they flip). The current TEST style hardcodes
`rgba(120, 90, 220, 0.15)` — replace with a token-based **amber** that flips per theme.

## Scope — sources of truth + call sites

### Tier 1 — central definitions (the actual colour change)
- [ ] `src/lib/status-colors.ts` — `JIRA_STATUS_STYLES`: TO DO → zinc, IN PROGRESS → sky, TEST → amber (drop the hardcoded rgba), DEPRECATED → muted zinc, **add DELETED** → muted rose. Update `RAW_STATUS_COLORS` (server-side hex) to match: `progress` (teal→sky), add `test` (amber), `deprecated`, `deleted`.
- [ ] `src/types/ticket.ts` — `JIRA_STATUS_COLORS` (consumed by `StatusBadge`): reconcile to the same set so the two tables can't drift.
- [ ] `src/app/globals.css` — `.status-count-progress` (teal→sky), `.status-count-test` (testing/violet→amber), ensure `.status-count-todo` is zinc (not slate `status-neutral`), add `.status-count-depr` / `.status-count-deleted`, plus the `[data-theme="light"]` overrides for each. Add/repoint status tokens (e.g. a dedicated `--color-status-test` = amber, `--color-status-todo` = zinc) rather than repointing the shared `--color-status-neutral` (used elsewhere).

### Tier 2 — verify consumers render correctly (most inherit from Tier 1)
- [ ] `src/components/shared/StatusBadge.tsx` — base badge.
- [ ] `src/components/shared/TicketStatusPill.tsx` — board/list/hover status pill (dot + label).
- [ ] `src/components/ticket-detail/StatusFilterChips.tsx`, `src/components/sprint-board/SearchFilterPanel.tsx`, `FilterBar.tsx`, `filter-bar-types.ts` — status filter chips/legend.
- [ ] `src/components/sprint-board/SprintAnalytics.tsx` — status distribution colours.
- [ ] `src/components/sprint-board/TicketRow.tsx`, `TicketTableCells.tsx` — dense table status cell.
- [ ] `src/components/sprint-board/ticket-action-menu.tsx`, `SearchResultParts.tsx` — status references.
- [ ] `src/components/refinement-session/SessionTicketView.tsx` — refinement view status.
- [ ] `src/components/command-palette/palette-data.ts`, `ResultItem.tsx` — status in command palette.
- [ ] `src/app/(app)/epics/EpicFilterBar.tsx`, `src/app/(app)/chat/[id]/page.tsx` — status references.
- [ ] Header status-count pills (the `BT: 139 · TO DO: 8 · IN PROGRESS: 5 · ...` strip).

## Acceptance criteria

- [ ] TO DO = zinc, IN PROGRESS = sky, TEST = amber, DONE = emerald everywhere a status badge renders.
- [ ] DEPRECATED and DELETED render muted + struck-through, visibly outside the lifecycle set.
- [ ] No status badge uses teal, slate or violet (verified against the BRDG-321 markers in the same row/header).
- [ ] Both `JIRA_STATUS_STYLES` and `JIRA_STATUS_COLORS` agree (no drift between the two tables).
- [ ] All status badges legible in light and dark theme.
- [ ] Tests assert the new status → colour mapping (incl. DEPRECATED/DELETED) in the central table.

## Decisions

1. **TEST = amber.** ✅ DECIDED (over indigo, which sits too close to the sky In progress).
2. **DELETED = muted rose + strikethrough.** ✅ DECIDED (rose is acceptable for a terminal status).
3. **IN PROGRESS teal → sky / TO DO slate → zinc.** ✅ Part of the set — required to clear the refinement (teal) and SP (slate) collisions.

## Open question

- **DELETED data model.** `DELETED` is **not** currently a `JiraStatus` (the type only has TO DO / IN
  PROGRESS / TEST / DONE / DEPRECATED). Confirm whether DELETED is a real status to add to the type +
  styles, or a derived/soft-delete state handled elsewhere — this determines whether the DELETED style
  is wired into `JiraStatus` or applied at a different layer.

## Notes

- Reference: the proposed set is shown live (light + dark) in `/dev/exploration/refinement-badge` § 4.
