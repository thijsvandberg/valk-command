import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { LinkExistingStoryModal } from "./LinkExistingStoryModal";

const searchForLinkWithJira = vi.fn();
vi.mock("@/lib/api-client", () => ({
  tickets: {
    searchForLinkWithJira: (...args: unknown[]) => searchForLinkWithJira(...args),
  },
}));
vi.mock("@/components/shared/Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));
vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: () => <span data-testid="type-icon" />,
}));

describe("LinkExistingStoryModal (BRDG-487)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchForLinkWithJira.mockResolvedValue({
      results: [
        { key: "VPL-100", title: "First story", type: "story", epicKey: null },
        { key: "VPL-101", title: "Second story", type: "story", epicKey: null },
        { key: "VPL-E9", title: "An epic", type: "epic", epicKey: null },
      ],
    });
  });

  it("searches, excludes epics, and links the selected stories", async () => {
    const onLink = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<LinkExistingStoryModal open epicKey="VPL-E1" onClose={onClose} onLink={onLink} />);

    fireEvent.change(screen.getByPlaceholderText(/Search by key or title/i), { target: { value: "story" } });

    // Results appear after the debounced search; the epic is filtered out.
    await waitFor(() => expect(screen.getByText("First story")).toBeTruthy());
    expect(screen.getByText("Second story")).toBeTruthy();
    expect(screen.queryByText("An epic")).toBeNull();

    fireEvent.click(screen.getByText("First story"));
    fireEvent.click(screen.getByText("Second story"));

    fireEvent.click(screen.getByRole("button", { name: /Link 2/ }));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith(["VPL-100", "VPL-101"]));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not search for queries shorter than 2 characters", async () => {
    render(<LinkExistingStoryModal open epicKey="VPL-E1" onClose={() => {}} onLink={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search by key or title/i), { target: { value: "a" } });
    // Give any (unexpected) debounce a chance to fire.
    await new Promise((r) => setTimeout(r, 300));
    expect(searchForLinkWithJira).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <LinkExistingStoryModal open={false} epicKey="VPL-E1" onClose={() => {}} onLink={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
