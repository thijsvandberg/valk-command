# BRDG-024: History & Diff UX Rework

**Status:** Done
**Priority:** High

## Description

The ticket history / version comparison UI has several UX issues that make it confusing to understand what you're comparing and what actions do. Version ordering, labels, diff direction, and action buttons tell inconsistent stories.

## Scope

### 1. Version list: sort by date, renumber, add "Outdated" badge

- [x] Sort all versions (including local draft) by `date` ascending, then assign version numbers sequentially
- [x] If the local draft is chronologically older than the latest Jira version, show an **"Outdated"** badge next to it in the version list
- [x] Draft moves to its correct chronological position instead of always being at the top

**Before:**
```
v7  Local draft  [Draft]        You                  1 Apr at 22:07
v6  Version 6    [Jira]         Thijs van den Berg   1 Apr at 22:19
```

**After:**
```
v7  Version 6    [Jira]         Thijs van den Berg   1 Apr at 22:19
v6  Local draft  [Draft] [Outdated]  You             1 Apr at 22:07
```

### 2. Remove duplicate diff label

- [x] Remove the `"Latest from Jira -> Your local edits"` label rendered in `TicketHistory.tsx` (line ~387). The `StoryDiff` component already renders its own header with `oldLabel`/`newLabel`.

### 3. Diff header: replace arrow with neutral comparison

- [x] Replace `oldLabel → newLabel` arrow notation in `StoryDiff.tsx` (lines 831-833) with a neutral `vs` format
- [x] Include timestamps in the comparison header so the chronological order is immediately visible

**Before:** `Latest from Jira  ->  Your local edits`

**After:** `Your draft (1 Apr, 22:07)  vs  Jira latest (1 Apr, 22:19)`

For non-conflict comparisons (browsing two Jira versions), keep it simple: `v3  vs  v5`

### 4. Action bar: clear, honest buttons

- [x] Replace current conflict action buttons with two clearly labeled options:

**Before:**
```
Resolve conflict:  [Push local changes to Jira]  [Discard local edits]
```

**After:**
```
[Accept Jira version]                    [Overwrite Jira with your draft]
```

- **"Accept Jira version"**: neutral/secondary style (border, white text). Discards local draft, keeps Jira as-is. No remote changes.
- **"Overwrite Jira with your draft"**: destructive/red style. Pushes local draft to Jira, overwriting remote changes.
- The "Review & merge" button stays as a third option (interactive hunk-level merge)

### 5. Prevent same-version comparison

- [x] In the compare dropdowns, filter out the version that is already selected on the other side. If left dropdown has v6, the right dropdown should not offer v6.

### 6. Integrate "Back to version list" into compare bar

- [x] Move the orphaned "Back to version list" link into the compare bar row:

**Before:**
```
Compare  [v6 (Jira) - 1 Apr, 22:19]  with  [v7 (Draft) - 1 Apr, 22:07]

< Back to version list
```

**After:**
```
[< Versions]    Compare  [v6 (Jira)]  vs  [v7 (Draft)]     Unified | Split
```

Everything on one row: navigation, comparison selectors, and view mode toggle.

### 7. Remove Export diff button

- [x] Remove the "Export diff" button from the diff toolbar
- [x] Keep `exportDiffAsMarkdown` utility for potential future use

## Files involved

- `src/components/ticket-detail/TicketHistory.tsx` (version assembly, sorting, labels, actions, layout)
- `src/components/story-diff/StoryDiff.tsx` (diff header labels, arrow notation)

## Design notes

- Terminology: prefer longer, descriptive button labels over short ambiguous ones
- "Accept Jira version" and "Overwrite Jira with your draft" leave no room for misinterpretation
- For non-conflict views (browsing two Jira versions), existing "Revert to vX" action is fine as-is
