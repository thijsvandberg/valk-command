import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, storyVersion, storedReview, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
    })
    .run();
}

function seedVersion(
  db: BetterSQLite3Database<typeof schema>,
  key: string,
  hash: string,
) {
  db.insert(storyVersion)
    .values({
      id: `sv-${key}-${hash}`,
      jiraKey: key,
      description: "Test description",
      contentHash: hash,
      createdAt: new Date().toISOString(),
    })
    .run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

const sampleReview = {
  source: "ticket-detail" as const,
  overallScore: 72,
  dimensions: [
    { key: "clarity", label: "Clarity", score: 80, feedback: "Good" },
    { key: "testability", label: "Testability", score: 65, feedback: "Fair" },
    { key: "completeness", label: "Completeness", score: 60, feedback: "Missing items" },
    { key: "feasibility", label: "Feasibility", score: 83, feedback: "Solid" },
  ],
  summary: "Overall decent story",
  suggestions: ["Add error scenarios", "Include diagrams"],
};

function postRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/reviews`);
}

describe("POST /api/tickets/[key]/reviews", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a review and returns 201", async () => {
    seedTicket(testDb, "VPL-100");
    seedVersion(testDb, "VPL-100", "abc123");

    const response = await POST(
      postRequest("VPL-100", sampleReview),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.ticketKey).toBe("VPL-100");
    expect(data.overallScore).toBe(72);
    expect(data.storyVersionHash).toBe("abc123");
    expect(data.dimensions).toHaveLength(4);
    expect(data.summary).toBe("Overall decent story");
    expect(data.suggestions).toEqual(["Add error scenarios", "Include diagrams"]);
  });

  it("updates ticketMetadata qualityScore", async () => {
    seedTicket(testDb, "VPL-100");
    seedVersion(testDb, "VPL-100", "abc123");

    await POST(
      postRequest("VPL-100", sampleReview),
      makeParams("VPL-100"),
    );

    const metaRows = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "VPL-100"))
      .all();

    expect(metaRows[0]?.qualityScore).toBe(72);
  });

  it("returns 404 for non-existent ticket", async () => {
    const response = await POST(
      postRequest("VPL-999", sampleReview),
      makeParams("VPL-999"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid overallScore", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      postRequest("VPL-100", { ...sampleReview, overallScore: 150 }),
      makeParams("VPL-100"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid source", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      postRequest("VPL-100", { ...sampleReview, source: "invalid" }),
      makeParams("VPL-100"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    seedTicket(testDb, "VPL-100");

    const request = new Request("http://localhost:3100/api/tickets/VPL-100/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await POST(request, makeParams("VPL-100"));
    expect(response.status).toBe(400);
  });

  it("stores version hash as no-version when no versions exist", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      postRequest("VPL-100", sampleReview),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(data.storyVersionHash).toBe("no-version");
    expect(data.storyVersionNumber).toBe(0);
  });
});

describe("GET /api/tickets/[key]/reviews", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty list when no reviews exist", async () => {
    const response = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await response.json();

    expect(data.reviews).toEqual([]);
    expect(data.currentVersionHash).toBeNull();
  });

  it("returns reviews ordered by createdAt descending", async () => {
    seedTicket(testDb, "VPL-100");
    seedVersion(testDb, "VPL-100", "hash1");

    // Create two reviews
    await POST(
      postRequest("VPL-100", { ...sampleReview, overallScore: 60 }),
      makeParams("VPL-100"),
    );
    await POST(
      postRequest("VPL-100", { ...sampleReview, overallScore: 85 }),
      makeParams("VPL-100"),
    );

    const response = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await response.json();

    expect(data.reviews).toHaveLength(2);
    const scores = data.reviews.map((r: { overallScore: number }) => r.overallScore).sort();
    expect(scores).toEqual([60, 85]);
    expect(data.currentVersionHash).toBe("hash1");
  });

  it("includes current version hash for freshness checks", async () => {
    seedTicket(testDb, "VPL-100");
    seedVersion(testDb, "VPL-100", "hash-v1");

    const response = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await response.json();

    expect(data.currentVersionHash).toBe("hash-v1");
  });
});

// Import DELETE handler for the [id] sub-route
const { DELETE } = await import("./[id]/route");

function makeIdParams(key: string, id: string) {
  return { params: Promise.resolve({ key, id }) };
}

function deleteRequest(key: string, id: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/reviews/${id}`, {
    method: "DELETE",
  });
}

describe("DELETE /api/tickets/[key]/reviews/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes a review and updates qualityScore", async () => {
    seedTicket(testDb, "VPL-100");
    seedVersion(testDb, "VPL-100", "hash1");

    // Create two reviews
    const r1 = await POST(
      postRequest("VPL-100", { ...sampleReview, overallScore: 60 }),
      makeParams("VPL-100"),
    );
    const review1 = await r1.json();

    await POST(
      postRequest("VPL-100", { ...sampleReview, overallScore: 85 }),
      makeParams("VPL-100"),
    );

    // Delete the first review
    const response = await DELETE(
      deleteRequest("VPL-100", review1.id),
      makeIdParams("VPL-100", review1.id),
    );
    expect(response.status).toBe(200);

    // Verify only one review remains
    const listRes = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const listData = await listRes.json();
    expect(listData.reviews).toHaveLength(1);
    expect(listData.reviews[0].overallScore).toBe(85);
  });

  it("sets qualityScore to null when last review is deleted", async () => {
    seedTicket(testDb, "VPL-100");

    const r1 = await POST(
      postRequest("VPL-100", sampleReview),
      makeParams("VPL-100"),
    );
    const review1 = await r1.json();

    await DELETE(
      deleteRequest("VPL-100", review1.id),
      makeIdParams("VPL-100", review1.id),
    );

    const metaRows = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "VPL-100"))
      .all();

    expect(metaRows[0]?.qualityScore).toBeNull();
  });

  it("returns 404 for non-existent review", async () => {
    const response = await DELETE(
      deleteRequest("VPL-100", "nonexistent"),
      makeIdParams("VPL-100", "nonexistent"),
    );
    expect(response.status).toBe(404);
  });
});
