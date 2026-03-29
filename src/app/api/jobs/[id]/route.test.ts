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

import { POST } from "../route";
import { GET, PUT, DELETE } from "./route";

const validJob = {
  name: "Daily brief",
  cronExpression: "0 9 * * 1-5",
  skillName: "morning-brief",
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createJob(overrides?: object) {
  const req = new Request("http://localhost:3100/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...validJob, ...overrides }),
  });
  const res = await POST(req);
  return res.json();
}

describe("GET /api/jobs/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns the job", async () => {
    const created = await createJob();
    const response = await GET(new Request("http://localhost"), makeParams(created.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Daily brief");
  });

  it("returns 404 for unknown id", async () => {
    const response = await GET(new Request("http://localhost"), makeParams("nonexistent"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});

describe("PUT /api/jobs/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("updates name", async () => {
    const created = await createJob();
    const response = await PUT(
      jsonRequest("http://localhost", "PUT", { name: "Updated name" }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Updated name");
    expect(data.cronExpression).toBe(validJob.cronExpression);
  });

  it("updates enabled to false", async () => {
    const created = await createJob();
    const response = await PUT(
      jsonRequest("http://localhost", "PUT", { enabled: false }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(data.enabled).toBe(false);
  });

  it("updates multiple fields at once", async () => {
    const created = await createJob();
    const response = await PUT(
      jsonRequest("http://localhost", "PUT", {
        name: "New name",
        cronExpression: "0 8 * * *",
        skillName: "other-skill",
        enabled: false,
      }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(data.name).toBe("New name");
    expect(data.cronExpression).toBe("0 8 * * *");
    expect(data.skillName).toBe("other-skill");
    expect(data.enabled).toBe(false);
  });

  it("returns 404 for unknown id", async () => {
    const response = await PUT(
      jsonRequest("http://localhost", "PUT", { name: "x" }),
      makeParams("nonexistent"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 when name is empty string", async () => {
    const created = await createJob();
    const response = await PUT(
      jsonRequest("http://localhost", "PUT", { name: "" }),
      makeParams(created.id),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/jobs/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes the job and returns 204", async () => {
    const created = await createJob();
    const response = await DELETE(new Request("http://localhost"), makeParams(created.id));

    expect(response.status).toBe(204);

    const getResponse = await GET(new Request("http://localhost"), makeParams(created.id));
    expect(getResponse.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const response = await DELETE(new Request("http://localhost"), makeParams("nonexistent"));

    expect(response.status).toBe(404);
  });
});
