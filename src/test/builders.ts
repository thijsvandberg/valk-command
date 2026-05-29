import { randomUUID } from "crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  ticket,
  ticketMetadata,
  sprintNameCache,
  conversation,
  message,
  scheduledJob,
  storyWriterSession,
  refinementSession,
} from "@/db/schema";
import type {
  NewTicket,
  NewScheduledJob,
  NewConversation,
  NewMessage,
} from "@/db/schema";

type TestDb = BetterSQLite3Database<typeof schema>;

// --- Ticket ---

export function buildTicket(overrides?: Partial<NewTicket>): NewTicket {
  return {
    jiraKey: "VPL-100",
    title: "Test ticket",
    status: "TO DO",
    ...overrides,
  };
}

export function seedTicket(db: TestDb, overrides?: Partial<NewTicket>) {
  const data = buildTicket(overrides);
  db.insert(ticket).values(data).run();
  return data;
}

// --- Ticket Metadata ---

type NewTicketMetadata = typeof ticketMetadata.$inferInsert;

export function buildTicketMetadata(
  overrides?: Partial<NewTicketMetadata>,
): NewTicketMetadata {
  return {
    jiraKey: "VPL-100",
    ...overrides,
  };
}

export function seedTicketMetadata(
  db: TestDb,
  overrides?: Partial<NewTicketMetadata>,
) {
  const data = buildTicketMetadata(overrides);
  db.insert(ticketMetadata).values(data).run();
  return data;
}

// --- Sprint (sprintNameCache) ---

type NewSprintNameCache = typeof sprintNameCache.$inferInsert;

export function buildSprint(
  overrides?: Partial<NewSprintNameCache>,
): NewSprintNameCache {
  return {
    sprintId: "sprint-1",
    displayName: "Sprint 1",
    ...overrides,
  };
}

export function seedSprint(
  db: TestDb,
  overrides?: Partial<NewSprintNameCache>,
) {
  const data = buildSprint(overrides);
  db.insert(sprintNameCache).values(data).run();
  return data;
}

// --- Conversation ---

export function buildConversation(
  overrides?: Partial<NewConversation>,
): NewConversation {
  return {
    id: randomUUID(),
    title: "Test conversation",
    ...overrides,
  };
}

export function seedConversation(
  db: TestDb,
  overrides?: Partial<NewConversation>,
) {
  const data = buildConversation(overrides);
  db.insert(conversation).values(data).run();
  return data;
}

// --- Message ---

export function buildMessage(overrides?: Partial<NewMessage>): NewMessage {
  return {
    id: randomUUID(),
    conversationId: "conv-1",
    role: "user",
    content: "Test message",
    ...overrides,
  };
}

export function seedMessage(db: TestDb, overrides?: Partial<NewMessage>) {
  const data = buildMessage(overrides);
  db.insert(message).values(data).run();
  return data;
}

// --- Epic (ticket with type=Epic) ---

export function buildEpic(overrides?: Partial<NewTicket>): NewTicket {
  return buildTicket({
    jiraKey: "VPL-EPIC-1",
    title: "Test epic",
    type: "Epic",
    ...overrides,
  });
}

export function seedEpic(db: TestDb, overrides?: Partial<NewTicket>) {
  const data = buildEpic(overrides);
  db.insert(ticket).values(data).run();
  return data;
}

// --- Scheduled Job ---

export function buildScheduledJob(
  overrides?: Partial<NewScheduledJob>,
): NewScheduledJob {
  return {
    id: randomUUID(),
    name: "Test job",
    cronExpression: "0 9 * * 1-5",
    skillName: "test-skill",
    ...overrides,
  };
}

export function seedScheduledJob(
  db: TestDb,
  overrides?: Partial<NewScheduledJob>,
) {
  const data = buildScheduledJob(overrides);
  db.insert(scheduledJob).values(data).run();
  return data;
}

// --- Story Writer Session ---

type NewStoryWriterSession = typeof storyWriterSession.$inferInsert;

export function buildStoryWriterSession(
  overrides?: Partial<NewStoryWriterSession>,
): NewStoryWriterSession {
  return {
    id: randomUUID(),
    ticketKey: "VPL-100",
    conversationId: "conv-1",
    ...overrides,
  };
}

export function seedStoryWriterSession(
  db: TestDb,
  overrides?: Partial<NewStoryWriterSession>,
) {
  const data = buildStoryWriterSession(overrides);
  db.insert(storyWriterSession).values(data).run();
  return data;
}

// --- Refinement Session ---

type NewRefinementSession = typeof refinementSession.$inferInsert;

export function buildRefinementSession(
  overrides?: Partial<NewRefinementSession>,
): NewRefinementSession {
  return {
    id: randomUUID(),
    name: "Test refinement",
    ...overrides,
  };
}

export function seedRefinementSession(
  db: TestDb,
  overrides?: Partial<NewRefinementSession>,
) {
  const data = buildRefinementSession(overrides);
  db.insert(refinementSession).values(data).run();
  return data;
}
