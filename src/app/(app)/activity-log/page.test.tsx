import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SWRConfig } from "swr";
import ActivityLogPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/ActivityContext", () => ({
  useActivityContext: () => ({
    acknowledgeAllErrors: vi.fn(),
    mutateActivityLog: vi.fn(),
  }),
}));

// The /api/jira/sprints endpoint returns a wrapped object, not a bare array.
// This is the shape that previously crashed the page with "sprints is not iterable".
const SPRINTS_RESPONSE = {
  sprints: [{ id: 42, name: "Sprint Alpha", state: "active", startDate: null, endDate: null, goal: null }],
  backlogCount: 3,
};

const ENTRIES_RESPONSE = [
  {
    id: "entry-1",
    type: "sprint-sync",
    scope: "42",
    status: "success",
    summary: "Synced sprint",
    errorDetail: null,
    durationMs: 1200,
    startedAt: "2026-05-29T10:00:00.000Z",
    completedAt: "2026-05-29T10:00:01.200Z",
    acknowledged: true,
    sprintName: null,
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("include=stats")) {
      return { ok: true, status: 200, json: async () => ({ stats: null }) } as Response;
    }
    if (url.includes("/api/jira/sprints")) {
      return { ok: true, status: 200, json: async () => SPRINTS_RESPONSE } as Response;
    }
    if (url.includes("/api/activity-log")) {
      return { ok: true, status: 200, json: async () => ENTRIES_RESPONSE } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
});

function renderPage() {
  // Fresh SWR cache per render so tests don't share cached responses
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ActivityLogPage />
    </SWRConfig>,
  );
}

describe("ActivityLogPage", () => {
  it("renders without crashing given the wrapped { sprints, backlogCount } response", async () => {
    renderPage();
    // Reaching the activity table proves the sprintMap useMemo did not throw
    // "sprints is not iterable" on the wrapped response shape.
    await waitFor(() => {
      expect(screen.getByText("Synced sprint")).toBeInTheDocument();
    });
  });

  it("resolves sprint names from the wrapped response into the activity table", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sprint Alpha")).toBeInTheDocument();
    });
  });
});
