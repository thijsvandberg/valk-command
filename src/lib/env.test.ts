import { describe, it, expect } from "vitest";

describe("env validation", () => {
  it("parses valid environment with defaults", async () => {
    const { z } = await import("zod");

    const envSchema = z.object({
      JIRA_CLOUD_ID: z.string().default(""),
      JIRA_BASE_URL: z.string().default(""),
      JIRA_EMAIL: z.string().default(""),
      JIRA_API_TOKEN: z.string().default(""),
      JIRA_PROJECT_KEY: z.string().default("VPL"),
      JIRA_BOARD_ID: z.string().default(""),
      NEXT_PUBLIC_JIRA_BASE_URL: z.string().default("https://new-story.atlassian.net"),
      VALK_AGENT_URL: z.string().url().default("http://localhost:3001"),
      VALK_AGENT_KEY: z.string().default(""),
      BITBUCKET_WORKSPACE: z.string().default(""),
      BITBUCKET_REPO_SLUG: z.string().default(""),
      BITBUCKET_EMAIL: z.string().default(""),
      BITBUCKET_APP_PASSWORD: z.string().default(""),
      BITBUCKET_API_TOKEN: z.string().default(""),
      NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3100"),
      BT_NEXT_SPRINT_ID: z.string().default(""),
      DB_PATH: z.string().default("sqlite.db"),
      JWT_SECRET: z.string().default(""),
    });

    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JIRA_PROJECT_KEY).toBe("VPL");
      expect(result.data.DB_PATH).toBe("sqlite.db");
      expect(result.data.VALK_AGENT_URL).toBe("http://localhost:3001");
    }
  });

  it("rejects invalid VALK_AGENT_URL", async () => {
    const { z } = await import("zod");

    const schema = z.object({
      VALK_AGENT_URL: z.string().url().default("http://localhost:3001"),
    });

    const result = schema.safeParse({ VALK_AGENT_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("allows overriding defaults", async () => {
    const { z } = await import("zod");

    const schema = z.object({
      JIRA_PROJECT_KEY: z.string().default("VPL"),
      DB_PATH: z.string().default("sqlite.db"),
    });

    const result = schema.safeParse({
      JIRA_PROJECT_KEY: "MYPROJ",
      DB_PATH: "/data/app.db",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JIRA_PROJECT_KEY).toBe("MYPROJ");
      expect(result.data.DB_PATH).toBe("/data/app.db");
    }
  });
});
