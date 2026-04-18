# BRDG-128: Stakeholder Chat Mode

**Status:** To do
**Priority:** High

## Description

Add a chat mode to the stakeholder view so the PO can ask free-form questions about the current sprint. The workspace (VRW) receives the full sprint context alongside the question and responds conversationally. Chat history is persistent per sprint — reopening the drawer shows the previous conversation.

The chat lives as a third tab inside the existing AI analysis drawer, alongside Status Brief and Sprint Insights.

---

## Acceptance criteria

- [ ] The AI analysis drawer gains a tab bar at the top: **Status Brief** | **Sprint Insights** | **Chat**
- [ ] Clicking "Chat" shows the chat panel; the other tabs continue to show their existing panels
- [ ] The active tab is remembered in `localStorage` per drawer session (resets on sprint change)
- [ ] The chat panel shows a message thread (user + assistant bubbles) and a text input at the bottom
- [ ] Sending a message submits the question to VRW via a new `POST /api/stakeholder/chat` route
- [ ] VRW receives: full sprint context (all tickets by status, goal, dates, state, sprint points summary) + any already-generated Status Brief narrative + Insights content + the conversation history + the new question
- [ ] The VRW response streams in via SSE (same pattern as the analysis routes) and appears progressively in the assistant bubble
- [ ] When the response is complete, both the user message and assistant response are persisted in the `conversation` + `message` tables
- [ ] On re-opening the drawer (or navigating back to the sprint), previous messages load and the conversation continues
- [ ] Chat history is scoped per sprint — switching sprints starts a fresh thread (but old one is still accessible if you return)
- [ ] A "New chat" button in the chat panel header clears the visible thread and starts a fresh conversation (old one remains in DB)
- [ ] The send button and Enter key submit the message; Shift+Enter inserts a newline
- [ ] While the assistant is responding, the input is disabled and a stop button appears that aborts the stream
- [ ] Empty sprint (no tickets loaded yet) disables the chat input with a tooltip: "Load sprint data first"

---

## Technical design

### DB

No new tables. Use the existing `conversation` + `message` tables with a naming convention:

```
conversation.title = "Stakeholder Chat: {sprintName}"
conversation.relatedTicket = null
```

Add a `stakeholderChatSession` lookup table to avoid scanning by title:

```ts
stakeholderChatSession: {
  id: text PK
  sprintId: integer NOT NULL UNIQUE
  conversationId: text FK -> conversation.id
  createdAt: text
}
```

This gives a clean `O(1)` lookup from sprint ID to conversation ID.

Migration: `drizzle/XXXX_stakeholder_chat_session.sql`

### API routes

**`GET /api/stakeholder/chat?sprintId={id}`**
- Returns `{ conversationId, messages: Message[] }` for the sprint
- Returns `{ conversationId: null, messages: [] }` if no session yet
- Messages ordered by `timestamp ASC`

**`POST /api/stakeholder/chat`**
- Body: `{ sprintId, sprintName, sprintContext, userMessage }`
- `sprintContext`: JSON string with sprint data (reuse `buildDeepDivePayload` shape + any generated brief/insights text)
- Finds or creates a `conversation` and `stakeholderChatSession` for the sprint
- Inserts the user message into `message` table
- Submits a `stakeholder-chat` workspace task with: `{ sprintContext, history: Message[], question: userMessage }`
- Returns `{ taskId, conversationId, userMessageId }`

**Streaming**: poll `GET /api/workspace-tasks/{taskId}/stream` (existing SSE endpoint) for the response. When complete, persist the assistant message via `PATCH /api/stakeholder/chat` (or a webhook — check existing pattern).

### VRW skill: `stakeholder-chat.md`

New skill at `.claude/skills/stakeholder-chat.md`.

The skill receives:
- `sprintContext`: full sprint data (same structure as deep-dive payload, plus brief narrative + insights text if available)
- `history`: array of `{ role, content }` prior messages
- `question`: the new user message

Behaviour:
- Acts as a knowledgeable product analyst who knows this sprint inside out
- Answers questions concisely and specifically — no generic hedging
- Stakeholders know the domain (Shiji, PMS, etc.), so no need to explain product terminology
- Only explain engineering concepts if genuinely unfamiliar to a business reader
- Does not repeat the question back
- Does not use bullet lists for conversational answers (prose preferred unless a list genuinely helps)
- Does not fabricate details not present in the sprint data

### Hook: `useStakeholderChat(sprintId)`

New hook at `src/hooks/useStakeholderChat.ts`.

```ts
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  streaming?: boolean; // true while response is in-flight
}

interface UseStakeholderChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;       // initial fetch
  isSending: boolean;       // waiting for response
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;        // starts new conversation (archives old)
  error: string | null;
}
```

Internally follows the same SSE pattern as `useStakeholderAnalysis`.

### UI component: `StakeholderChatPanel`

New component at `src/components/stakeholder/StakeholderChatPanel.tsx`.

- Message list: user bubbles right-aligned (brand tint bg), assistant bubbles left-aligned (surface-elevated bg)
- Assistant streaming bubble shows a blinking cursor while content arrives
- Input row: textarea (auto-resize, max 4 lines) + send button
- Empty state: "Ask anything about this sprint — tickets, delivery risk, what's blocked, why something is being built."
- Font size matches drawer body: `1rem`, line-height `1.75`

### Drawer tab bar

In `page.tsx`, add state: `aiDrawerTab: "brief" | "insights" | "chat"` (default `"brief"`).

The drawer header gains a tab row below the title:

```tsx
<div className="flex gap-0 border-b border-white/[0.06]">
  {["brief", "insights", "chat"].map(tab => (
    <button key={tab} onClick={() => setAiDrawerTab(tab)}
      className={`px-4 py-2 text-xs ... ${active ? "border-b-2 border-brand text-white/70" : "text-white/30"}`}>
      {tab === "brief" ? "Status Brief" : tab === "insights" ? "Sprint Insights" : "Chat"}
    </button>
  ))}
</div>
```

The existing Brief and Insights panels render only when their tab is active. The Chat panel renders only when `aiDrawerTab === "chat"`.

---

## Out of scope

- Chat on closed/future sprints (allow it — context is still valid)
- Exporting chat history
- Sharing chat with other users
- Markdown rendering in chat bubbles (plain text only for now)
