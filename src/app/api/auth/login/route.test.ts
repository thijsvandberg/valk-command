import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
  getPasswordHash: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));

import { verifyPassword, getPasswordHash, createSession, setSessionCookie } from "@/lib/auth";
import { POST } from "./route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const request = new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      body: "not-valid-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when password field is missing", async () => {
    const request = new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when password is not a string", async () => {
    const request = new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: 123 }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when no password hash configured", async () => {
    vi.mocked(getPasswordHash).mockResolvedValue(null);
    const request = new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "somepassword" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/setup/i);
  });

  it("returns 401 when password is wrong", async () => {
    vi.mocked(getPasswordHash).mockResolvedValue("hashed");
    vi.mocked(verifyPassword).mockReturnValue(false);
    const request = new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrongpassword" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 and calls createSession + setSessionCookie on valid login", async () => {
    vi.mocked(getPasswordHash).mockResolvedValue("hashed");
    vi.mocked(verifyPassword).mockReturnValue(true);
    vi.mocked(createSession).mockResolvedValue("session-token");
    vi.mocked(setSessionCookie).mockResolvedValue(undefined);

    const request = new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "correctpassword" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(createSession).toHaveBeenCalled();
    expect(setSessionCookie).toHaveBeenCalledWith("session-token");
  });
});
