import type { StoryWriterSessionRow, StoryWriterDraftRow, EpicChildDraftRow } from "@/db/schema";
import type { Message } from "@/types/chat";

/**
 * Epic Writer is an "epic mode" of the Story Writer: it reuses the same
 * story_writer_session table (with mode="epic") and the same chat plumbing.
 * The phases below are a navigable bookmark on the session; in BRDG-292 they
 * are persisted only and do not gate behavior. Later stories (293-296) build
 * breakdown, detail, and sprint affordances on top of these phases.
 */
export const EPIC_WRITER_PHASES = [
  "feed",
  "discovery",
  "breakdown",
  "refine",
  "detail",
  "sprints",
] as const;

export type EpicWriterPhase = (typeof EPIC_WRITER_PHASES)[number];

export const EPIC_WRITER_PHASE_LABELS: Record<EpicWriterPhase, string> = {
  feed: "Feed",
  discovery: "Discovery",
  breakdown: "Breakdown",
  refine: "Refine",
  detail: "Detail",
  sprints: "Sprints",
};

export function isEpicWriterPhase(value: unknown): value is EpicWriterPhase {
  return (
    typeof value === "string" &&
    (EPIC_WRITER_PHASES as readonly string[]).includes(value)
  );
}

/**
 * A child card as returned by the session route: the persisted draft row plus
 * the live sprint of its created Jira issue. The live sprint is NOT duplicated
 * on the card row (it lives on ticket.sprintName); the session route joins it in
 * so the board can show "current sprint" without a second fetch. Both fields are
 * null for a DRAFT card and for a created card sitting in the backlog.
 */
export type EpicChildCardWithSprint = EpicChildDraftRow & {
  liveSprintId: string | null;
  liveSprintName: string | null;
};

/**
 * Shape returned by GET/POST /api/epics/[key]/writer/session. Mirrors the
 * Story Writer session response so the shared useStoryWriter hook can consume
 * it unchanged, plus the epic-specific mode/phase fields on the session row.
 */
export interface EpicWriterSessionResponse {
  session: StoryWriterSessionRow | null;
  messages: Message[];
  aiDrafts: StoryWriterDraftRow[];
  cards: EpicChildCardWithSprint[];
}

export interface EpicWriterPhaseResponse {
  session: StoryWriterSessionRow;
}

/**
 * An inter-story link the AI proposes between two child cards. The PO confirms
 * each one before it is created. Defined here so later stories share the shape.
 */
export interface EpicChildLinkSuggestion {
  targetIndex: number;
  relation: string;
  confirmed: boolean;
}

/**
 * A child-story card produced during breakdown/refine. Persisted by later
 * stories in the epic_child_draft table; defined here so the route and UI
 * contracts are stable from the foundation onward.
 */
export interface EpicChildCard {
  index: number;
  title: string;
  bullets: string[];
  body: string | null;
  status: "draft" | "created";
  jiraKey: string | null;
  suggestedSprintId: string | null;
  suggestedLinks: EpicChildLinkSuggestion[];
}
