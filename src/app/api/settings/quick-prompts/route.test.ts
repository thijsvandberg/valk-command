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
import { appSetting } from "@/db/schema";

describe("GET /api/settings/quick-prompts", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns default prompts when no setting exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts).toBeDefined();
    expect(data.prompts.story).toBeDefined();
    expect(Array.isArray(data.prompts.story)).toBe(true);
  });

  it("includes an Investigate prompt (codebase on, wraps result in <investigation>) for relevant types (BRDG-435)", async () => {
    const response = await GET();
    const data = await response.json();

    for (const type of ["story", "bug", "task", "spike"]) {
      const investigate = data.prompts[type].find((p: { label: string }) => p.label === "Investigate");
      expect(investigate, `Investigate prompt missing for ${type}`).toBeDefined();
      expect(investigate.enableCodebase).toBe(true);
      expect(investigate.text).toContain("<investigation>");
    }

    // Subtasks are excluded from the investigate flow.
    const subtaskInvestigate = data.prompts.subtask.find((p: { label: string }) => p.label === "Investigate");
    expect(subtaskInvestigate).toBeUndefined();
  });

  it("returns stored prompts when setting exists", async () => {
    const custom = { story: [{ id: "custom-1", label: "My prompt", text: "Do something" }] };
    testDb.insert(appSetting).values({
      key: "story_writer_quick_prompts",
      value: JSON.stringify(custom),
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts.story[0].id).toBe("custom-1");
  });
});

describe("PUT /api/settings/quick-prompts", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves valid prompts", async () => {
    const prompts = {
      story: [{ id: "s1", label: "Label", text: "Text content" }],
    };
    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: JSON.stringify({ prompts }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts.story[0].id).toBe("s1");
  });

  it("returns 400 for invalid prompts format", async () => {
    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: JSON.stringify({ prompts: "not-an-object" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/Invalid/i);
  });

  it("updates existing prompts", async () => {
    testDb.insert(appSetting).values({
      key: "story_writer_quick_prompts",
      value: JSON.stringify({ story: [{ id: "old", label: "Old", text: "Old text" }] }),
    }).run();

    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: JSON.stringify({ prompts: { story: [{ id: "new", label: "New", text: "New text" }] } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts.story[0].id).toBe("new");
  });

  it("returns 400 when prompts entry violates schema (text too long)", async () => {
    const longText = "x".repeat(5001);
    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: JSON.stringify({ prompts: { story: [{ id: "s1", label: "L", text: longText }] } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON body on PUT", async () => {
    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when prompts is not an object", async () => {
    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: JSON.stringify({ prompts: "invalid" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when prompts category contains non-array", async () => {
    const request = new Request("http://localhost:3100/api/settings/quick-prompts", {
      method: "PUT",
      body: JSON.stringify({ prompts: { story: "not-array" } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });
});
