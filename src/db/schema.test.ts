// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  sqlite.close();
});

describe("conversation table", () => {
  it("inserts and queries a conversation", () => {
    db.insert(schema.conversation)
      .values({ id: "conv-1", title: "Test chat", createdAt: "2026-03-28T00:00:00Z" })
      .run();

    const rows = db.select().from(schema.conversation).where(eq(schema.conversation.id, "conv-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Test chat");
    expect(rows[0].relatedTicket).toBeNull();
  });
});

describe("message table", () => {
  it("inserts and queries a message linked to a conversation", () => {
    db.insert(schema.message)
      .values({
        id: "msg-1",
        conversationId: "conv-1",
        role: "user",
        content: "Hello",
        timestamp: "2026-03-28T00:00:01Z",
      })
      .run();

    const rows = db.select().from(schema.message).where(eq(schema.message.conversationId, "conv-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("user");
    expect(rows[0].workspaceTaskId).toBeNull();
  });
});

describe("ticket table", () => {
  it("inserts and queries a ticket", () => {
    db.insert(schema.ticket)
      .values({ jiraKey: "VALK-100", title: "Test ticket", status: "To Do" })
      .run();

    const rows = db.select().from(schema.ticket).where(eq(schema.ticket.jiraKey, "VALK-100")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Test ticket");
    expect(rows[0].storyPoints).toBeNull();
  });
});

describe("ticket_metadata table", () => {
  it("inserts metadata with defaults and links to ticket", () => {
    db.insert(schema.ticketMetadata)
      .values({ jiraKey: "VALK-100" })
      .run();

    const rows = db.select().from(schema.ticketMetadata).where(eq(schema.ticketMetadata.jiraKey, "VALK-100")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].refinementReadiness).toBe("not_ready");
    expect(rows[0].testStatus).toBe("untested");
    expect(rows[0].qualityScore).toBeNull();
  });
});

describe("workspace_task table", () => {
  it("inserts and queries a workspace task", () => {
    db.insert(schema.workspaceTask)
      .values({
        id: "wt-1",
        skillName: "test-runner",
        status: "queued",
        startedAt: "2026-03-28T00:00:00Z",
      })
      .run();

    const rows = db.select().from(schema.workspaceTask).where(eq(schema.workspaceTask.id, "wt-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("queued");
    expect(rows[0].completedAt).toBeNull();
  });
});

describe("scheduled_job table", () => {
  it("inserts and queries a scheduled job with defaults", () => {
    db.insert(schema.scheduledJob)
      .values({
        id: "job-1",
        name: "Daily sync",
        cronExpression: "0 9 * * *",
        skillName: "jira-sync",
      })
      .run();

    const rows = db.select().from(schema.scheduledJob).where(eq(schema.scheduledJob.id, "job-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].lastRunAt).toBeNull();
  });
});

describe("alert table", () => {
  it("inserts and queries an alert with defaults", () => {
    db.insert(schema.alert)
      .values({
        id: "alert-1",
        type: "sprint_anomaly",
        message: "Velocity dropped",
        createdAt: "2026-03-28T00:00:00Z",
      })
      .run();

    const rows = db.select().from(schema.alert).where(eq(schema.alert.id, "alert-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].read).toBe(false);
    expect(rows[0].jiraKey).toBeNull();
  });
});
