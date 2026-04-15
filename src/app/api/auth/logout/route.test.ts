import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  clearSessionCookie: vi.fn(),
}));

import { clearSessionCookie } from "@/lib/auth";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with { success: true }", async () => {
    vi.mocked(clearSessionCookie).mockResolvedValue(undefined);
    const response = await POST();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("calls clearSessionCookie", async () => {
    vi.mocked(clearSessionCookie).mockResolvedValue(undefined);
    await POST();
    expect(clearSessionCookie).toHaveBeenCalled();
  });
});
