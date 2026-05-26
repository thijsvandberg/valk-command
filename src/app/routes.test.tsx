import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Route manifest: single source of truth for all expected routes.
 * If a route disappears or its page file is removed, this test fails.
 * Update this list when adding or removing routes.
 */
const EXPECTED_ROUTES = [
  { path: "/", file: "src/app/(app)/page.tsx", name: "Dashboard" },
  { path: "/chat", file: "src/app/(app)/chat/page.tsx", name: "Chat" },
  { path: "/chat/[id]", file: "src/app/(app)/chat/[id]/page.tsx", name: "Chat Conversation" },
  { path: "/sprint-board", file: "src/app/(app)/sprint-board/page.tsx", name: "Sprint Board" },
  { path: "/pipelines", file: "src/app/(app)/pipelines/page.tsx", name: "Pipelines" },
  { path: "/test-center", file: "src/app/(app)/test-center/page.tsx", name: "Test Center" },
  { path: "/refinement", file: "src/app/(app)/refinement/page.tsx", name: "Refinement" },
  { path: "/story-writer", file: "src/app/(app)/story-writer/page.tsx", name: "Story Writer" },
  { path: "/settings/jobs", file: "src/app/(app)/settings/jobs/page.tsx", name: "Settings Workspace Jobs" },
  { path: "/stakeholder", file: "src/app/(app)/stakeholder/page.tsx", name: "Stakeholder" },
  { path: "/sprint-board/diff-preview", file: "src/app/(app)/sprint-board/diff-preview/page.tsx", name: "Diff Preview" },
  { path: "/tickets/[key]", file: "src/app/(app)/tickets/[key]/page.tsx", name: "Ticket Detail" },
  { path: "/tickets/[key]/write", file: "src/app/(app)/tickets/[key]/write/page.tsx", name: "Story Writer" },
  { path: "/activity-log", file: "src/app/(app)/activity-log/page.tsx", name: "Activity Log" },
  { path: "/settings", file: "src/app/(app)/settings/page.tsx", name: "Settings" },
  { path: "/settings/prompts", file: "src/app/(app)/settings/prompts/page.tsx", name: "Settings Prompts" },
  { path: "/settings/scheduler", file: "src/app/(app)/settings/scheduler/page.tsx", name: "Settings Scheduler" },
  { path: "/settings/notifications", file: "src/app/(app)/settings/notifications/page.tsx", name: "Settings Notifications" },
  { path: "/settings/integrations", file: "src/app/(app)/settings/integrations/page.tsx", name: "Settings Integrations" },
  { path: "/settings/people", file: "src/app/(app)/settings/people/page.tsx", name: "Settings People" },
  { path: "/login", file: "src/app/login/[[...rest]]/page.tsx", name: "Login" },
{ path: "/sprint-board/compare", file: "src/app/(app)/sprint-board/compare/page.tsx", name: "Sprint Compare" },
  { path: "/refinement/[sessionId]", file: "src/app/(app)/refinement/[sessionId]/page.tsx", name: "Refinement Session Detail" },
  { path: "/refinement/[sessionId]/session", file: "src/app/(app)/refinement/[sessionId]/session/page.tsx", name: "Refinement Session" },
  { path: "/refinement/[sessionId]/session/[ticketKey]", file: "src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx", name: "Refinement Session Ticket" },
];

// API route manifest: ensures search API route files exist
const EXPECTED_API_ROUTES = [
  { path: "/api/search/local", file: "src/app/api/search/local/route.ts", name: "Local Search API" },
  { path: "/api/search/jira", file: "src/app/api/search/jira/route.ts", name: "Jira Search API" },
  { path: "/api/settings/quick-prompts", file: "src/app/api/settings/quick-prompts/route.ts", name: "Quick Prompts Settings API" },
  { path: "/api/scheduler/tick", file: "src/app/api/scheduler/tick/route.ts", name: "Scheduler Tick API" },
  { path: "/api/tickets/[key]/versions/import", file: "src/app/api/tickets/[key]/versions/import/route.ts", name: "Versions Import API" },
];

const ROOT = join(__dirname, "../..");

describe("Route manifest", () => {
  it.each(EXPECTED_ROUTES)(
    "$name ($path) page file exists",
    ({ file }) => {
      const fullPath = join(ROOT, file);
      expect(existsSync(fullPath)).toBe(true);
    },
  );

  it.each(EXPECTED_API_ROUTES)(
    "$name ($path) route file exists",
    ({ file }) => {
      const fullPath = join(ROOT, file);
      expect(existsSync(fullPath)).toBe(true);
    },
  );

  it("manifest covers all page.tsx files in src/app", async () => {
    const glob = await import("fast-glob");
    const pageFiles = await glob.default("src/app/**/page.tsx", { cwd: ROOT });
    const manifestFiles = EXPECTED_ROUTES.map((r) => r.file);
    const missing = pageFiles.filter(
      (f) => !manifestFiles.includes(f) && !f.includes("page.test"),
    );
    expect(missing).toEqual([]);
  });
});
