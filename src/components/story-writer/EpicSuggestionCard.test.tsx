import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicSuggestionCard, type EpicSuggestion } from "./EpicSuggestionCard";
import { tickets } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  tickets: { get: vi.fn() },
}));

const mockGet = tickets.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockRejectedValue(new Error("not found"));
  window.localStorage.clear();
});

const SUGGESTIONS: EpicSuggestion[] = [
  { key: "VPL-10", name: "Group Reservations", confidence: "high", reason: "Covers group booking" },
  { key: "VPL-20", name: "Online Booking", confidence: "medium", reason: "Could relate to online booking" },
];

describe("EpicSuggestionCard", () => {
  it("renders header and suggestion rows", () => {
    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText("Epic suggestion")).toBeInTheDocument();
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Covers group booking")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("shows 'Applied' in the header and auto-collapses when an epic is already set", () => {
    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey="VPL-10"
        onApply={vi.fn()}
      />,
    );
    // Header badge is visible, but rows are collapsed on reopen.
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.queryByText("Group Reservations")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /link/i })).toBeNull();
  });

  it("expands the collapsed applied card when the header is clicked", () => {
    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey="VPL-10"
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /epic suggestion/i }));
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
    // Applied now shows in both the header badge and the matching row.
    expect(screen.getAllByText("Applied")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /link/i })).toHaveLength(1);
  });

  it("calls onApply, shows 'Applied', and keeps the card open", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <EpicSuggestionCard
        suggestions={[SUGGESTIONS[0]]}
        currentEpicKey={null}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /link/i }));
    expect(onApply).toHaveBeenCalledWith("VPL-10");

    // Applying in-session must not collapse the card: header badge + row badge.
    await waitFor(() => {
      expect(screen.getAllByText("Applied")).toHaveLength(2);
    });
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
  });

  it("persists a manual collapse across remounts via messageId", () => {
    const { unmount } = render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey={null}
        onApply={vi.fn()}
        messageId="msg-1"
      />,
    );
    // Expanded by default (nothing applied); collapse it manually.
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /epic suggestion/i }));
    expect(screen.queryByText("Group Reservations")).not.toBeInTheDocument();

    unmount();
    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey={null}
        onApply={vi.fn()}
        messageId="msg-1"
      />,
    );
    // Collapse persisted: still collapsed after remount.
    expect(screen.queryByText("Group Reservations")).not.toBeInTheDocument();
  });

  it("keeps a manually expanded applied card open across remounts", () => {
    const { unmount } = render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey="VPL-10"
        onApply={vi.fn()}
        messageId="msg-2"
      />,
    );
    // Auto-collapsed on reopen, then user expands it.
    expect(screen.queryByText("Group Reservations")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /epic suggestion/i }));
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();

    unmount();
    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey="VPL-10"
        onApply={vi.fn()}
        messageId="msg-2"
      />,
    );
    // Manual expand wins over the applied default.
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
  });

  it("shows Retry on apply failure", async () => {
    const onApply = vi.fn().mockRejectedValue(new Error("API error"));
    render(
      <EpicSuggestionCard
        suggestions={[SUGGESTIONS[0]]}
        currentEpicKey={null}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /link/i }));

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("drops an epic whose status resolves to DEPRECATED", async () => {
    mockGet.mockImplementation((key: string) =>
      Promise.resolve((key === "VPL-20"
        ? { jiraStatus: "DEPRECATED", readiness: null, title: "Online Booking" }
        : { jiraStatus: "TO DO", readiness: null, title: "Group Reservations" }) as never),
    );

    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey={null}
        onApply={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Online Booking")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
  });

  it("renders nothing when suggestions array is empty", () => {
    const { container } = render(
      <EpicSuggestionCard
        suggestions={[]}
        currentEpicKey={null}
        onApply={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders confidence badges with correct labels", () => {
    render(
      <EpicSuggestionCard
        suggestions={[
          ...SUGGESTIONS,
          { key: "VPL-30", name: "Low Priority", confidence: "low", reason: "Weak match" },
        ]}
        currentEpicKey={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });
});
