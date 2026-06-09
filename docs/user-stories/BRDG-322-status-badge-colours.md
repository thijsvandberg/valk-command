# BRDG-322: Status badge colour set (collision-free with the marker family)

**Status:** Done
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

## Implementation Plan

Verified facts that shape the plan:
- The live header + group-header status pills render via `STATUS_PILL_COLORS` (SprintStatPill.tsx) → the `--sp-*` CSS vars, **not** the `.status-count-*` classes (those are dead CSS, no component references them). Re-hueing `--sp-*` fixes every header/group/board/list/hover status pill at once.
- `--sp-prog-*` already points at `--color-status-progress` (`#58b4e6`, a muted sky-blue) — the only true brand-teal is the dead `.status-count-progress` (`#3bbfbe`). Repointing `--color-status-progress` to a cleaner sky finalises IN PROGRESS.
- `--sp-test-*` points at the violet `--color-testing-400` ramp → must move to a new amber token. The violet ramp survives untouched (still used by stakeholder + marker family + conversation-category — out of scope).
- DELETED is **not** a `JiraStatus`; it is the derived `removedFromJira` state, rendered as a hardcoded red pill in TicketStatusPill, TicketRow and FilterBar. Resolution to the open question: keep `JiraStatus` unchanged; widen the two STYLE maps' key to `JiraStatus | "DELETED"` and re-hue the three `removedFromJira`/DELETED render sites to the new muted-rose token + strikethrough.

1. **globals.css `:root` tokens.** Leave `--color-status-neutral*` (used elsewhere) and the `--color-testing-*` violet ramp untouched. Repoint `--color-status-progress` `#58b4e6`→`#38bdf8` (sky) and its `-subtle` to a sky `color-mix`. Re-hue `--color-status-deprecated` `#7a9a7a`→`#a1a1aa` (muted zinc) + `-subtle` to a zinc mix. Add `--color-status-todo`(zinc `#d4d4d8`), `--color-status-test`(amber `#fcd34d`), `--color-status-deleted`(rose `#fda4af`) each with a `-subtle` color-mix. Add `[data-theme="light"]` overrides for the text values: todo `#52525b`, progress `#0284c7`, test `#b45309`, deprecated `#52525b`, deleted `#be123c`.
2. **globals.css `--sp-*` vars (both themes).** TO DO → todo token (bg/text), dot `#a1a1aa`/`#71717a`, active-bg `#52525b`. TEST → test token (bg/text), dot `#fbbf24`/`#f59e0b`, active-bg `#b45309`. IN PROGRESS inherits the sky repoint (no structural change). DONE untouched.
3. **globals.css `.status-count-*` (dead CSS).** Repoint progress→sky, test→amber, todo→zinc tokens; add `.status-count-depr`/`.status-count-deleted` so the classes are not a stale teal/violet landmine if reused.
4. **`src/lib/status-colors.ts`.** `JIRA_STATUS_STYLES` → `Record<JiraStatus | "DELETED", …>`: TO DO/TEST point at the new tokens, drop TEST's hardcoded `rgba(120,90,220,0.15)`, add DELETED (rose token). `RAW_STATUS_COLORS`: `progress` `#58b4e6`→`#38bdf8`, `deprecated` `#7a9a7a`→`#a1a1aa`, add `todo` `#a1a1aa`, `test` `#f59e0b`, `deleted` `#f43f5e`.
5. **`src/types/ticket.ts`.** `JIRA_STATUS_COLORS` → `Record<JiraStatus | "DELETED", …>`; keep `--sp-*`/deprecated refs (auto-inherit re-hue), add DELETED (rose token). Update the stale "keeps its own red token" comment.
6. **Strikethrough + DELETED wiring.** StatusBadge.tsx: `line-through` when DEPRECATED. TicketStatusPill.tsx: DEPRECATED `line-through` in the status branch; re-hue the `removedFromJira` DELETED pill to the rose token + `line-through`. TicketRow.tsx: same (DELETED branch → rose token + strike; DEPRECATED else-branch → strike). FilterBar.tsx: DELETED option → rose token + strike.
7. **Tier 2 consumers — inherit only (no edit):** StatusFilterChips, SearchFilterPanel, SearchResultParts, SessionTicketView, ticket-action-menu, EpicFilterBar, chat/[id]/page, filter-bar-types, palette-data `statusColor()`, SprintAnalytics, SprintStatPill/GroupStatBar. **Out of scope (flag only):** stakeholder TEST badges still use the violet `--color-testing-400` ramp directly — not in the story's call-site list; no SP/BV markers render in that external view so no collision occurs there.
8. **Tests.** `status-colors.test.ts`: assert the new mapping incl. DEPRECATED + DELETED, key length 6, and that no value uses teal/slate/violet literals. `StatusBadge.test.tsx`: DEPRECATED renders `line-through`. `TicketStatusPill.test.tsx`: DELETED pill uses the rose token + `line-through`, not `bg-red-500/10`.

## Scope — sources of truth + call sites

### Tier 1 — central definitions (the actual colour change)
- [x] `src/lib/status-colors.ts` — `JIRA_STATUS_STYLES`: TO DO → zinc, IN PROGRESS → sky, TEST → amber (dropped the hardcoded rgba), DEPRECATED → muted zinc, **added DELETED** → muted rose. `RAW_STATUS_COLORS` updated: `progress` #38bdf8 (was #58b4e6), added `todo` #a1a1aa + `test` #f59e0b + `deleted` #f43f5e, `deprecated` #a1a1aa (was #7a9a7a).
- [x] `src/types/ticket.ts` — `JIRA_STATUS_COLORS` widened to `JiraStatus | "DELETED"`, added DELETED rose entry; comment updated. Stays in lockstep with `JIRA_STATUS_STYLES`.
- [x] `src/app/globals.css` — added `--color-status-todo`/`-test`/`-deleted` tokens + light overrides; repointed `--color-status-progress`→sky and `--color-status-deprecated`→muted zinc; re-hued `--sp-todo-*`/`--sp-test-*` (both themes); repointed dead `.status-count-*` classes + added `.status-count-depr`/`.status-count-deleted`. Did NOT touch the shared `--color-status-neutral`.

### Tier 2 — verify consumers render correctly (most inherit from Tier 1)
- [x] `src/components/shared/StatusBadge.tsx` — base badge; DEPRECATED now struck through.
- [x] `src/components/shared/TicketStatusPill.tsx` — DEPRECATED struck through; DELETED pill re-hued to the rose token + strikethrough (was hardcoded red).
- [x] `src/components/ticket-detail/StatusFilterChips.tsx`, `src/components/sprint-board/SearchFilterPanel.tsx`, `FilterBar.tsx`, `filter-bar-types.ts` — inherit from Tier 1; `FilterBar.tsx` DELETED chip re-hued to rose + strikethrough.
- [x] `src/components/sprint-board/SprintAnalytics.tsx` — derives from `JIRA_STATUS_COLORS`; inherits, no edit.
- [x] `src/components/sprint-board/TicketRow.tsx` — DELETED branch re-hued to rose + strikethrough, DEPRECATED struck through. (`TicketTableCells.tsx` does not exist; the dense status cell lives in `TicketRow.tsx`.)
- [x] `src/components/sprint-board/ticket-action-menu.tsx`, `SearchResultParts.tsx` — inherit, no edit.
- [x] `src/components/refinement-session/SessionTicketView.tsx` — inherits, no edit.
- [x] `src/components/command-palette/palette-data.ts`, `ResultItem.tsx` — `statusColor()` reads `--sp-*`/deprecated tokens; inherits, no edit.
- [x] `src/app/(app)/epics/EpicFilterBar.tsx`, `src/app/(app)/chat/[id]/page.tsx` — inherit, no edit.
- [x] Header status-count pills — render via `STATUS_PILL_COLORS` (`SprintStatPill.tsx`) → `--sp-*`; re-hued centrally. <!-- note: the live strip uses STATUS_PILL_COLORS, not the .status-count-* CSS classes (those were dead code, also updated) -->
<!-- Out of scope: stakeholder TEST/"In Review" badges still use the violet --color-testing-400 ramp directly; not in this story's call-site list and no SP/BV markers render in that external view, so no collision. Flagged in the report. -->

## Acceptance criteria

- [x] TO DO = zinc, IN PROGRESS = sky, TEST = amber, DONE = emerald everywhere a status badge renders.
- [x] DEPRECATED and DELETED render muted + struck-through, visibly outside the lifecycle set.
- [x] No status badge uses teal, slate or violet (verified against the BRDG-321 markers in the same row/header).
- [x] Both `JIRA_STATUS_STYLES` and `JIRA_STATUS_COLORS` agree (no drift between the two tables).
- [x] All status badges legible in light and dark theme.
- [x] Tests assert the new status → colour mapping (incl. DEPRECATED/DELETED) in the central table.

## Decisions

1. **TEST = amber.** ✅ DECIDED (over indigo, which sits too close to the sky In progress).
2. **DELETED = muted rose + strikethrough.** ✅ DECIDED (rose is acceptable for a terminal status).
3. **IN PROGRESS teal → sky / TO DO slate → zinc.** ✅ Part of the set — required to clear the refinement (teal) and SP (slate) collisions.

## Open question — RESOLVED

- **DELETED data model.** DELETED is a **derived soft-delete state** (the `removedFromJiraAt` /
  `removedFromJira` flag), not a real `JiraStatus`. Resolution: `JiraStatus` is left unchanged; the two
  STYLE maps (`JIRA_STATUS_STYLES`, `JIRA_STATUS_COLORS`) widen their key to `JiraStatus | "DELETED"`
  so the rose token lives in one place, and the existing `removedFromJira` render sites
  (TicketStatusPill, TicketRow, FilterBar) were re-hued from hardcoded red to the muted-rose token +
  strikethrough.

## Notes

- Reference: the proposed set is shown live (light + dark) in `/dev/exploration/refinement-badge` § 4.
