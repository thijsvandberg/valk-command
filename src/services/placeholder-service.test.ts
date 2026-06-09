// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, ticketLocalEdit, placeholderTicket } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const createIssue = vi.fn();
const moveToSprint = vi.fn();
vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: (...args: unknown[]) => createIssue(...args),
    moveToSprint: (...args: unknown[]) => moveToSprint(...args),
  },
}));

vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ cache: { invalidate: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { JIRA_PROJECT_KEY: "BRIDGE" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import {
  createPlaceholder,
  listPlaceholders,
  updatePlaceholder,
  deletePlaceholder,
  promotePlaceholder,
} from "./placeholder-service";

beforeEach(() => {
  testDb = createTestDb();
  createIssue.mockReset();
  moveToSprint.mockReset();
});

describe("createPlaceholder", () => {
  it("creates an active placeholder with a PLH- id", async () => {
    const row = await createPlaceholder({ title: "Future work", sprintId: "42", guestimation: 5, businessValue: 3 });
    expect(row.id).toMatch(/^PLH-/);
    expect(row.status).toBe("active");
    expect(row.title).toBe("Future work");
    expect(row.sprintId).toBe("42");
    expect(row.guestimation).toBe(5);
    expect(row.businessValue).toBe(3);
  });

  it("rejects an empty title", async () => {
    await expect(createPlaceholder({ title: "   " })).rejects.toThrow(/title is required/);
  });

  it("rejects a non-Fibonacci guestimation", async () => {
    await expect(createPlaceholder({ title: "x", guestimation: 4 })).rejects.toThrow(/guestimation/);
  });

  it("rejects an out-of-range business value", async () => {
    await expect(createPlaceholder({ title: "x", businessValue: 9 })).rejects.toThrow(/businessValue/);
  });
});

describe("listPlaceholders", () => {
  beforeEach(async () => {
    await createPlaceholder({ title: "A", sprintId: "1", epicKey: "EP-1" });
    await createPlaceholder({ title: "B", sprintId: "2", epicKey: "EP-1" });
    await createPlaceholder({ title: "C", sprintId: "1", epicKey: "EP-2" });
  });

  it("lists all active placeholders", async () => {
    const rows = await listPlaceholders();
    expect(rows).toHaveLength(3);
  });

  it("filters by sprint", async () => {
    const rows = await listPlaceholders({ sprintId: "1" });
    expect(rows.map((r) => r.title).sort()).toEqual(["A", "C"]);
  });

  it("filters by epic", async () => {
    const rows = await listPlaceholders({ epicKey: "EP-1" });
    expect(rows.map((r) => r.title).sort()).toEqual(["A", "B"]);
  });
});

describe("updatePlaceholder", () => {
  it("updates content and metadata", async () => {
    const created = await createPlaceholder({ title: "old" });
    const updated = await updatePlaceholder(created.id, { title: "new", guestimation: 8, description: "notes" });
    expect(updated.title).toBe("new");
    expect(updated.guestimation).toBe(8);
    expect(updated.description).toBe("notes");
  });

  it("rejects an invalid guestimation", async () => {
    const created = await createPlaceholder({ title: "x" });
    await expect(updatePlaceholder(created.id, { guestimation: 7 })).rejects.toThrow(/guestimation/);
  });

  it("throws for an unknown id", async () => {
    await expect(updatePlaceholder("PLH-missing", { title: "x" })).rejects.toThrow(/not found/);
  });
});

describe("deletePlaceholder", () => {
  it("removes the row", async () => {
    const created = await createPlaceholder({ title: "gone" });
    await deletePlaceholder(created.id);
    const rows = await listPlaceholders();
    expect(rows).toHaveLength(0);
  });

  it("throws for an unknown id", async () => {
    await expect(deletePlaceholder("PLH-missing")).rejects.toThrow(/not found/);
  });
});

describe("promotePlaceholder", () => {
  beforeEach(() => {
    createIssue.mockResolvedValue({ key: "BRIDGE-99", id: "10099" });
    moveToSprint.mockResolvedValue(undefined);
  });

  it("creates a real ticket carrying content, BV and guestimation, and marks the placeholder promoted", async () => {
    const created = await createPlaceholder({
      title: "Promote me",
      description: "the details",
      type: "task",
      sprintId: "42",
      epicKey: "EP-1",
      businessValue: 5,
      guestimation: 3,
    });

    const result = await promotePlaceholder(created.id);
    expect(result.key).toBe("BRIDGE-99");

    // Jira issue created with the mapped capitalized type.
    expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({ summary: "Promote me", issueType: "Task", parentKey: "EP-1" }));
    expect(moveToSprint).toHaveBeenCalledWith(["BRIDGE-99"], 42);

    // Local ticket mirrored.
    const t = await testDb.select().from(ticket).where(eq(ticket.jiraKey, "BRIDGE-99"));
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("task");

    // Description carried as a local edit.
    const edits = await testDb.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, "BRIDGE-99"));
    expect(edits).toHaveLength(1);
    expect(edits[0].field).toBe("description");
    expect(edits[0].localValue).toBe("the details");

    // BV + guestimation carried into ticketMetadata.
    const meta = await testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BRIDGE-99"));
    expect(meta[0].businessValue).toBe(5);
    expect(meta[0].guestimation).toBe(3);

    // Placeholder marked promoted (and no longer in the active list -> no duplicate).
    const ph = await testDb.select().from(placeholderTicket).where(eq(placeholderTicket.id, created.id));
    expect(ph[0].status).toBe("promoted");
    expect(ph[0].promotedToKey).toBe("BRIDGE-99");
    const active = await listPlaceholders();
    expect(active).toHaveLength(0);
  });

  it("does not create a local edit when there is no description", async () => {
    const created = await createPlaceholder({ title: "No notes", sprintId: "42" });
    await promotePlaceholder(created.id);
    const edits = await testDb.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, "BRIDGE-99"));
    expect(edits).toHaveLength(0);
  });

  it("refuses to promote an already-promoted placeholder", async () => {
    const created = await createPlaceholder({ title: "once" });
    await promotePlaceholder(created.id);
    await expect(promotePlaceholder(created.id)).rejects.toThrow(/already been promoted/);
  });
});
