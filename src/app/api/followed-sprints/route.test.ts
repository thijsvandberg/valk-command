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

import { GET, POST, DELETE } from "./route";
import { followedSprint } from "@/db/schema";

function makeRequest(
  method: string,
  body?: unknown,
  search?: string,
): Request {
  const url = `http://localhost:3100/api/followed-sprints${search ?? ""}`;
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("GET /api/followed-sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when nothing is followed", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("returns list of followed sprint names", async () => {
    testDb.insert(followedSprint).values({ sprintName: "Sprint 1" }).run();
    testDb.insert(followedSprint).values({ sprintName: "Sprint 2" }).run();

    const response = await GET();
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data).toContain("Sprint 1");
    expect(data).toContain("Sprint 2");
  });
});

describe("POST /api/followed-sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("follows a sprint and returns { sprintName }", async () => {
    const response = await POST(makeRequest("POST", { sprintName: "Sprint 42" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ sprintName: "Sprint 42" });
  });

  it("is idempotent: following twice does not error", async () => {
    await POST(makeRequest("POST", { sprintName: "Sprint 42" }));
    const response = await POST(makeRequest("POST", { sprintName: "Sprint 42" }));
    expect(response.status).toBe(200);

    const rows = testDb.select().from(followedSprint).all();
    expect(rows).toHaveLength(1);
  });

  it("returns 400 when sprintName is missing", async () => {
    const response = await POST(makeRequest("POST", {}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  it("returns 400 when body is invalid JSON", async () => {
    const request = new Request("http://localhost:3100/api/followed-sprints", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/followed-sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("unfollows a sprint and returns { sprintName }", async () => {
    testDb.insert(followedSprint).values({ sprintName: "Sprint 42" }).run();

    const response = await DELETE(makeRequest("DELETE", undefined, "?sprintName=Sprint+42"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ sprintName: "Sprint 42" });

    const rows = testDb.select().from(followedSprint).all();
    expect(rows).toHaveLength(0);
  });

  it("returns 400 when sprintName param is missing", async () => {
    const response = await DELETE(makeRequest("DELETE", undefined, ""));
    expect(response.status).toBe(400);
  });
});
