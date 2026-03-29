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

import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validJob = {
  name: "Daily standup brief",
  cronExpression: "0 9 * * 1-5",
  skillName: "morning-brief",
};

describe("GET /api/jobs", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no jobs exist", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns all jobs", async () => {
    await POST(jsonRequest(validJob));
    await POST(jsonRequest({ ...validJob, name: "Weekly report" }));

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
  });
});

describe("POST /api/jobs", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a job with required fields", async () => {
    const response = await POST(jsonRequest(validJob));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Daily standup brief");
    expect(data.cronExpression).toBe("0 9 * * 1-5");
    expect(data.skillName).toBe("morning-brief");
    expect(data.enabled).toBe(true);
    expect(data.id).toBeDefined();
    expect(data.lastRunAt).toBeNull();
  });

  it("defaults enabled to true when not provided", async () => {
    const response = await POST(jsonRequest(validJob));
    const data = await response.json();

    expect(data.enabled).toBe(true);
  });

  it("respects enabled: false when provided", async () => {
    const response = await POST(jsonRequest({ ...validJob, enabled: false }));
    const data = await response.json();

    expect(data.enabled).toBe(false);
  });

  it("trims whitespace from string fields", async () => {
    const response = await POST(
      jsonRequest({ name: "  trimmed  ", cronExpression: "  * * * * *  ", skillName: "  skill  " }),
    );
    const data = await response.json();

    expect(data.name).toBe("trimmed");
    expect(data.cronExpression).toBe("* * * * *");
    expect(data.skillName).toBe("skill");
  });

  it("returns 400 when name is missing", async () => {
    const response = await POST(jsonRequest({ cronExpression: "* * * * *", skillName: "skill" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("name is required");
  });

  it("returns 400 when cronExpression is missing", async () => {
    const response = await POST(jsonRequest({ name: "job", skillName: "skill" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("cronExpression is required");
  });

  it("returns 400 when cronExpression is not a valid cron expression", async () => {
    const response = await POST(
      jsonRequest({ name: "job", cronExpression: "not-a-cron", skillName: "skill" }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("valid 5-field cron expression");
  });

  it("returns 400 when skillName is missing", async () => {
    const response = await POST(jsonRequest({ name: "job", cronExpression: "* * * * *" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("skillName is required");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:3100/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
