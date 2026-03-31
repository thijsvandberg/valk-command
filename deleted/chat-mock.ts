export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
}

export const conversations: Conversation[] = [
  {
    id: "conv-1",
    title: "Sprint 14 planning prep",
    lastMessageAt: "2026-03-28T09:15:00Z",
  },
  {
    id: "conv-2",
    title: "Investigate auth token refresh",
    lastMessageAt: "2026-03-27T16:30:00Z",
  },
  {
    id: "conv-3",
    title: "Review VC-042 story quality",
    lastMessageAt: "2026-03-27T11:00:00Z",
  },
  {
    id: "conv-4",
    title: "Generate morning brief",
    lastMessageAt: "2026-03-26T08:45:00Z",
  },
];

export const messages: Message[] = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "Can you prepare a summary of the open tickets for Sprint 14? I need to know which ones are ready for refinement.",
    timestamp: "2026-03-28T09:10:00Z",
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant",
    content: "I found 12 tickets assigned to Sprint 14. Here is the breakdown:\n\n**Ready for refinement (5):**\n- VC-038: Add webhook retry logic\n- VC-041: Dashboard pulse widget\n- VC-042: Chat message threading\n- VC-045: Jira sync error handling\n- VC-047: Test report PDF export\n\n**Needs more detail (4):**\n- VC-039: Notification preferences (missing acceptance criteria)\n- VC-043: Activity feed filtering (no design spec)\n- VC-046: Sprint velocity chart (unclear data source)\n- VC-048: Stakeholder view permissions (needs security review)\n\n**Blocked (3):**\n- VC-040: SSE connection pooling (depends on VC-035)\n- VC-044: Refinement mode UI (depends on VC-042)\n- VC-049: Scheduled job templates (API not yet available)",
    timestamp: "2026-03-28T09:12:00Z",
  },
  {
    id: "msg-3",
    conversationId: "conv-1",
    role: "user",
    content: "Good overview. Can you add acceptance criteria to VC-039?",
    timestamp: "2026-03-28T09:15:00Z",
  },
  {
    id: "msg-4",
    conversationId: "conv-2",
    role: "user",
    content: "The auth token refresh is failing intermittently in staging. Can you investigate the logs from the last 24 hours?",
    timestamp: "2026-03-27T16:20:00Z",
  },
  {
    id: "msg-5",
    conversationId: "conv-2",
    role: "assistant",
    content: "I analyzed the staging logs from the past 24 hours. The token refresh failure correlates with high API load periods. The refresh endpoint returns 429 (rate limited) when more than 50 concurrent sessions attempt renewal within the same 10-second window.\n\nRoot cause: the refresh logic does not implement exponential backoff. All sessions retry immediately after a 429, causing a thundering herd.\n\nRecommended fix: add jittered exponential backoff to the token refresh retry logic with a max of 3 attempts.",
    timestamp: "2026-03-27T16:30:00Z",
  },
  {
    id: "msg-6",
    conversationId: "conv-3",
    role: "user",
    content: "Run a quality review on story VC-042.",
    timestamp: "2026-03-27T10:55:00Z",
  },
  {
    id: "msg-7",
    conversationId: "conv-3",
    role: "assistant",
    content: "Quality review for VC-042 (Chat message threading):\n\n**Score: 7/10**\n\n- Clarity: 8/10 (well-defined user flow)\n- Completeness: 6/10 (missing error states and edge cases)\n- Testability: 7/10 (acceptance criteria are measurable but need more detail)\n\nSuggestions:\n1. Add handling for messages that fail to send\n2. Define maximum thread depth\n3. Specify behavior when a parent message is deleted",
    timestamp: "2026-03-27T11:00:00Z",
  },
  {
    id: "msg-8",
    conversationId: "conv-4",
    role: "user",
    content: "Generate the morning brief.",
    timestamp: "2026-03-26T08:40:00Z",
  },
  {
    id: "msg-9",
    conversationId: "conv-4",
    role: "assistant",
    content: "**Morning Brief - March 26, 2026**\n\nOvernight activity:\n- 2 PRs merged (VC-033, VC-036)\n- CI pipeline stable, all checks passing\n- No new Jira tickets created\n\nToday's priorities:\n- Sprint 13 retrospective at 14:00\n- 3 tickets pending review (VC-034, VC-037, VC-038)\n- VC-035 blocked since Monday (waiting on infrastructure team)\n\nVelocity: Sprint 13 is tracking at 85% completion with 2 days remaining.",
    timestamp: "2026-03-26T08:45:00Z",
  },
];
