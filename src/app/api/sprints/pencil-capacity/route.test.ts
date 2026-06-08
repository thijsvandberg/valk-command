// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, PUT } from "./route";

function putRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/sprints/pencil-capacity", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/sprints/pencil-capacity", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no capacities set", async () => {
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns saved capacities", async () => {
    await PUT(putRequest({ sprintId: "s1", capacity: 40 }));
    await PUT(putRequest({ sprintId: "s2", capacity: 25 }));

    const response = await GET();
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data.find((r: { sprintId: string }) => r.sprintId === "s1").capacity).toBe(40);
  });
});

describe("PUT /api/sprints/pencil-capacity", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves a sprint capacity", async () => {
    const response = await PUT(putRequest({ sprintId: "s1", capacity: 40 }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ sprintId: "s1", capacity: 40 });
  });

  it("upserts an existing sprint capacity", async () => {
    await PUT(putRequest({ sprintId: "s1", capacity: 40 }));
    await PUT(putRequest({ sprintId: "s1", capacity: 55 }));

    const response = await GET();
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].capacity).toBe(55);
  });

  it("deletes the row when capacity is null", async () => {
    await PUT(putRequest({ sprintId: "s1", capacity: 40 }));
    const response = await PUT(putRequest({ sprintId: "s1", capacity: null }));
    const data = await response.json();
    expect(data).toEqual({ sprintId: "s1", capacity: null });

    const after = await (await GET()).json();
    expect(after).toEqual([]);
  });

  it("returns 400 when sprintId is missing", async () => {
    const response = await PUT(putRequest({ capacity: 40 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when capacity is out of range", async () => {
    const response = await PUT(putRequest({ sprintId: "s1", capacity: 1000 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when capacity is not a number", async () => {
    const response = await PUT(putRequest({ sprintId: "s1", capacity: "lots" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:3100/api/sprints/pencil-capacity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });
});
