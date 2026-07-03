import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTestDoc = vi.fn();
const mockMarkNotNeeded = vi.fn();
vi.mock("@/lib/api-client", () => ({
  tickets: {
    getTestDoc: (...args: unknown[]) => mockGetTestDoc(...args),
    markTestDocNotNeeded: (...args: unknown[]) => mockMarkNotNeeded(...args),
  },
}));

vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => [text],
}));

import { TestDocMarker } from "./TestDocMarker";

describe("TestDocMarker (BRDG-426)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetTestDoc.mockReset();
    mockGetTestDoc.mockResolvedValue({
      saved: { markdown: "**Saved doc**\n\n- Check A", classification: "ok", updatedAt: "2026-07-02T10:00:00.000Z" },
      draft: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("click opens the card immediately and shows the fetched doc", async () => {
    render(<TestDocMarker ticketKey="VPL-1" state="accepted" />);

    fireEvent.click(screen.getByTestId("test-doc-state-accepted"));
    expect(screen.getByTestId("test-doc-hover-card")).toBeInTheDocument();

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mockGetTestDoc).toHaveBeenCalledWith("VPL-1");
    expect(screen.getByTestId("test-doc-hover-card")).toHaveTextContent("Saved doc");
    expect(screen.getByTestId("test-doc-hover-card")).toHaveTextContent("Saved");
  });

  it("hover opens the card after the delay", async () => {
    render(<TestDocMarker ticketKey="VPL-1" state="draft" />);
    mockGetTestDoc.mockResolvedValue({
      saved: null,
      draft: { markdown: "**Draft doc**", classification: "ok", generatedAt: null },
    });

    fireEvent.mouseEnter(screen.getByTestId("test-doc-state-draft"));
    expect(screen.queryByTestId("test-doc-hover-card")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.getByTestId("test-doc-hover-card")).toHaveTextContent("Draft doc");
    expect(screen.getByTestId("test-doc-hover-card")).toHaveTextContent("not yet saved");
  });

  it("not_needed and missing states show explanations without fetching", () => {
    render(<TestDocMarker ticketKey="VPL-1" state="not_needed" />);
    fireEvent.click(screen.getByTestId("test-doc-state-not_needed"));
    expect(screen.getByTestId("test-doc-hover-card")).toHaveTextContent(/not needing test documentation/);

    render(<TestDocMarker ticketKey="VPL-2" state={null} />);
    fireEvent.click(screen.getByTestId("test-doc-state-none"));
    expect(mockGetTestDoc).not.toHaveBeenCalled();
  });

  it("the action button label fits the state and fires onOpenReview", async () => {
    const onOpenReview = vi.fn();
    render(<TestDocMarker ticketKey="VPL-1" state="accepted" onOpenReview={onOpenReview} />);
    fireEvent.click(screen.getByTestId("test-doc-state-accepted"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.click(screen.getByText("Open review"));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
    // Card closes on jump into the review flow.
    expect(screen.queryByTestId("test-doc-hover-card")).not.toBeInTheDocument();
  });

  it("marks a story as not needed straight from the card and closes it", async () => {
    // Real timers here: the assertion waits on a promise chain, not on timers.
    vi.useRealTimers();
    mockMarkNotNeeded.mockResolvedValue({ saved: true, notNeeded: true });
    render(<TestDocMarker ticketKey="VPL-1" state={null} />);
    fireEvent.click(screen.getByTestId("test-doc-state-none"));

    fireEvent.click(screen.getByText("Not needed"));

    expect(mockMarkNotNeeded).toHaveBeenCalledWith("VPL-1");
    await waitFor(() =>
      expect(screen.queryByTestId("test-doc-hover-card")).not.toBeInTheDocument(),
    );
  });

  it("hides the Not needed action on accepted docs", async () => {
    render(<TestDocMarker ticketKey="VPL-1" state="accepted" />);
    fireEvent.click(screen.getByTestId("test-doc-state-accepted"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(screen.queryByText("Not needed")).not.toBeInTheDocument();
  });

  it("missing state offers Generate instead of Open review", () => {
    render(<TestDocMarker ticketKey="VPL-1" state={null} onOpenReview={vi.fn()} />);
    fireEvent.click(screen.getByTestId("test-doc-state-none"));
    expect(screen.getByText("Generate test doc")).toBeInTheDocument();
  });

  it("omits the action button when no handler is supplied (non-board hosts)", () => {
    render(<TestDocMarker ticketKey="VPL-1" state={null} />);
    fireEvent.click(screen.getByTestId("test-doc-state-none"));
    expect(screen.queryByText("Generate test doc")).not.toBeInTheDocument();
  });
});
