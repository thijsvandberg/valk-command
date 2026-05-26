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

import { GET, PUT, DELETE } from "./route";
import { ticket, subtaskSuggestion } from "@/db/schema";
import { randomUUID } from "crypto";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(method: string, body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost:3100/api/tickets/VPL-10/subtask-suggestions", init);
}

function seedTicket(key: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: "Test ticket",
    type: "story",
    status: "TO DO",
  }).run();
}

function seedSuggestion(ticketKey: string, title: string, id?: string) {
  const suggestionId = id ?? randomUUID();
  testDb.insert(subtaskSuggestion).values({
    id: suggestionId,
    ticketKey,
    title,
    createdAt: new Date().toISOString(),
  }).run();
  return suggestionId;
}

describe("GET /api/tickets/[key]/subtask-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no suggestions exist", async () => {
    const response = await GET(makeRequest("GET"), makeParams("VPL-10"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toEqual([]);
  });

  it("returns persisted suggestions", async () => {
    seedTicket("VPL-10");
    seedSuggestion("VPL-10", "Set up database");
    seedSuggestion("VPL-10", "Create API endpoints");

    const response = await GET(makeRequest("GET"), makeParams("VPL-10"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].title).toBe("Set up database");
    expect(data.suggestions[1].title).toBe("Create API endpoints");
    expect(data.suggestions[0].id).toBeDefined();
    expect(data.suggestions[0].ticketKey).toBe("VPL-10");
  });

  it("does not return suggestions for other tickets", async () => {
    seedTicket("VPL-10");
    seedTicket("VPL-20");
    seedSuggestion("VPL-10", "Task for VPL-10");
    seedSuggestion("VPL-20", "Task for VPL-20");

    const response = await GET(makeRequest("GET"), makeParams("VPL-10"));
    const data = await response.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].title).toBe("Task for VPL-10");
  });
});

describe("PUT /api/tickets/[key]/subtask-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("persists suggestions from suggestions array", async () => {
    seedTicket("VPL-10");
    const response = await PUT(
      makeRequest("PUT", { suggestions: ["Set up DB", "Create API"] }),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].title).toBe("Set up DB");
    expect(data.suggestions[1].title).toBe("Create API");
  });

  it("persists suggestions from raw output string", async () => {
    seedTicket("VPL-10");
    const response = await PUT(
      makeRequest("PUT", { output: "1. Set up database\n2. Create endpoints\n3. Write tests" }),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toHaveLength(3);
    expect(data.suggestions[0].title).toBe("Set up database");
  });

  it("replaces existing suggestions on re-run", async () => {
    seedTicket("VPL-10");
    seedSuggestion("VPL-10", "Old suggestion 1");
    seedSuggestion("VPL-10", "Old suggestion 2");

    const response = await PUT(
      makeRequest("PUT", { suggestions: ["New suggestion"] }),
      makeParams("VPL-10"),
    );
    const data = await response.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].title).toBe("New suggestion");
  });

  it("returns 400 for invalid body", async () => {
    const response = await PUT(
      makeRequest("PUT", { foo: "bar" }),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(400);
  });

  it("filters empty strings from suggestions array", async () => {
    seedTicket("VPL-10");
    const response = await PUT(
      makeRequest("PUT", { suggestions: ["Valid", "", "Also valid"] }),
      makeParams("VPL-10"),
    );
    const data = await response.json();
    expect(data.suggestions).toHaveLength(2);
  });
});

describe("DELETE /api/tickets/[key]/subtask-suggestions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes a single suggestion by id", async () => {
    seedTicket("VPL-10");
    const id = seedSuggestion("VPL-10", "To dismiss");
    seedSuggestion("VPL-10", "To keep");

    const response = await DELETE(
      makeRequest("DELETE", { id }),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(204);

    const getResponse = await GET(makeRequest("GET"), makeParams("VPL-10"));
    const data = await getResponse.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].title).toBe("To keep");
  });

  it("deletes all suggestions when no id provided", async () => {
    seedTicket("VPL-10");
    seedSuggestion("VPL-10", "Suggestion 1");
    seedSuggestion("VPL-10", "Suggestion 2");

    const response = await DELETE(
      makeRequest("DELETE"),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(204);

    const getResponse = await GET(makeRequest("GET"), makeParams("VPL-10"));
    const data = await getResponse.json();
    expect(data.suggestions).toHaveLength(0);
  });

  it("only deletes suggestions for the specified ticket", async () => {
    seedTicket("VPL-10");
    seedTicket("VPL-20");
    seedSuggestion("VPL-10", "VPL-10 suggestion");
    seedSuggestion("VPL-20", "VPL-20 suggestion");

    await DELETE(makeRequest("DELETE"), makeParams("VPL-10"));

    const getResponse = await GET(makeRequest("GET"), makeParams("VPL-20"));
    const data = await getResponse.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].title).toBe("VPL-20 suggestion");
  });
});
