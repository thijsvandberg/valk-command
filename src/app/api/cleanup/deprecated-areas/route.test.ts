// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST, PUT, DELETE } from "./route";

function req(method: string, body?: unknown) {
  return new Request("http://localhost:3100/api/cleanup/deprecated-areas", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/cleanup/deprecated-areas", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("GET lists the seeded areas", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    const terms = data.areas.map((a: { term: string }) => a.term).sort();
    expect(terms).toEqual(["CWI", "IDPMS", "RezExchange", "hybrid cloud"]);
  });

  it("POST adds a new area", async () => {
    const res = await POST(req("POST", { term: "FooBar", aliases: "foo-bar", note: "gone" }));
    expect(res.status).toBe(201);
    const { area } = await res.json();
    expect(area.term).toBe("FooBar");
    expect(area.aliases).toBe("foo-bar");

    const listed = await (await GET()).json();
    expect(listed.areas.some((a: { term: string }) => a.term === "FooBar")).toBe(true);
  });

  it("POST rejects an empty term", async () => {
    const res = await POST(req("POST", { term: "   " }));
    expect(res.status).toBe(400);
  });

  it("PUT edits an existing area", async () => {
    const created = await (await POST(req("POST", { term: "Temp" }))).json();
    const res = await PUT(req("PUT", { id: created.area.id, term: "Renamed", aliases: "r" }));
    expect(res.status).toBe(200);
    const { area } = await res.json();
    expect(area.term).toBe("Renamed");
    expect(area.aliases).toBe("r");
  });

  it("PUT returns 404 for an unknown id", async () => {
    const res = await PUT(req("PUT", { id: "does-not-exist", term: "X" }));
    expect(res.status).toBe(404);
  });

  it("DELETE removes an area", async () => {
    const created = await (await POST(req("POST", { term: "Doomed" }))).json();
    const res = await DELETE(req("DELETE", { id: created.area.id }));
    expect(res.status).toBe(204);

    const listed = await (await GET()).json();
    expect(listed.areas.some((a: { term: string }) => a.term === "Doomed")).toBe(false);
  });

  it("DELETE rejects a missing id", async () => {
    const res = await DELETE(req("DELETE", {}));
    expect(res.status).toBe(400);
  });
});
