import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";

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
  NEXT_PUBLIC_JIRA_PROJECT_KEY: z.string().default("VPL"),
  NEXT_PUBLIC_JIRA_BOARD_ID: z.string().default(""),

  // Workspace Agent (VRW prod default port; dev VRW runs on 3111)
  VALK_AGENT_URL: z.string().url().default("http://localhost:3110"),
  VALK_AGENT_KEY: z.string().default(""),

  // Confluence Integration
  CONFLUENCE_BASE_URL: z.string().default(""),
  CONFLUENCE_EMAIL: z.string().default(""),
  CONFLUENCE_API_TOKEN: z.string().default(""),
  CONFLUENCE_SPACE_KEY: z.string().default(""),

  // Bitbucket Cloud
  BITBUCKET_WORKSPACE: z.string().default(""),
  BITBUCKET_REPO_SLUG: z.string().default(""),
  BITBUCKET_EMAIL: z.string().default(""),
  BITBUCKET_APP_PASSWORD: z.string().default(""),
  BITBUCKET_API_TOKEN: z.string().default(""),

  // App (Bridge dev port; prod runs on 3100)
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3101"),
  BT_NEXT_SPRINT_ID: z.string().default(""),
  DB_PATH: z.string().default("sqlite.db"),

  // Slow-query threshold in ms (BRDG-404). Read directly in query-timer at init;
  // declared here so the knob is documented alongside the rest of the env.
  QUERY_SLOW_MS: z.string().default(""),

  // Auth (Clerk) — CLERK_SECRET_KEY is read by @clerk/nextjs directly from process.env
  CLERK_ORG_ID: z.string().default(""),
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

// Integration credentials that gate a feature. Each entry maps the disabled
// feature's label to the single env var whose emptiness disables it. Only the
// VAR NAME is ever surfaced — never its value — so this is safe to log.
const INTEGRATION_CREDENTIALS: ReadonlyArray<{ feature: string; varName: keyof Env }> = [
  { feature: "Jira", varName: "JIRA_API_TOKEN" },
  { feature: "Bitbucket", varName: "BITBUCKET_API_TOKEN" },
  { feature: "Confluence", varName: "CONFLUENCE_API_TOKEN" },
  { feature: "Agent", varName: "VALK_AGENT_KEY" },
];

/**
 * Builds the "<feature> disabled: <VAR> missing" lines for every integration
 * whose credential is empty. Pure (env is injected) and returns only var NAMES,
 * never values, so the result is safe to log and easy to assert in tests.
 */
export function missingIntegrationCredentials(e: Env = env): string[] {
  return INTEGRATION_CREDENTIALS.filter(({ varName }) => !e[varName]).map(
    ({ feature, varName }) => `${feature} disabled: ${varName} missing`,
  );
}

/**
 * Emits one warn line naming the integration credentials that are empty, so a
 * degraded boot (a forgotten token) is explicit in the log instead of silently
 * returning empty data later. Intentionally does NOT hard-fail. Call this at
 * boot (instrumentation register), not at module load, so it does not spam
 * during tests or the build. The caller passes the live env by default.
 */
export function logConfigStatus(e: Env = env): void {
  const missing = missingIntegrationCredentials(e);
  if (missing.length === 0) return;
  logger.warn("config", `integrations disabled (missing credentials): ${missing.join("; ")}`);
}
