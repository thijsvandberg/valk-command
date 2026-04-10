import "server-only";
import { z } from "zod";

const envSchema = z.object({
  // Jira Integration
  JIRA_CLOUD_ID: z.string().default(""),
  JIRA_BASE_URL: z.string().default(""),
  JIRA_EMAIL: z.string().default(""),
  JIRA_API_TOKEN: z.string().default(""),
  JIRA_PROJECT_KEY: z.string().default("VPL"),
  JIRA_BOARD_ID: z.string().default(""),

  // Jira UI Links (also available client-side via NEXT_PUBLIC_)
  NEXT_PUBLIC_JIRA_BASE_URL: z.string().default("https://new-story.atlassian.net"),

  // Workspace Agent
  VALK_AGENT_URL: z.string().url().default("http://localhost:3001"),
  VALK_AGENT_KEY: z.string().default(""),

  // Bitbucket Cloud
  BITBUCKET_WORKSPACE: z.string().default(""),
  BITBUCKET_REPO_SLUG: z.string().default(""),
  BITBUCKET_EMAIL: z.string().default(""),
  BITBUCKET_APP_PASSWORD: z.string().default(""),
  BITBUCKET_API_TOKEN: z.string().default(""),

  // App
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3100"),
  BT_NEXT_SPRINT_ID: z.string().default(""),
  DB_PATH: z.string().default("sqlite.db"),

  // Auth (set at runtime via JWT signing)
  JWT_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables. See .env.example for setup.\n${formatted}`,
    );
  }
  return result.data;
}

export const env = parseEnv();
