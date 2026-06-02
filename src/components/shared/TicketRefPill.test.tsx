import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the API client so we control the lazy hover-data fetch. detailUrl stays
// real; only the fetcher is stubbed.
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, swrFetcher: vi.fn() };
});

import { swrFetcher } from "@/lib/api-client";
import { TicketRefPill } from "./TicketRefPill";

const mockFetcher = vi.mocked(swrFetcher);

describe("TicketRefPill", () => {
  beforeEach(() => {
    mockFetcher.mockReset();
  });

  it("renders a link to the internal ticket view immediately, before any fetch", () => {
    render(<TicketRefPill ticketKey="VPL-99" />);
    const link = screen.getByText("VPL-99").closest("a");
    expect(link?.getAttribute("href")).toBe("/tickets/VPL-99");
    // Non-blocking: nothing is fetched until the user hovers.
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it("lazily fetches hover data from the per-key endpoint on first hover", async () => {
    mockFetcher.mockResolvedValue({ title: "A ticket", jiraStatus: "TO DO", type: "story" });
    const { container } = render(<TicketRefPill ticketKey="VPL-99" />);

    fireEvent.mouseEnter(container.firstChild as HTMLElement);

    await waitFor(() =>
      expect(mockFetcher).toHaveBeenCalledWith("/api/tickets/VPL-99"),
    );
  });

  it("still renders a working link when the lookup fails (graceful fallback)", async () => {
    mockFetcher.mockRejectedValue(new Error("404"));
    const { container } = render(<TicketRefPill ticketKey="VPL-404" />);

    fireEvent.mouseEnter(container.firstChild as HTMLElement);

    await waitFor(() => expect(mockFetcher).toHaveBeenCalled());
    const link = screen.getByText("VPL-404").closest("a");
    expect(link?.getAttribute("href")).toBe("/tickets/VPL-404");
  });
});
