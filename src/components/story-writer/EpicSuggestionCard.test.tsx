import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EpicSuggestionCard, type EpicSuggestion } from "./EpicSuggestionCard";

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
    expect(screen.getByText("VPL-10")).toBeInTheDocument();
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.getByText("Covers group booking")).toBeInTheDocument();
    expect(screen.getByText("VPL-20")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("shows 'Applied' for the epic already set on the ticket", () => {
    render(
      <EpicSuggestionCard
        suggestions={SUGGESTIONS}
        currentEpicKey="VPL-10"
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText("Applied")).toBeInTheDocument();
    // VPL-20 should still have a Link button
    expect(screen.getAllByRole("button", { name: /link/i })).toHaveLength(1);
  });

  it("calls onApply and shows 'Applied' on success", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("Applied")).toBeInTheDocument();
    });
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

  it("renders confidence indicators for each level", () => {
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
    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
  });
});
