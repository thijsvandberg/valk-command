// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTick = vi.hoisted(() => vi.fn().mockResolvedValue({ ran: [], results: {}, checked: 0 }));
const mockGetTaskStatuses = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockGetIndependentTaskStatuses = vi.hoisted(() => vi.fn().mockReturnValue([]));

vi.mock("@/lib/scheduler", () => ({
  tick: mockTick,
  getTaskStatuses: mockGetTaskStatuses,
}));

vi.mock("@/lib/scheduled-tasks", () => ({
  registerScheduledTasks: vi.fn(),
}));

vi.mock("@/lib/task-registry", () => ({
  getIndependentTaskStatuses: mockGetIndependentTaskStatuses,
}));

vi.mock("@/app/api/pipelines/tick/route", () => ({}));

import { POST, GET } from "./route";

describe("POST /api/scheduler/tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls tick() and returns its result", async () => {
    const tickResult = { ran: ["sync"], results: { sync: "ok" }, checked: 3 };
    mockTick.mockResolvedValue(tickResult);

    const res = await POST();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual(tickResult);
    expect(mockTick).toHaveBeenCalled();
  });
});

describe("GET /api/scheduler/tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns merged tasks array from shared and independent statuses", async () => {
    mockGetTaskStatuses.mockResolvedValue([
      { name: "incremental-sync", lastRun: "2026-01-01", nextRun: "2026-01-02" },
    ]);
    mockGetIndependentTaskStatuses.mockReturnValue([
      { name: "pipeline-check", lastRun: "2026-01-01", nextRun: "2026-01-02" },
    ]);

    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.map((t: { name: string }) => t.name)).toContain("incremental-sync");
    expect(data.tasks.map((t: { name: string }) => t.name)).toContain("pipeline-check");
  });
});
