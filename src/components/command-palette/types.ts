// Pure type definitions - no runtime code, no directive needed

export type ResultCategory =
  | "page"
  | "action"
  | "ticket"
  | "conversation"
  | "direct-ticket"
  | "story-writer";

export interface PageResult {
  category: "page";
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  shortcut?: string;
  aliases: string[];
}

export interface ActionResult {
  category: "action";
  id: string;
  label: string;
  description?: string;
  aliases: string[];
  opensSubFlow?: boolean;
  execute: () => void | Promise<void>;
}

export interface TicketResult {
  category: "ticket";
  id: string;
  key: string;
  summary: string;
  status: string;
}

export interface ConversationResult {
  category: "conversation";
  id: string;
  title: string;
  lastMessage?: string;
  conversationId: string;
}

export interface DirectTicketResult {
  category: "direct-ticket";
  id: string;
  key: string;
}

export interface StoryWriterResult {
  category: "story-writer";
  id: string;
  ticketKey: string;
  title: string;
  sessionId: string;
  targetTicketKey: string | null;
  targetTitle: string | null;
}

export type PaletteResult =
  | PageResult
  | ActionResult
  | TicketResult
  | ConversationResult
  | DirectTicketResult
  | StoryWriterResult;

export interface SprintSlot {
  slotIndex: number;
  sprintId: string;
  sprintName: string;
}

export type SubFlowState =
  | { kind: "none" }
  | {
      kind: "new-story";
      mode: "create" | "existing";
      title: string;
      existingKey: string;
      sprintId: string;
      sprints: SprintSlot[];
      loading: boolean;
      error: string | null;
      loadingSprints: boolean;
    };
