import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatPage from "./page";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);
});

describe("ChatPage", () => {
  it("renders the conversation list header", async () => {
    render(<ChatPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Conversations").length).toBeGreaterThan(0);
    });
  });

  it("renders the empty state prompt", async () => {
    render(<ChatPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Select a conversation or start a new one.")
      ).toBeInTheDocument();
    });
  });
});
