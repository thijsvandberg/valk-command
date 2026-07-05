# BRDG-472: Declutter the sprint test-doc bundle gap-list rows

**Status:** Done
**Priority:** Low
**Type:** Chore

## Description

The gap-list rows in the sprint test-doc bundle (`SprintTestDocsModal`) carried too much
inline chrome. On the "missing" list and the "Not finished yet" list each row showed a
`draft ready` badge, an inline **Open**/**Edit** button, and a "..." overflow holding
**Generate** + **Skip** — three separate affordances competing with the ticket pill and
title, breaking the editorial-document reading rhythm the bundle redesign established.

Decided behaviour (PO feedback on the two gap lists):

- Remove the `draft ready` badge entirely.
- Collapse every row action behind the single "..." overflow when a row has more than one
  action, including the primary **Open**/**Edit**, so the row reads as a clean document
  line. A row with only one action still renders it inline (unchanged for the `notNeeded`
  list, which only offers **Open**/**Edit**).
- When documentation already exists for a row (a saved doc or an unreviewed draft), the
  generate action reads **Regenerate** instead of **Generate**. This replaces the signal the
  removed `draft ready` badge used to carry.

## Current Behaviour (before)

- `RowActions` (`src/components/sprint-board/SprintTestDocsModal.tsx`) rendered, in order: a
  `draft ready` `Tag` when `item.hasDraft`, an inline `CaptionButton` labelled `item.doc ?
  "Edit" : "Open"`, and `RowOverflowMenu` (Generate + Skip).
- `RowActions` is used by both the "missing" list and the "Not finished yet" (`other`) list.
- The `notNeeded` list uses its own inline `CaptionButton` (Open/Edit only) — not
  `RowActions` — so it was already a single inline action.

## Approach

- Introduce a `RowAction` descriptor (`key`, `label`, `icon`, `title`, `disabled`,
  `onSelect`). `RowActions` builds the list — Open/Edit, Generate/Regenerate, Skip — and
  applies the rule: exactly one action renders inline as a `CaptionButton`; two or more
  collapse into `RowOverflowMenu`. Since gap-list rows always have three, they always show
  just the "...".
- `RowOverflowMenu` now takes `actions: RowAction[]` and maps them to `MenuItem`s, instead of
  hard-coding Generate/Skip. Trigger `aria-label` unchanged (`More actions for {key}`).
- `alreadyGenerated = Boolean(item.doc) || Boolean(item.hasDraft)` drives the
  Generate/Regenerate label + icon (`Sparkles` vs `RefreshCw`). Open/Edit uses `SquarePen`.
- The `draft ready` `Tag` is dropped; `Tag` stays imported for the block tags (needs input /
  not finished yet).

## Files

- `src/components/sprint-board/SprintTestDocsModal.tsx` — `RowAction` type, `RowOverflowMenu`,
  `RowActions`; lucide imports gain `RefreshCw`, `SquarePen`.
- `src/components/sprint-board/SprintTestDocsModal.test.tsx` — updated the two affected specs
  (missing-row collapse + no draft badge + Regenerate for a draft; menu Open/Edit and
  Generate/Regenerate labels).
- `docs/architecture/workspace-integration.md` — bundle row-actions description.

## Acceptance Criteria

- [x] No `draft ready` badge on any bundle gap-list row.
- [x] On the "missing" and "Not finished yet" lists every action (Open/Edit, Generate/Regenerate,
      Skip) lives behind the "..." overflow; nothing else is inline.
- [x] The generate action reads **Regenerate** when the row already has a saved doc or an
      unreviewed draft, **Generate** otherwise.
- [x] The `notNeeded` list is unchanged (single inline Open/Edit).
- [x] Tests, lint, typecheck, build green.
