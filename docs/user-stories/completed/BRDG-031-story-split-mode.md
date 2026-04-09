# BRDG-031: Story Split Mode

**Status:** Implemented
**Priority:** High
**Parent:** BRDG-025 (Story Writer)

---

## Description

As the PO, I want to split an existing story into two stories directly from the story writer, so I can redistribute scope between independently deliverable stories using AI assistance and push both results to Jira.

---

## Core Concepts

- **Split mode is a view mode** of the story writer, activated via a toolbar button — not a tab
- **Two editors side by side**: original story (left), target story (right)
- **One chat session** drives both stories; the AI produces separate drafts per story when splitting content
- **Target story** can be a newly created Jira story (auto-linked) or an existing VPL ticket
- **Independent draft history**: each story has its own AI drafts, diff view, and accept/reject flow
- **Collapsible panes**: collapsing one pane gives a full editor+diff view for the visible story
- **Diff tab refactor**: the current "Split" tab (editor+diff side-by-side) becomes a toggle within the Diff tab

---

## Acceptance Criteria

### Phase 1: Database
- [x] Migration `0016_story_writer_split.sql` adds `target_ticket_key` and `target_local_draft` to `story_writer_session`
- [x] Migration adds `story_slot` (`"original"` | `"target"`, default `"original"`) to `story_writer_draft`
- [x] `src/db/schema.ts` updated to reflect new columns

### Phase 2: Jira Client
- [x] `jiraClient.createIssue({ summary, description?, issueType?, projectKey? })` method added to `src/lib/jira-client.ts`
- [x] Uses existing `jiraPost()` helper with auth, rate-limiting, and retry
- [x] Returns `{ key: string; id: string }`

### Phase 3: Backend API

#### Split activation endpoint
- [x] `POST /api/tickets/[key]/story-writer/split` created
- [x] If no `targetKey` in body: creates new Jira story with title `"Split: {originalTitle}"`, upserts ticket to local DB, inserts bidirectional `ticketLink` rows (relation `"split"` and `"split-from"`)
- [x] If `targetKey` provided: validates ticket exists locally
- [x] Updates session with `targetTicketKey` and empty `targetLocalDraft`
- [x] Returns `{ targetTicketKey, session }`

#### PATCH extension
- [x] `PATCH /api/tickets/[key]/story-writer` accepts `{ targetLocalDraft: string }` to update target story draft
- [x] `PATCH` accepts `{ clearSplit: true }` to deactivate split mode (sets both columns to null)

#### Apply-draft dual extraction
- [x] `extractStoryDraft()` updated to also extract `<story-draft slot="target">` tags
- [x] Returns `{ originalDraft?: string; targetDraft?: string }`
- [x] Apply-draft route saves each to `storyWriterDraft` with correct `storySlot` value
- [x] Returns `{ originalDraftId?, targetDraftId?, hasDraft }`

#### Messages route — split context
- [x] When session has `targetTicketKey`, messages route appends target story title + current content to AI context
- [x] System note added explaining split mode output format: `<story-draft>` for original, `<story-draft slot="target">` for target

### Phase 4: useStoryWriter Hook
- [x] Hook exposes `targetLocalDraft: string | null` and `targetAiDrafts: StoryWriterDraftRow[]` (filtered by `storySlot = "target"`)
- [x] `aiDrafts` now only returns drafts with `storySlot = "original"`
- [x] New method: `activateSplit(targetKey?: string)` — POSTs to `/split`, refreshes session
- [x] New method: `deactivateSplit()` — PATCHes `{ clearSplit: true }`, refreshes session
- [x] New method: `updateTargetLocalDraft(content)` — debounced PATCH `{ targetLocalDraft }`
- [x] New method: `acceptTargetDraft(draftId)` — copies target draft content to `targetLocalDraft`
- [x] New method: `dismissTargetDraft(draftId)` — DELETEs from apply-draft

### Phase 5: Frontend

#### Diff tab — side-by-side toggle
- [x] `"split"` removed from `EditorTab` type in `StoryWriterEditor.tsx`
- [x] Split tab button removed from tab bar
- [x] Diff tab gains a "Side by side" toggle button that switches between full-width diff and editor+diff side-by-side layout
- [x] Toggle state persisted to localStorage key `storyWriterDiffLayout`

#### Split mode layout (in StoryWriterEditor)
- [x] When `targetTicketKey` is set and `splitModeVisible = true`: renders two editor panes side by side
- [x] Each pane has header showing `{ticketKey} · {title}` + "Original" / "Split target" sub-label
- [x] Each pane has a collapse button (chevron)
- [x] When one pane is collapsed: visible pane fills width and shows RichEditor + DiffPane using that story's own AI drafts
- [x] Panes are resizable (drag handle), width persisted to localStorage
- [x] Each editor's changes call the appropriate `onDraftChange` / `onTargetDraftChange` handler

#### StoryWriterLayout — Split Story button
- [x] "Split Story" button added to editor header toolbar (scissors or split icon)
- [x] Button label changes based on state:
  - No target: "Split Story" — opens `SplitStoryPicker` modal
  - Target exists, hidden: "Open Split" — shows split layout
  - Target exists, visible: "Close Split" — hides split layout, saves target draft
- [x] `splitModeVisible: boolean` UI state managed in StoryWriterLayout
- [x] All split-related props passed down to StoryWriterEditor

#### SplitStoryPicker modal
- [x] New file: `src/components/story-writer/SplitStoryPicker.tsx`
- [x] Two options in modal: "Create new story" (auto-title editable, default `"Split: {title}"`) and "Use existing story" (VPL key input with title preview)
- [x] On confirm: calls `writer.activateSplit(targetKey?)`, closes modal, sets `splitModeVisible = true`

### Phase 6: Tests
- [x] Unit test: `extractStoryDraft` handles single, dual, and `slot="target"` draft tags
- [x] Unit test: PATCH with `targetLocalDraft` and `clearSplit`
- [x] Unit test: `POST /split` creates story, links, and updates session
- [x] Component test: SplitModeLayout renders two panes; collapse toggles correctly
- [x] Existing story writer tests updated (tab structure changes)
- [x] `npm run test`, `npm run typecheck`, `npm run build` all pass

---

## Implementation Plan

### Architecture Overview

| Layer | Change |
|-------|--------|
| DB | 2 new columns on session, 1 new column on draft |
| Jira client | New `createIssue()` method |
| API | New `/split` endpoint; extend PATCH, apply-draft, messages |
| Hook | 5 new methods, 2 new state values |
| UI | Remove Split tab; add Diff toggle; add split layout; add picker modal; add toolbar button |

---

### Phase 1: Database Migration

**New file:** `drizzle/0016_story_writer_split.sql`

```sql
ALTER TABLE `story_writer_session` ADD COLUMN `target_ticket_key` text;
ALTER TABLE `story_writer_session` ADD COLUMN `target_local_draft` text;
ALTER TABLE `story_writer_draft` ADD COLUMN `story_slot` text NOT NULL DEFAULT 'original';
```

**Update:** `src/db/schema.ts` — add to `storyWriterSession`:
```typescript
targetTicketKey: text("target_ticket_key"),
targetLocalDraft: text("target_local_draft"),
```

Add to `storyWriterDraft`:
```typescript
storySlot: text("story_slot", { enum: ["original", "target"] }).notNull().default("original"),
```

---

### Phase 2: Jira Client — createIssue

**File:** `src/lib/jira-client.ts`

Add method using the existing `jiraPost()` helper (already implements auth, rate-limit, retry):

```typescript
async createIssue(params: {
  summary: string;
  description?: unknown;  // ADF format
  issueType?: string;     // default "Story"
  projectKey?: string;    // default "VPL"
}): Promise<{ key: string; id: string }>
```

POST to `/rest/api/3/issue` with fields: `project.key`, `summary`, `description`, `issuetype.name`.

---

### Phase 3: Backend API

#### 3a. New endpoint: `POST /api/tickets/[key]/story-writer/split`

**New file:** `src/app/api/tickets/[key]/story-writer/split/route.ts`

Body: `{ targetKey?: string }`

Logic:
1. Load active session for `[key]`; return 404 if none
2. If `targetKey` provided: validate it exists in local DB
3. If no `targetKey`:
   - Load original ticket title
   - Call `jiraClient.createIssue({ summary: "Split: {title}", issueType: "Story" })`
   - Upsert new ticket into local `ticket` table (minimal record)
   - Insert `ticketLink` row: `{ ticketKey: key, relation: "split", linkedKey: newKey, title: "Split: {title}", type: "story", status: "TO DO" }`
   - Insert reverse link: `{ ticketKey: newKey, relation: "split-from", linkedKey: key, ... }`
4. PATCH session: `targetTicketKey = resolvedKey`, `targetLocalDraft = ""`
5. Return `{ targetTicketKey, session }`

#### 3b. Extend `PATCH /api/tickets/[key]/story-writer`

**File:** `src/app/api/tickets/[key]/story-writer/route.ts`

- Add `{ targetLocalDraft: string }` body option — updates `session.targetLocalDraft`
- Add `{ clearSplit: true }` option — sets `targetTicketKey = null`, `targetLocalDraft = null`

#### 3c. Extend `POST /api/tickets/[key]/story-writer/apply-draft`

**File:** `src/app/api/tickets/[key]/story-writer/apply-draft/route.ts`

Update `extractStoryDraft()`:
- Also find `<story-draft slot="target">` tag
- Return `{ originalDraft?: string; targetDraft?: string }`

In the route handler:
- If `originalDraft` found: insert `storyWriterDraft` with `storySlot = "original"`
- If `targetDraft` found: insert `storyWriterDraft` with `storySlot = "target"`
- Return `{ originalDraftId?, targetDraftId?, hasDraft }`

#### 3d. Messages route — split mode context

**File:** `src/app/api/tickets/[key]/story-writer/messages/route.ts`

When session has `targetTicketKey`:
- Load target ticket title from DB
- Append to AI context: target story title + `targetLocalDraft` content
- Add system note: "You are in split mode. Use `<story-draft>` for the original story and `<story-draft slot=\"target\">` for the target story."

---

### Phase 4: useStoryWriter Hook

**File:** `src/hooks/useStoryWriter.ts`

New state:
- `targetLocalDraft: string | null` — from `session.targetLocalDraft`
- `targetAiDrafts: StoryWriterDraftRow[]` — `aiDrafts.filter(d => d.storySlot === "target")`

`aiDrafts` now filtered: `aiDrafts.filter(d => d.storySlot === "original")`

New methods:
- `activateSplit(targetKey?: string)`: POST to `/split`, refreshes session
- `deactivateSplit()`: PATCH `{ clearSplit: true }`, refreshes session
- `updateTargetLocalDraft(content)`: debounced PATCH `{ targetLocalDraft: content }`
- `acceptTargetDraft(draftId)`: PATCH with `{ acceptDraftId: draftId, slot: "target" }` — copies draft content to `targetLocalDraft`
- `dismissTargetDraft(draftId)`: DELETE `/apply-draft?draftId={id}`

---

### Phase 5: Frontend

#### 5a. StoryWriterEditor.tsx — Diff tab side-by-side toggle

**File:** `src/components/story-writer/StoryWriterEditor.tsx`

- Remove `"split"` from `EditorTab` type. New: `"editor" | "diff" | "history"`
- Remove Split tab button and all Split rendering code
- In Diff tab header: add "Side by side" icon toggle button
- Toggle state: `diffLayout: "full" | "split"`, persisted to localStorage `storyWriterDiffLayout`
- Side-by-side layout reuses existing `splitWidth` drag logic

New props for split mode:
```typescript
splitModeVisible?: boolean;
targetTicketKey?: string | null;
targetLocalDraft?: string | null;
targetAiDrafts?: StoryWriterDraftRow[];
targetTicket?: { key: string; title: string } | null;
onTargetDraftChange?: (content: string) => void;
onDismissTargetDraft?: (draftId: string) => void;
```

When `splitModeVisible && targetTicketKey`: render `SplitModeLayout` instead of tabs.

#### 5b. SplitModeLayout (inline component in StoryWriterEditor.tsx)

Two-pane layout:

```
[ Original Pane: key · title · "Original" · collapse btn ] [ Resize ] [ Target Pane: key · title · "Split target" · collapse btn ]
        RichEditor                                                              RichEditor
```

Collapse state: `collapsedPane: null | "original" | "target"`

When collapsed: visible pane renders `RichEditor + DiffPane` for that story's own AI drafts (same pattern as current Diff tab).

Width persisted to localStorage key `storyWriterSplitModeWidth`.

#### 5c. StoryWriterLayout.tsx — Split Story button

**File:** `src/components/story-writer/StoryWriterLayout.tsx`

New UI state:
```typescript
splitModeVisible: boolean
showSplitPicker: boolean
```

Button in editor header toolbar:
- `session.targetTicketKey === null`: "Split Story" → `setShowSplitPicker(true)`
- Target exists, `!splitModeVisible`: "Open Split" → `setSplitModeVisible(true)`
- Target exists, `splitModeVisible`: "Close Split" → `setSplitModeVisible(false)`

Pass to StoryWriterEditor: `splitModeVisible`, `targetTicketKey`, `targetLocalDraft`, `targetAiDrafts`, `targetTicket`, `onTargetDraftChange={writer.updateTargetLocalDraft}`, `onDismissTargetDraft={writer.dismissTargetDraft}`

Also render: `<SplitStoryPicker open={showSplitPicker} ... />`

#### 5d. SplitStoryPicker.tsx

**New file:** `src/components/story-writer/SplitStoryPicker.tsx`

```typescript
interface SplitStoryPickerProps {
  open: boolean;
  originalTitle: string;
  onConfirm: (targetKey?: string) => Promise<void>;
  onClose: () => void;
}
```

Modal with:
- **Option A — Create new**: Pre-filled title `"Split: {originalTitle}"` (editable text input). "Create & split" button.
- **Option B — Use existing**: VPL ticket key input. On valid key: show title preview. "Link & split" button.
- Loading state while `activateSplit` is in flight.

---

### Phase 6: Tests

- Unit: `extractStoryDraft` — single `<story-draft>`, dual with `slot="target"`, missing slot
- Unit: `POST /split` — new story creation path + link creation + session update
- Unit: `POST /split` — existing targetKey path
- Unit: PATCH `targetLocalDraft` update and `clearSplit`
- Component: SplitModeLayout renders both panes; collapse original shows target full-width; collapse target shows original full-width
- Component: SplitStoryPicker — create new flow, link existing flow
- Update: existing `StoryWriterEditor` tests — remove Split tab assertions, add Diff side-by-side toggle

---

## Critical Files

| File | Change type |
|------|-------------|
| `drizzle/0016_story_writer_split.sql` | New |
| `src/db/schema.ts` | Modify |
| `src/lib/jira-client.ts` | Modify (add createIssue) |
| `src/app/api/tickets/[key]/story-writer/split/route.ts` | New |
| `src/app/api/tickets/[key]/story-writer/route.ts` | Modify |
| `src/app/api/tickets/[key]/story-writer/apply-draft/route.ts` | Modify |
| `src/app/api/tickets/[key]/story-writer/messages/route.ts` | Modify |
| `src/hooks/useStoryWriter.ts` | Modify |
| `src/components/story-writer/StoryWriterEditor.tsx` | Modify |
| `src/components/story-writer/StoryWriterLayout.tsx` | Modify |
| `src/components/story-writer/SplitStoryPicker.tsx` | New |

---

## Notes

- The `jiraPost()` helper in `jira-client.ts` already exists but is currently unused. `createIssue` will be its first consumer.
- When a new story is created, only a minimal DB record is inserted (key, title, type, status). Full sync happens on next Jira sync or when the story is opened.
- The `ticketLink` table already exists (migration 0013). No schema additions needed for linking.
- The target story does not get its own story writer session during split mode — the parent session tracks both. A fresh session for the target can be started independently after the split session is closed.
