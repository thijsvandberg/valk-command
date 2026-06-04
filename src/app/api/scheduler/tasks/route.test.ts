// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetTaskEnabled = vi.hoisted(() => vi.fn());
const mockGetTaskStatuses = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/scheduler", () => ({
  setTaskEnabled: mockSetTaskEnabled,
  getTaskStatuses: mockGetTaskStatuses,
}));

vi.mock("@/lib/scheduled-tasks", () => ({
  registerScheduledTasks: vi.fn(),
}));

import { GET, POST } from "./route";

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost:3100/api/scheduler/tasks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }));
}

describe("POST /api/scheduler/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the enabled state for a known task", async () => {
    mockSetTaskEnabled.mockResolvedValue(true);
    const res = await post({ name: "deprecation-deep-scan", enabled: true });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ name: "deprecation-deep-scan", enabled: true });
    expect(mockSetTaskEnabled).toHaveBeenCalledWith("deprecation-deep-scan", true);
  });

  it("returns 404 for an unknown task name", async () => {
    mockSetTaskEnabled.mockResolvedValue(false);
    const res = await post({ name: "ghost-task", enabled: false });
    expect(res.status).toBe(404);
  });

  it("rejects a body missing required fields", async () => {
    const res = await post({ name: "x" });
    expect(res.status).toBe(400);
    expect(mockSetTaskEnabled).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean enabled value", async () => {
    const res = await post({ name: "x", enabled: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/scheduler/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current task statuses", async () => {
    mockGetTaskStatuses.mockResolvedValue([
      { name: "deprecation-deep-scan", enabled: false },
    ]);
    const data = await (await GET()).json();
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].name).toBe("deprecation-deep-scan");
  });
});
