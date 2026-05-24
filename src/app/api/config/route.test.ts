// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: {
    BT_NEXT_SPRINT_ID: "sprint-42",
  },
}));

import { GET } from "./route";

describe("GET /api/config", () => {
  it("returns config with nextSprintId", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ nextSprintId: "sprint-42" });
  });
});
