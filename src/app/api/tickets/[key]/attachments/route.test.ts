import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticketAttachment, ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function getRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/attachments`);
}

describe("GET /api/tickets/[key]/attachments", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no attachments exist", async () => {
    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns attachments with status 'available' when downloaded", async () => {
    seedTicket(testDb, "VPL-100");
    testDb.insert(ticketAttachment).values({
      id: "att-1",
      ticketKey: "VPL-100",
      filename: "screenshot.png",
      mimeType: "image/png",
      size: 50000,
      downloadedAt: "2026-03-15T10:00:00Z",
      localPath: "/tmp/att-1.png",
    }).run();

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("available");
    expect(data[0].filename).toBe("screenshot.png");
  });

  it("returns attachments with status 'cleaned' when cleanedAt is set", async () => {
    seedTicket(testDb, "VPL-100");
    testDb.insert(ticketAttachment).values({
      id: "att-2",
      ticketKey: "VPL-100",
      filename: "old-file.pdf",
      mimeType: "application/pdf",
      size: 120000,
      downloadedAt: "2026-01-10T10:00:00Z",
      cleanedAt: "2026-03-10T00:00:00Z",
    }).run();

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("cleaned");
  });

  it("returns attachments with status 'pending' when not yet downloaded", async () => {
    seedTicket(testDb, "VPL-100");
    testDb.insert(ticketAttachment).values({
      id: "att-3",
      ticketKey: "VPL-100",
      filename: "new-file.docx",
      mimeType: "application/docx",
      size: 30000,
    }).run();

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("pending");
  });

  it("only returns attachments for the requested ticket", async () => {
    seedTicket(testDb, "VPL-100");
    seedTicket(testDb, "VPL-200");
    testDb.insert(ticketAttachment).values({
      id: "att-4",
      ticketKey: "VPL-100",
      filename: "file-a.png",
      mimeType: "image/png",
      size: 10000,
    }).run();
    testDb.insert(ticketAttachment).values({
      id: "att-5",
      ticketKey: "VPL-200",
      filename: "file-b.png",
      mimeType: "image/png",
      size: 20000,
    }).run();

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].ticketKey).toBe("VPL-100");
  });
});
