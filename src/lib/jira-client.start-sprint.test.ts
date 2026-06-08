// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Configured-mode env so isConfigured() passes and the API gateway base URL is used.
vi.mock("./env", () => ({
  env: {
    JIRA_CLOUD_ID: "cloud-123",
    JIRA_BASE_URL: "https://new-story.atlassian.net",
    JIRA_EMAIL: "po@example.com",
    JIRA_API_TOKEN: "token-abc",
    JIRA_PROJECT_KEY: "VPL",
    JIRA_BOARD_ID: "233",
  },
}));

import { JiraClient } from "./jira-client";

describe("JiraClient.startSprint", () => {
  const client = new JiraClient();
  let fetchMock: ReturnType<typeof vi.fn>;

  const currentSprint = {
    id: 123,
    name: "VPL Sprint 42",
    state: "future",
    startDate: "2026-06-05T00:00:00.000Z",
    endDate: undefined,
    goal: "Ship the thing",
    originBoardId: 233,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const gatewayUrl =
    "https://api.atlassian.com/ex/jira/cloud-123/rest/agile/1.0/sprint/123";

  it("GETs the sprint then PUTs state=active with the preferred (existing) start date", async () => {
    fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        return Promise.resolve({ ok: true, status: 204, text: async () => "" });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => currentSprint, text: async () => JSON.stringify(currentSprint) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.startSprint(123, {
      startDate: "2026-06-05T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe(gatewayUrl);
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(putInit.body)).toEqual({
      name: "VPL Sprint 42",
      state: "active",
      startDate: "2026-06-05T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
      goal: "Ship the thing",
    });
    expect(result).toEqual({
      startDate: "2026-06-05T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });
  });

  it("falls back to 'now' when Jira rejects the start date as invalid", async () => {
    let putCalls = 0;
    fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        putCalls += 1;
        if (putCalls === 1) {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            headers: { get: () => null },
            text: async () => JSON.stringify({ errors: { startDate: "Start date must not be in the past" } }),
          });
        }
        return Promise.resolve({ ok: true, status: 204, text: async () => "" });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => currentSprint, text: async () => JSON.stringify(currentSprint) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.startSprint(123, {
      startDate: "2020-01-01T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });

    // GET + failed PUT + retried PUT
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retriedBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(retriedBody.startDate).not.toBe("2020-01-01T00:00:00.000Z");
    expect(retriedBody.startDate).toBeTruthy();
    expect(retriedBody.state).toBe("active");
    expect(result.startDate).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("rethrows a non-start-date Jira error without retrying", async () => {
    let putCalls = 0;
    fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        putCalls += 1;
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          headers: { get: () => null },
          text: async () => JSON.stringify({ errors: { sprint: "Sprint is already active" } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => currentSprint, text: async () => JSON.stringify(currentSprint) });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      client.startSprint(123, { startDate: "2026-06-05T00:00:00.000Z", endDate: "2026-06-18T17:00:00.000Z" }),
    ).rejects.toThrow();
    expect(putCalls).toBe(1);
  });

  it("uses 'now' as the start when no start date is provided", async () => {
    fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        return Promise.resolve({ ok: true, status: 204, text: async () => "" });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => currentSprint, text: async () => JSON.stringify(currentSprint) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.startSprint(123, { startDate: null, endDate: "2026-06-18T17:00:00.000Z" });

    const putBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(putBody.startDate).toBeTruthy();
    expect(result.startDate).toBeTruthy();
  });
});
