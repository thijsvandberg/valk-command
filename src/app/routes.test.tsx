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
  { path: "/test-center", file: "src/app/(app)/test-center/page.tsx", name: "Test Center" },
  { path: "/refinement", file: "src/app/(app)/refinement/page.tsx", name: "Refinement" },
  { path: "/jobs", file: "src/app/(app)/jobs/page.tsx", name: "Jobs" },
  { path: "/stakeholder", file: "src/app/(app)/stakeholder/page.tsx", name: "Stakeholder" },
  { path: "/sprint-board/diff-preview", file: "src/app/(app)/sprint-board/diff-preview/page.tsx", name: "Diff Preview" },
  { path: "/tickets/[key]", file: "src/app/(app)/tickets/[key]/page.tsx", name: "Ticket Detail" },
  { path: "/tickets/[key]/write", file: "src/app/(app)/tickets/[key]/write/page.tsx", name: "Story Writer" },
  { path: "/changelog", file: "src/app/changelog/page.tsx", name: "Changelog" },
  { path: "/activity-log", file: "src/app/(app)/activity-log/page.tsx", name: "Activity Log" },
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
