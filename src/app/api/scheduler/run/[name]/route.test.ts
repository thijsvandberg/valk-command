// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunTaskNow = vi.hoisted(() => vi.fn());
const mockRunIndependentTaskNow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/scheduler", () => ({
  runTaskNow: mockRunTaskNow,
}));

vi.mock("@/lib/scheduled-tasks", () => ({
  registerScheduledTasks: vi.fn(),
}));

vi.mock("@/lib/task-registry", () => ({
  runIndependentTaskNow: mockRunIndependentTaskNow,
}));

// Rate limiter and path validation are exercised by their own tests; here they
// must pass through so the route reaches runTaskNow.
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api-validation", () => ({
  validatePathParam: vi.fn().mockReturnValue(null),
}));

vi.mock("@/app/api/pipelines/tick/route", () => ({}));

import { POST } from "./route";

function call(name: string) {
  return POST(new Request("http://localhost/api/scheduler/run/" + name, { method: "POST" }), {
    params: Promise.resolve({ name }),
  });
}

describe("POST /api/scheduler/run/[name]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunIndependentTaskNow.mockResolvedValue(null);
  });

  it("returns 200 ran:true for a successful shared task", async () => {
    mockRunTaskNow.mockResolvedValue({ synced: 3 });

    const res = await call("incremental-sync");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ran: true, result: { synced: 3 } });
  });

  // BRDG-401: a failed run used to come back as 200 "ran:true", hiding the
  // failure. runTaskNow returns an { error } result on a thrown handler; the
  // route must surface that as a 500.
  it("returns 500 when the shared task result carries an error", async () => {
    mockRunTaskNow.mockResolvedValue({ error: "boom" });

    const res = await call("incremental-sync");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ran: true, result: { error: "boom" } });
  });

  it("returns 500 when an independent task result carries an error", async () => {
    mockRunTaskNow.mockResolvedValue(null);
    mockRunIndependentTaskNow.mockResolvedValue({ error: "pipeline failed" });

    const res = await call("pipeline-check");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ran: true, result: { error: "pipeline failed" } });
  });

  it("returns 200 for a successful independent task", async () => {
    mockRunTaskNow.mockResolvedValue(null);
    mockRunIndependentTaskNow.mockResolvedValue({ ok: true });

    const res = await call("pipeline-check");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ran: true, result: { ok: true } });
  });

  it("does not treat an empty error string as a failure", async () => {
    mockRunTaskNow.mockResolvedValue({ error: "" });

    const res = await call("incremental-sync");
    expect(res.status).toBe(200);
  });

  it("returns 404 when the task is not found in either registry", async () => {
    mockRunTaskNow.mockResolvedValue(null);
    mockRunIndependentTaskNow.mockResolvedValue(null);

    const res = await call("nope");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Task not found" });
  });
});
