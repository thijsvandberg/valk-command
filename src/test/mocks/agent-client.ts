import { vi } from "vitest";

/**
 * Creates a mock for `@/lib/agent-fetch` suitable for `vi.mock()`.
 *
 * Usage:
 *   vi.mock("@/lib/agent-fetch", () => createAgentFetchMock());
 *   vi.mock("@/lib/agent-fetch", () => createAgentFetchMock({
 *     agentFetch: vi.fn().mockResolvedValue({ ok: true, data: { id: "task-1" }, status: 200, retryCount: 0 }),
 *   }));
 */
export function createAgentFetchMock(overrides?: {
  agentFetch?: unknown;
  agentFetchStream?: unknown;
}) {
  return {
    agentFetch: overrides?.agentFetch ??
      vi.fn().mockResolvedValue({
        ok: true,
        data: { id: "task-1" },
        status: 200,
        retryCount: 0,
      }),
    agentFetchStream: overrides?.agentFetchStream ??
      vi.fn().mockResolvedValue({
        ok: true,
        data: new Response(""),
        status: 200,
        retryCount: 0,
      }),
  };
}

/** Helper to create a successful agent response */
export function agentSuccess<T>(data: T, status = 200) {
  return { ok: true as const, data, status, retryCount: 0 };
}

/** Helper to create a failed agent response */
export function agentError(
  error: string,
  code: string = "SERVER_ERROR",
  status = 500,
) {
  return { ok: false as const, error: { error, code }, status, retryCount: 0 };
}
