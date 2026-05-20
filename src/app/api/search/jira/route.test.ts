import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    searchIssues: vi.fn(),
  },
  extractSprint: vi.fn(),
}));

const { jiraClient, extractSprint } = await import("@/lib/jira-client");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/search/jira");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makeJiraIssue(key: string, summary: string, status: string, sprintName: string | null) {
  return {
    id: key,
    key,
    fields: {
      summary,
      issuetype: { name: "Story" },
      status: { name: status },
      priority: { name: "Medium" },
      assignee: { accountId: "u1", displayName: "Dev User" },
      reporter: null,
      labels: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    // Sprint info stored in custom field — extracted via extractSprint
    _sprintName: sprintName,
  };
}

describe("GET /api/search/jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (extractSprint as Mock).mockImplementation((fields: unknown) => {
      // Return null by default
      void fields;
      return null;
    });
  });

  it("returns empty results when no query provided", async () => {
    const res = await GET(makeRequest({}));
    const body = await res.json();
    expect(body.issues).toEqual([]);
    expect(jiraClient.searchIssues).not.toHaveBeenCalled();
  });

  it("calls searchIssues with auto-generated JQL for plain query", async () => {
    const issue = makeJiraIssue("VPL-1", "Auth flow", "IN PROGRESS", null);
    (jiraClient.searchIssues as Mock).mockResolvedValueOnce([issue]);

    const res = await GET(makeRequest({ q: "auth" }));
    const body = await res.json();

    expect(jiraClient.searchIssues).toHaveBeenCalledOnce();
    const [jql] = (jiraClient.searchIssues as Mock).mock.calls[0];
    expect(jql).toContain('text ~ "auth"');
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].key).toBe("VPL-1");
  });

  it("uses JQL override when provided", async () => {
    (jiraClient.searchIssues as Mock).mockResolvedValueOnce([]);

    const jqlOverride = "project = VPL AND status = Done";
    const res = await GET(makeRequest({ q: "something", jql: jqlOverride }));

    expect(jiraClient.searchIssues).toHaveBeenCalledOnce();
    const [jql] = (jiraClient.searchIssues as Mock).mock.calls[0];
    expect(jql).toBe(jqlOverride);
    expect(res.status).toBe(200);
  });

  it("uses only JQL override when q is empty", async () => {
    (jiraClient.searchIssues as Mock).mockResolvedValueOnce([]);

    const jqlOverride = "assignee = currentUser()";
    const res = await GET(makeRequest({ jql: jqlOverride }));

    expect(jiraClient.searchIssues).toHaveBeenCalledOnce();
    const [jql] = (jiraClient.searchIssues as Mock).mock.calls[0];
    expect(jql).toBe(jqlOverride);
    expect(res.status).toBe(200);
  });

  it("maps Jira issue fields to JiraSearchResult shape", async () => {
    const issue = makeJiraIssue("VPL-7", "Payment redesign", "DONE", "Sprint 4");
    (jiraClient.searchIssues as Mock).mockResolvedValueOnce([issue]);
    (extractSprint as Mock).mockReturnValueOnce({ name: "Sprint 4" });

    const res = await GET(makeRequest({ q: "payment" }));
    const body = await res.json();

    expect(body.issues[0]).toMatchObject({
      key: "VPL-7",
      summary: "Payment redesign",
      status: "DONE",
      sprintName: "Sprint 4",
    });
    expect(body.issues[0].url).toContain("VPL-7");
  });

  it("returns 500 with error message on Jira failure", async () => {
    (jiraClient.searchIssues as Mock).mockRejectedValueOnce(new Error("Jira unreachable"));

    const res = await GET(makeRequest({ q: "query" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Search failed");
  });

  it("includes issuetype filter in JQL when provided", async () => {
    (jiraClient.searchIssues as Mock).mockResolvedValueOnce([]);

    await GET(makeRequest({ issuetype: "Epic" }));

    expect(jiraClient.searchIssues).toHaveBeenCalledOnce();
    const [jql] = (jiraClient.searchIssues as Mock).mock.calls[0];
    expect(jql).toContain('issuetype = "Epic"');
    expect(jql).not.toContain("text ~");
  });

  it("combines issuetype and text query in JQL", async () => {
    (jiraClient.searchIssues as Mock).mockResolvedValueOnce([]);

    await GET(makeRequest({ issuetype: "Epic", q: "platform" }));

    expect(jiraClient.searchIssues).toHaveBeenCalledOnce();
    const [jql] = (jiraClient.searchIssues as Mock).mock.calls[0];
    expect(jql).toContain('issuetype = "Epic"');
    expect(jql).toContain('text ~ "platform"');
  });
});
