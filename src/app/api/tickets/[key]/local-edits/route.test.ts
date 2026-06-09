// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, PUT, DELETE, PATCH } from "./route";
import { cache } from "@/lib/cache";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function putRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/local-edits`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/local-edits`);
}

describe("GET /api/tickets/[key]/local-edits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no edits exist", async () => {
    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });
});

describe("PUT /api/tickets/[key]/local-edits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a title edit", async () => {
    seedTicket(testDb, "VPL-100");
    const res = await PUT(
      putRequest("VPL-100", { field: "title", localValue: "New title" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.field).toBe("title");
    expect(data.localValue).toBe("New title");
    expect(data.ticketKey).toBe("VPL-100");
  });

  it("creates a description edit", async () => {
    seedTicket(testDb, "VPL-100");
    const res = await PUT(
      putRequest("VPL-100", { field: "description", localValue: "New description" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.field).toBe("description");
    expect(data.localValue).toBe("New description");
  });

  it("updates an existing edit for the same field", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "title", localValue: "First" }),
      makeParams("VPL-100"),
    );
    const res = await PUT(
      putRequest("VPL-100", { field: "title", localValue: "Updated" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.localValue).toBe("Updated");

    const getRes = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const all = await getRes.json();
    expect(all).toHaveLength(1);
  });

  it("rejects invalid field", async () => {
    const res = await PUT(
      putRequest("VPL-100", { field: "invalid", localValue: "test" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-string localValue", async () => {
    const res = await PUT(
      putRequest("VPL-100", { field: "title", localValue: 123 }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("creates a draft edit when isDraft=true", async () => {
    seedTicket(testDb, "VPL-100");
    const res = await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Draft content", isDraft: true }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isDraft).toBe(true);
    expect(data.localValue).toBe("Draft content");
  });

  it("creates a saved edit when isDraft is omitted", async () => {
    seedTicket(testDb, "VPL-100");
    const res = await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Saved content" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isDraft).toBe(false);
  });

  it("promotes draft to saved when saving over existing draft", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Draft v1", isDraft: true }),
      makeParams("VPL-100"),
    );
    const res = await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Saved v1" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isDraft).toBe(false);
    expect(data.localValue).toBe("Saved v1");
  });

  it("keeps saved status when auto-saving over saved edit", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Saved content" }),
      makeParams("VPL-100"),
    );
    const res = await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Updated content", isDraft: true }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isDraft).toBe(false);
  });
});

describe("DELETE /api/tickets/[key]/local-edits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes all local edits", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "description", localValue: "test" }),
      makeParams("VPL-100"),
    );
    const delReq = new Request("http://localhost:3100/api/tickets/VPL-100/local-edits", { method: "DELETE" });
    const res = await DELETE(delReq, makeParams("VPL-100"));
    expect(res.status).toBe(200);

    const getRes = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await getRes.json();
    expect(data).toEqual([]);
  });

  it("invalidates both the detail and the sprint/backlog list caches", async () => {
    seedTicket(testDb, "VPL-100");
    const invalidateSpy = vi.spyOn(cache, "invalidate");
    const delReq = new Request("http://localhost:3100/api/tickets/VPL-100/local-edits", { method: "DELETE" });
    await DELETE(delReq, makeParams("VPL-100"));
    expect(invalidateSpy).toHaveBeenCalledWith("/api/tickets/VPL-100");
    expect(invalidateSpy).toHaveBeenCalledWith(/^\/api\/tickets(\?|$)/);
    invalidateSpy.mockRestore();
  });

  it("deletes only drafts when draftsOnly=true", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "title", localValue: "Saved title" }),
      makeParams("VPL-100"),
    );
    await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Draft desc", isDraft: true }),
      makeParams("VPL-100"),
    );
    const delReq = new Request("http://localhost:3100/api/tickets/VPL-100/local-edits?draftsOnly=true", { method: "DELETE" });
    const res = await DELETE(delReq, makeParams("VPL-100"));
    expect(res.status).toBe(200);

    const getRes = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await getRes.json();
    expect(data).toHaveLength(1);
    expect(data[0].field).toBe("title");
    expect(data[0].isDraft).toBe(false);
  });
});

describe("PATCH /api/tickets/[key]/local-edits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("promotes drafts to saved with promoteDrafts=true", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "description", localValue: "Draft content", isDraft: true }),
      makeParams("VPL-100"),
    );

    const patchReq = new Request("http://localhost:3100/api/tickets/VPL-100/local-edits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promoteDrafts: true }),
    });
    const res = await PATCH(patchReq, makeParams("VPL-100"));
    expect(res.status).toBe(200);

    const getRes = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await getRes.json();
    expect(data).toHaveLength(1);
    expect(data[0].isDraft).toBe(false);
  });
});
