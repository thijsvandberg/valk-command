// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Boot config-summary tests: missingIntegrationCredentials() must list exactly
// the integrations whose credential is empty, by VAR NAME only (never a value),
// and logConfigStatus() must emit a single warn line (or none when all set).
// The logger is mocked so we assert on the call rather than console output; env
// is injected into both functions so these cases do not depend on process.env.

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "@/lib/logger";
import { missingIntegrationCredentials, logConfigStatus, type Env } from "@/lib/env";

// Every gated credential populated with a sentinel value. Individual tests blank
// out the ones they want reported as missing. Only fields the summary inspects
// need to be present; the helpers read just these four.
function envWithAllCreds(overrides: Partial<Env> = {}): Env {
  return {
    JIRA_API_TOKEN: "jira-secret",
    BITBUCKET_API_TOKEN: "bitbucket-secret",
    CONFLUENCE_API_TOKEN: "confluence-secret",
    VALK_AGENT_KEY: "agent-secret",
    ...overrides,
  } as Env;
}

describe("missingIntegrationCredentials", () => {
  it("returns an empty list when every gated credential is set", () => {
    expect(missingIntegrationCredentials(envWithAllCreds())).toEqual([]);
  });

  it("names exactly the integrations whose credential is empty", () => {
    const missing = missingIntegrationCredentials(
      envWithAllCreds({ JIRA_API_TOKEN: "", VALK_AGENT_KEY: "" }),
    );
    expect(missing).toEqual([
      "Jira disabled: JIRA_API_TOKEN missing",
      "Agent disabled: VALK_AGENT_KEY missing",
    ]);
  });

  it("covers all four integrations when none are configured", () => {
    const missing = missingIntegrationCredentials(
      envWithAllCreds({
        JIRA_API_TOKEN: "",
        BITBUCKET_API_TOKEN: "",
        CONFLUENCE_API_TOKEN: "",
        VALK_AGENT_KEY: "",
      }),
    );
    expect(missing).toEqual([
      "Jira disabled: JIRA_API_TOKEN missing",
      "Bitbucket disabled: BITBUCKET_API_TOKEN missing",
      "Confluence disabled: CONFLUENCE_API_TOKEN missing",
      "Agent disabled: VALK_AGENT_KEY missing",
    ]);
  });

  it("reports only NAMES, never the credential values", () => {
    const missing = missingIntegrationCredentials(
      envWithAllCreds({ BITBUCKET_API_TOKEN: "" }),
    );
    // Set credentials must not leak into the summary at all.
    const joined = missing.join(" ");
    expect(joined).not.toContain("jira-secret");
    expect(joined).not.toContain("agent-secret");
    expect(joined).not.toContain("confluence-secret");
  });
});

describe("logConfigStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits no warn line when every credential is set", () => {
    logConfigStatus(envWithAllCreds());
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("emits a single warn line listing the missing credentials by name", () => {
    logConfigStatus(envWithAllCreds({ JIRA_API_TOKEN: "", CONFLUENCE_API_TOKEN: "" }));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const call = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("config");
    expect(call[1]).toContain("JIRA_API_TOKEN missing");
    expect(call[1]).toContain("CONFLUENCE_API_TOKEN missing");
    // The integrations that ARE configured are not mentioned.
    expect(call[1]).not.toContain("BITBUCKET_API_TOKEN");
    expect(call[1]).not.toContain("VALK_AGENT_KEY");
  });

  it("never logs a credential value", () => {
    logConfigStatus(envWithAllCreds({ JIRA_API_TOKEN: "" }));
    const call = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    const line = String(call[1]);
    expect(line).not.toContain("bitbucket-secret");
    expect(line).not.toContain("confluence-secret");
    expect(line).not.toContain("agent-secret");
  });
});
