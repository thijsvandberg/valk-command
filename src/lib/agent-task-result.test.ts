// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const agentFetch = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => agentFetch(...args),
}));

import { runAgentTaskToCompletion } from "./agent-task-result";

const noWait = () => Promise.resolve();

function ok<T>(data: T) {
  return { ok: true as const, data, status: 200, retryCount: 0 };
}
function fail(error: string) {
  return { ok: false as const, error: { error, code: "UNREACHABLE" as const }, status: 0, retryCount: 0 };
}

describe("runAgentTaskToCompletion", () => {
  beforeEach(() => agentFetch.mockReset());

  it("submits and returns the completed output", async () => {
    agentFetch
      .mockResolvedValueOnce(ok({ id: "task-1" })) // POST /api/tasks
      .mockResolvedValueOnce(ok({ status: "running" })) // first poll
      .mockResolvedValueOnce(ok({ status: "completed", output: "done text" })); // second poll

    const result = await runAgentTaskToCompletion(
      { skill: "ask", args: { prompt: "hi" } },
      { sleep: noWait },
    );

    expect(result).toEqual({ ok: true, output: "done text" });
    // First call submits the task.
    expect(agentFetch).toHaveBeenNthCalledWith(1, "/api/tasks", expect.objectContaining({ method: "POST" }));
  });

  it("returns submit-failed when the submission fails", async () => {
    agentFetch.mockResolvedValueOnce(fail("unreachable"));
    const result = await runAgentTaskToCompletion({ skill: "ask" }, { sleep: noWait });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("submit-failed");
  });

  it("returns submit-failed when no task id is returned", async () => {
    agentFetch.mockResolvedValueOnce(ok({}));
    const result = await runAgentTaskToCompletion({ skill: "ask" }, { sleep: noWait });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("submit-failed");
  });

  it("returns task-failed when the task reports failed", async () => {
    agentFetch
      .mockResolvedValueOnce(ok({ id: "t" }))
      .mockResolvedValueOnce(ok({ status: "failed", error: "boom" }));
    const result = await runAgentTaskToCompletion({ skill: "ask" }, { sleep: noWait });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("task-failed");
      expect(result.error).toBe("boom");
    }
  });

  it("keeps polling through transient poll errors", async () => {
    agentFetch
      .mockResolvedValueOnce(ok({ id: "t" }))
      .mockResolvedValueOnce(fail("blip")) // transient poll error, not fatal
      .mockResolvedValueOnce(ok({ status: "completed", output: "ok" }));
    const result = await runAgentTaskToCompletion({ skill: "ask" }, { sleep: noWait });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toBe("ok");
  });

  it("times out after maxAttempts without completion", async () => {
    agentFetch
      .mockResolvedValueOnce(ok({ id: "t" }))
      .mockResolvedValue(ok({ status: "running" }));
    const result = await runAgentTaskToCompletion(
      { skill: "ask" },
      { sleep: noWait, maxAttempts: 3 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });
});
