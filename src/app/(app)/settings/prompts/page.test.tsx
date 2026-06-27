import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-client", () => ({
  settings: { getQuickPrompts: vi.fn(), saveQuickPrompts: vi.fn() },
}));

import { settings } from "@/lib/api-client";
import PromptsPage from "./page";

const getMock = settings.getQuickPrompts as unknown as ReturnType<typeof vi.fn>;

describe("PromptsPage data states (BRDG-423)", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("shows the shared loading state while fetching", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    render(<PromptsPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows the shared empty state for an issue type with no prompts", async () => {
    getMock.mockResolvedValue({ prompts: {} });
    render(<PromptsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("No quick prompts configured for this issue type"),
      ).toBeInTheDocument();
    });
  });

  it("surfaces a fetch failure with a retry affordance", async () => {
    getMock.mockRejectedValue(new Error("Prompts failed to load"));
    render(<PromptsPage />);
    await waitFor(() => {
      expect(screen.getByText("Prompts failed to load")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
