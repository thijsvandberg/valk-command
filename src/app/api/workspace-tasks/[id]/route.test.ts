import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

import { agentFetch } from "@/lib/agent-fetch";
import { GET, DELETE } from "./route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/workspace-tasks/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns task data on success", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-1", status: "running" },
      status: 200,
    });

    const response = await GET(
      new Request("http://localhost:3100/api/workspace-tasks/task-1"),
      makeParams("task-1")
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("task-1");
  });

  it("returns error response when agent fails", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: false,
      error: { error: "Not found", code: "NOT_FOUND" },
      status: 404,
    });

    const response = await GET(
      new Request("http://localhost:3100/api/workspace-tasks/missing"),
      makeParams("missing")
    );
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });
});

describe("DELETE /api/workspace-tasks/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success response on delete", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { deleted: true },
      status: 200,
    });

    const response = await DELETE(
      new Request("http://localhost:3100/api/workspace-tasks/task-1", { method: "DELETE" }),
      makeParams("task-1")
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.deleted).toBe(true);
  });

  it("returns error when agent delete fails", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: false,
      error: { error: "Not found", code: "NOT_FOUND" },
      status: 404,
    });

    const response = await DELETE(
      new Request("http://localhost:3100/api/workspace-tasks/missing", { method: "DELETE" }),
      makeParams("missing")
    );
    expect(response.status).toBe(404);
  });
});
