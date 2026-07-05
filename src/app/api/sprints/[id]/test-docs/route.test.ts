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

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

import { GET } from "./route";
import { ticket, ticketMetadata, ticketSprint, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

const SPRINT = "6361";

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string): Request {
  return new Request(`http://localhost:3100/api/sprints/${id}/test-docs`);
}

function seedTicket(
  key: string,
  opts: {
    status?: string;
    type?: string;
    storyPoints?: number | null;
    sprintId?: string | null;
    removed?: boolean;
    doc?: string;
    classification?: string;
    draft?: string;
    draftClassification?: string;
  } = {},
) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Title ${key}`,
    type: opts.type ?? "story",
    status: opts.status ?? "DONE",
    storyPoints: opts.storyPoints ?? null,
    removedFromJiraAt: opts.removed ? "2026-07-01T00:00:00.000Z" : null,
  }).run();
  const sprintId = opts.sprintId === undefined ? SPRINT : opts.sprintId;
  if (sprintId) {
    testDb.insert(ticketSprint).values({ ticketKey: key, sprintId }).run();
  }
  if (opts.doc || opts.draft) {
    testDb.insert(ticketMetadata).values({
      jiraKey: key,
      testDoc: opts.doc ?? null,
      testDocUpdatedAt: opts.doc ? "2026-07-01T00:00:00.000Z" : null,
      testDocClassification: opts.doc ? opts.classification ?? "ok" : null,
      testDocDraft: opts.draft ?? null,
      testDocDraftClassification: opts.draft ? opts.draftClassification ?? null : null,
    }).run();
  }
}

async function fetchBuckets(id: string = SPRINT) {
  const response = await GET(makeRequest(id), makeParams(id));
  expect(response.status).toBe(200);
  return response.json();
}

describe("GET /api/sprints/[id]/test-docs", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(sprintNameCache).values({ sprintId: SPRINT, displayName: "BT: 139" }).run();
  });

  it("buckets documented, internal, notNeeded, missing and other correctly", async () => {
    seedTicket("VPL-1", { doc: "**Doc 1**", classification: "ok", storyPoints: 3 });
    seedTicket("VPL-2", { doc: "Internal one-liner", classification: "not_stakeholder_relevant" });
    // Draft-only finished story: folds into the document as a draft (BRDG-473),
    // no longer counted as missing.
    seedTicket("VPL-3", { status: "TEST", draft: "unreviewed draft" });
    seedTicket("VPL-4", { status: "DONE" });
    seedTicket("VPL-5", { status: "IN PROGRESS" });
    // Explicit "no doc needed" marker: classification without a doc. Must land
    // in notNeeded, NOT in missing, despite being DONE.
    seedTicket("VPL-6", { status: "DONE" });
    testDb.insert(ticketMetadata).values({
      jiraKey: "VPL-6",
      testDocClassification: "not_stakeholder_relevant",
    }).run();

    const data = await fetchBuckets();
    expect(data.sprintName).toBe("BT: 139");
    // VPL-3 draft-only → documented with isDraft + the draft content, out of missing.
    const vpl3 = data.documented.find((d: { key: string }) => d.key === "VPL-3");
    expect(vpl3?.isDraft).toBe(true);
    expect(vpl3?.doc).toBe("unreviewed draft");
    expect(data.documented.map((d: { key: string }) => d.key).sort()).toEqual(["VPL-1", "VPL-3"]);
    expect(data.internal.map((d: { key: string }) => d.key)).toEqual(["VPL-2"]);
    expect(data.notNeeded.map((d: { key: string }) => d.key)).toEqual(["VPL-6"]);
    // missing = neither a saved doc nor a draft.
    expect(data.missing.map((d: { key: string }) => d.key)).toEqual(["VPL-4"]);
    expect(data.missing.find((d: { key: string }) => d.key === "VPL-4")?.isDraft).toBeUndefined();
    expect(data.other.map((d: { key: string }) => d.key)).toEqual(["VPL-5"]);
  });

  it("folds draft-only finished stories into documented/internal by draft classification (BRDG-473)", async () => {
    seedTicket("VPL-1", { status: "DONE", draft: "**Draft feature**", draftClassification: "ok", storyPoints: 5 });
    seedTicket("VPL-2", { status: "TEST", draft: "internal draft", draftClassification: "not_stakeholder_relevant" });
    seedTicket("VPL-3", { status: "DONE", draft: "flagged draft", draftClassification: "needs_input" });
    // Null draft classification predates the column → documented/ok.
    seedTicket("VPL-4", { status: "DONE", draft: "legacy draft" });

    const data = await fetchBuckets();

    const documented = Object.fromEntries(
      data.documented.map((d: { key: string; isDraft?: boolean; doc: string; needsInput?: boolean }) => [d.key, d]),
    );
    expect(documented["VPL-1"]).toMatchObject({ isDraft: true, doc: "**Draft feature**", needsInput: false });
    expect(documented["VPL-3"]).toMatchObject({ isDraft: true, needsInput: true });
    expect(documented["VPL-4"]).toMatchObject({ isDraft: true, needsInput: false });
    expect(data.internal.find((d: { key: string }) => d.key === "VPL-2")).toMatchObject({
      isDraft: true,
      doc: "internal draft",
    });
    // None of them count as a delivery gap anymore.
    expect(data.missing).toEqual([]);
  });

  it("puts draft-only not-finished stories in other with the draft content + placement hint (BRDG-473)", async () => {
    seedTicket("VPL-1", { status: "IN PROGRESS", draft: "**WIP draft**", draftClassification: "ok" });
    seedTicket("VPL-2", { status: "TODO", draft: "internal wip draft", draftClassification: "not_stakeholder_relevant" });

    const data = await fetchBuckets();
    const other = Object.fromEntries(
      data.other.map((d: { key: string; doc: string | null; isDraft?: boolean; internalDoc?: boolean }) => [d.key, d]),
    );
    expect(other["VPL-1"]).toMatchObject({ isDraft: true, doc: "**WIP draft**", internalDoc: false });
    expect(other["VPL-2"]).toMatchObject({ isDraft: true, doc: "internal wip draft", internalDoc: true });
    // They are not auto-included; the modal's opt-in checkbox governs them.
    expect([...data.documented, ...data.internal]).toEqual([]);
  });

  it("keeps a saved doc when a newer draft also exists (draft branch is null-doc only)", async () => {
    seedTicket("VPL-1", {
      status: "DONE",
      doc: "**Saved doc**",
      classification: "ok",
      draft: "newer draft",
      draftClassification: "not_stakeholder_relevant",
    });

    const data = await fetchBuckets();
    const item = data.documented.find((d: { key: string }) => d.key === "VPL-1");
    expect(item?.doc).toBe("**Saved doc**");
    expect(item?.isDraft).toBeUndefined();
    expect(item?.hasDraft).toBe(true);
    expect(data.internal).toEqual([]);
  });

  it("keeps not-finished docs opt-in: doc-bearing not-Done tickets land in other, finished ones stay documented/internal", async () => {
    // Finished + doc → auto-included buckets (unchanged).
    seedTicket("VPL-10", { status: "DONE", doc: "**Done doc**", classification: "ok" });
    seedTicket("VPL-11", { status: "TEST", doc: "**Test doc**", classification: "ok" });
    seedTicket("VPL-12", { status: "DONE", doc: "Internal done", classification: "not_stakeholder_relevant" });
    // Not-finished + doc → other, carrying the doc + placement hint, NOT documented/internal.
    seedTicket("VPL-13", { status: "IN PROGRESS", doc: "**WIP doc**", classification: "ok" });
    seedTicket("VPL-14", { status: "TODO", doc: "Internal WIP", classification: "not_stakeholder_relevant" });
    // Not-finished + no doc → other with doc null (checkbox stays hidden).
    seedTicket("VPL-15", { status: "IN PROGRESS" });

    const data = await fetchBuckets();

    expect(data.documented.map((d: { key: string }) => d.key)).toEqual(["VPL-10", "VPL-11"]);
    expect(data.internal.map((d: { key: string }) => d.key)).toEqual(["VPL-12"]);
    expect(data.other.map((d: { key: string }) => d.key)).toEqual(["VPL-13", "VPL-14", "VPL-15"]);

    const other = Object.fromEntries(
      data.other.map((d: { key: string; doc: string | null; internalDoc?: boolean }) => [d.key, d]),
    );
    expect(other["VPL-13"].doc).toBe("**WIP doc**");
    expect(other["VPL-13"].internalDoc).toBe(false);
    expect(other["VPL-14"].doc).toBe("Internal WIP");
    expect(other["VPL-14"].internalDoc).toBe(true);
    expect(other["VPL-15"].doc).toBeNull();

    // Opt-in means the docs are absent from the auto-included buckets.
    const included = [...data.documented, ...data.internal].map((d: { key: string }) => d.key);
    expect(included).not.toContain("VPL-13");
    expect(included).not.toContain("VPL-14");
  });

  it("orders documented by story points desc, nulls last, then key", async () => {
    seedTicket("VPL-9", { doc: "small", storyPoints: 2 });
    seedTicket("VPL-8", { doc: "big", storyPoints: 8 });
    seedTicket("VPL-7", { doc: "no sp", storyPoints: null });

    const data = await fetchBuckets();
    expect(data.documented.map((d: { key: string }) => d.key)).toEqual(["VPL-8", "VPL-9", "VPL-7"]);
  });

  it("flags needs_input docs and treats null classification as ok", async () => {
    seedTicket("VPL-1", { doc: "flagged", classification: "needs_input" });
    seedTicket("VPL-2", { doc: "legacy" });
    testDb
      .update(ticketMetadata)
      .set({ testDocClassification: null })
      .where(eq(ticketMetadata.jiraKey, "VPL-2"))
      .run();

    const data = await fetchBuckets();
    const byKey = Object.fromEntries(
      data.documented.map((d: { key: string; needsInput?: boolean }) => [d.key, d.needsInput]),
    );
    expect(byKey["VPL-1"]).toBe(true);
    expect(byKey["VPL-2"]).toBe(false);
  });

  it("excludes subtasks, epics, removed tickets, draft statuses, deprecated and other sprints", async () => {
    seedTicket("VPL-1", { type: "subtask" });
    seedTicket("VPL-2", { type: "epic" });
    seedTicket("VPL-3", { removed: true });
    seedTicket("VPL-4", { status: "DRAFTING" });
    seedTicket("VPL-5", { sprintId: "9999" });
    seedTicket("VPL-7", { status: "DEPRECATED" });
    seedTicket("VPL-6", {});

    const data = await fetchBuckets();
    const allKeys = [...data.documented, ...data.internal, ...data.missing, ...data.other].map(
      (d: { key: string }) => d.key,
    );
    expect(allKeys).toEqual(["VPL-6"]);
  });

  it("falls back to a generic sprint name when uncached", async () => {
    const data = await fetchBuckets("777");
    expect(data.sprintName).toBe("Sprint 777");
    expect(data.documented).toEqual([]);
  });
});
