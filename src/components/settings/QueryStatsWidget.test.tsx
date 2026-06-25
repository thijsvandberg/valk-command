// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";
import { QueryStatsWidget } from "./QueryStatsWidget";

function renderWidget() {
  // Fresh provider per render so SWR's cache never bleeds between cases.
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <QueryStatsWidget />
    </SWRConfig>,
  );
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QueryStatsWidget", () => {
  it("renders the slowest queries, sorted by max duration", async () => {
    mockFetchOnce({
      thresholdMs: 100,
      queries: [
        { label: "SELECT 1 FROM a WHERE id = ?", count: 3, avgMs: 20, maxMs: 40, slowCount: 0, lastAt: new Date().toISOString() },
        { label: "SELECT * FROM big WHERE x = ?", count: 1, avgMs: 250, maxMs: 250, slowCount: 1, lastAt: new Date().toISOString() },
      ],
    });

    renderWidget();

    await waitFor(() =>
      expect(screen.getByText("SELECT * FROM big WHERE x = ?")).toBeInTheDocument(),
    );
    expect(screen.getByText("SELECT 1 FROM a WHERE id = ?")).toBeInTheDocument();
    expect(screen.getByText("250ms max")).toBeInTheDocument();
    expect(screen.getByText("1 slow")).toBeInTheDocument();

    // Slowest first: the 250ms query must precede the 40ms one in the DOM.
    const codes = screen.getAllByText(/SELECT/);
    expect(codes[0].textContent).toBe("SELECT * FROM big WHERE x = ?");
  });

  it("shows the threshold from the response", async () => {
    mockFetchOnce({ thresholdMs: 100, queries: [] });
    renderWidget();
    await waitFor(() => expect(screen.getByText("threshold 100ms")).toBeInTheDocument());
  });

  it("shows an empty state when no queries are recorded", async () => {
    mockFetchOnce({ thresholdMs: 100, queries: [] });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText("No queries recorded yet.")).toBeInTheDocument(),
    );
  });

  it("shows a dev-only note when the endpoint is unavailable (404)", async () => {
    mockFetchOnce({ error: "Not found" }, false, 404);
    renderWidget();
    await waitFor(() =>
      expect(
        screen.getByText("Query stats are only available in development."),
      ).toBeInTheDocument(),
    );
  });

  it("exposes a refresh control with an accessible label", async () => {
    mockFetchOnce({ thresholdMs: 100, queries: [] });
    renderWidget();
    await waitFor(() => expect(screen.getByText("No queries recorded yet.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Refresh query stats" })).toBeInTheDocument();
  });
});
