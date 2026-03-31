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
  return new Request("http://localhost:3100/api/sprint-slots", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validSlots = [
  { slotIndex: 0, sprintId: "s134", sprintName: "BT: 134" },
  { slotIndex: 1, sprintId: "s135", sprintName: "BT: 135" },
  { slotIndex: 2, sprintId: "candidates", sprintName: "Sprint 135 Candidates" },
];

describe("GET /api/sprint-slots", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no slots configured", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns configured slots sorted by index", async () => {
    await PUT(putRequest(validSlots));

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(3);
    expect(data[0].slotIndex).toBe(0);
    expect(data[1].slotIndex).toBe(1);
    expect(data[2].slotIndex).toBe(2);
  });
});

describe("PUT /api/sprint-slots", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves sprint slot configuration", async () => {
    const response = await PUT(putRequest(validSlots));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(3);
    expect(data[0].sprintId).toBe("s134");
    expect(data[0].sprintName).toBe("BT: 134");
  });

  it("replaces existing slots on update", async () => {
    await PUT(putRequest(validSlots));

    const newSlots = [
      { slotIndex: 0, sprintId: "s136", sprintName: "BT: 136" },
    ];
    const response = await PUT(putRequest(newSlots));
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].sprintId).toBe("s136");
  });

  it("trims whitespace from string fields", async () => {
    const slots = [
      { slotIndex: 0, sprintId: "  s134  ", sprintName: "  BT: 134  " },
    ];
    const response = await PUT(putRequest(slots));
    const data = await response.json();

    expect(data[0].sprintId).toBe("s134");
    expect(data[0].sprintName).toBe("BT: 134");
  });

  it("returns 400 when body is not an array", async () => {
    const response = await PUT(putRequest({ slotIndex: 0 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when slotIndex is out of range", async () => {
    const slots = [{ slotIndex: 5, sprintId: "s134", sprintName: "BT: 134" }];
    const response = await PUT(putRequest(slots));
    expect(response.status).toBe(400);
  });

  it("returns 400 when sprintId is missing", async () => {
    const slots = [{ slotIndex: 0, sprintName: "BT: 134" }];
    const response = await PUT(putRequest(slots));
    expect(response.status).toBe(400);
  });

  it("returns 400 when sprintName is missing", async () => {
    const slots = [{ slotIndex: 0, sprintId: "s134" }];
    const response = await PUT(putRequest(slots));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:3100/api/sprint-slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });
});
