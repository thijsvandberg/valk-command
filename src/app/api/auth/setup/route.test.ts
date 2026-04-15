import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  isPasswordSet: vi.fn(),
  hashPassword: vi.fn(),
  setPasswordHash: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));

import { isPasswordSet, hashPassword, setPasswordHash, createSession, setSessionCookie } from "@/lib/auth";
import { GET, POST } from "./route";

describe("GET /api/auth/setup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns { needsSetup: true } when isPasswordSet returns false", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ needsSetup: true });
  });

  it("returns { needsSetup: false } when isPasswordSet returns true", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(true);
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ needsSetup: false });
  });
});

describe("POST /api/auth/setup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 400 when password is already set", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(true);
    const request = new Request("http://localhost:3100/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: "newpassword" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/already/i);
  });

  it("returns 400 when password is missing", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(false);
    const request = new Request("http://localhost:3100/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when password is not a string", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(false);
    const request = new Request("http://localhost:3100/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: 12345678 }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when password is too short (< 8 chars)", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(false);
    const request = new Request("http://localhost:3100/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: "short" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/8 characters/i);
  });

  it("returns 400 for invalid JSON", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(false);
    const request = new Request("http://localhost:3100/api/auth/setup", {
      method: "POST",
      body: "not-valid-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 200 and calls hashPassword, setPasswordHash, createSession, setSessionCookie on valid setup", async () => {
    vi.mocked(isPasswordSet).mockResolvedValue(false);
    vi.mocked(hashPassword).mockReturnValue("hashed-pw");
    vi.mocked(setPasswordHash).mockResolvedValue(undefined);
    vi.mocked(createSession).mockResolvedValue("session-token");
    vi.mocked(setSessionCookie).mockResolvedValue(undefined);

    const request = new Request("http://localhost:3100/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: "validpassword" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(hashPassword).toHaveBeenCalledWith("validpassword");
    expect(setPasswordHash).toHaveBeenCalledWith("hashed-pw");
    expect(createSession).toHaveBeenCalled();
    expect(setSessionCookie).toHaveBeenCalledWith("session-token");
  });
});
