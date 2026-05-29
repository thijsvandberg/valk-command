// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { storedReview, ticketMetadata, storyVersion, conversation, workspaceTask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { seedTicket } from "@/test/builders";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/task-stream-handler", () => ({
  captureTaskStream: vi.fn(),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/agent-client", () => ({
  parseReviewOutput: vi.fn(),
  mapAgentReviewToResult: vi.fn(),
}));

import { captureReviewGeneration } from "./review-capture";
import { captureTaskStream } from "@/lib/task-stream-handler";
import { parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import { createNotification } from "@/lib/notifications";

function seedConversation(id: string) {
  testDb.insert(conversation).values({
    id,
    title: "Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();
}

function seedTask(id: string, convId: string, output: string | null, status = "completed") {
  testDb.insert(workspaceTask).values({
    id,
    skillName: "review-story-json",
    status,
    startedAt: new Date().toISOString(),
    conversationId: convId,
    output,
  }).run();
}

function seedStoryVersion(jiraKey: string, hash: string) {
  testDb.insert(storyVersion).values({
    id: randomUUID(),
    jiraKey,
    contentHash: hash,
    description: "test description",
    createdAt: new Date().toISOString(),
  }).run();
}

const mockReviewData = {
  skill: "review-story-json",
  score: 80,
  maxScore: 100,
  verdict: "Minor issues",
  criteria: [{ name: "Clarity", score: 40, maxScore: 50, status: "pass" }],
};

const mockReviewResult = {
  overallScore: 80,
  dimensions: [{ key: "clarity", label: "Clarity", score: 80, feedback: "40/50|Looks good" }],
  summary: "Good story",
  suggestions: [],
};

describe("captureReviewGeneration", () => {
  const convId = "conv-review";
  const taskId = "task-review";
  const ticketKey = "VALK-42";

  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
    seedConversation(convId);
    seedTicket(testDb, { jiraKey: ticketKey });
    vi.mocked(parseReviewOutput).mockReturnValue(mockReviewData as ReturnType<typeof parseReviewOutput>);
    vi.mocked(mapAgentReviewToResult).mockReturnValue({ ...mockReviewResult });
  });

  it("delegates to captureTaskStream with correct params", async () => {
    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, JSON.stringify(mockReviewData));
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    expect(captureTaskStream).toHaveBeenCalledWith({
      taskId,
      skillName: "review-story-json",
      conversationId: convId,
      relatedTicket: ticketKey,
    });
  });

  it("parses agent review JSON and inserts storedReview", async () => {
    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "review-output-text");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const reviews = testDb.select().from(storedReview).where(eq(storedReview.ticketKey, ticketKey)).all();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].overallScore).toBe(80);
  });

  it("calculates version hash and number from storyVersion table", async () => {
    seedStoryVersion(ticketKey, "hash-v1");
    seedStoryVersion(ticketKey, "hash-v2");

    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "output");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const reviews = testDb.select().from(storedReview).where(eq(storedReview.ticketKey, ticketKey)).all();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].storyVersionNumber).toBe(2);
  });

  it("uses 'no-version' hash when no storyVersion exists", async () => {
    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "output");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const reviews = testDb.select().from(storedReview).where(eq(storedReview.ticketKey, ticketKey)).all();
    expect(reviews[0].storyVersionHash).toBe("no-version");
  });

  it("updates metadata qualityScore for existing ticketMetadata", async () => {
    testDb.insert(ticketMetadata).values({ jiraKey: ticketKey } as typeof ticketMetadata.$inferInsert).run();

    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "output");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, ticketKey)).get();
    expect(meta!.qualityScore).toBe(80);
  });

  it("inserts ticketMetadata when none exists", async () => {
    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "output");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, ticketKey)).get();
    expect(meta).toBeTruthy();
    expect(meta!.qualityScore).toBe(80);
  });

  it("creates notification for low score (< 60)", async () => {
    vi.mocked(mapAgentReviewToResult).mockReturnValue({ ...mockReviewResult, overallScore: 45 });

    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "output");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    expect(createNotification).toHaveBeenCalledWith(
      "story-writer",
      expect.stringContaining("45"),
      expect.objectContaining({ jiraKey: ticketKey }),
    );
  });

  it("does not create notification for high score", async () => {
    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "output");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("handles malformed JSON gracefully (parseReviewOutput returns null)", async () => {
    vi.mocked(parseReviewOutput).mockReturnValue(null);

    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, "not valid review");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const reviews = testDb.select().from(storedReview).where(eq(storedReview.ticketKey, ticketKey)).all();
    expect(reviews).toHaveLength(0);
  });

  it("skips processing when task status is not completed", async () => {
    vi.mocked(captureTaskStream).mockImplementation(async () => {
      seedTask(taskId, convId, null, "failed");
    });

    await captureReviewGeneration(taskId, convId, ticketKey, "ticket-detail");

    const reviews = testDb.select().from(storedReview).where(eq(storedReview.ticketKey, ticketKey)).all();
    expect(reviews).toHaveLength(0);
  });
});
