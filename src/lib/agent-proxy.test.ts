// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    VALK_AGENT_URL: "http://agent:3001",
    VALK_AGENT_KEY: "test-secret-key",
  },
}));

import { agentUrl, agentHeaders } from "./agent-proxy";

describe("agentUrl", () => {
  it("concatenates base URL with path", () => {
    expect(agentUrl("/api/tasks")).toBe("http://agent:3001/api/tasks");
  });

  it("handles paths without leading slash", () => {
    expect(agentUrl("health")).toBe("http://agent:3001health");
  });
});

describe("agentHeaders", () => {
  it("returns Authorization Bearer header and Content-Type", () => {
    const headers = agentHeaders();
    expect(headers).toEqual({
      Authorization: "Bearer test-secret-key",
      "Content-Type": "application/json",
    });
  });

  it("throws when VALK_AGENT_KEY is empty", async () => {
    const { env } = await import("@/lib/env");
    const original = env.VALK_AGENT_KEY;
    (env as Record<string, string>).VALK_AGENT_KEY = "";
    expect(() => agentHeaders()).toThrow("VALK_AGENT_KEY");
    (env as Record<string, string>).VALK_AGENT_KEY = original;
  });
});
