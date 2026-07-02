import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

vi.mock("@/hooks/useWorkspaceHealth", () => ({
  useWorkspaceHealth: vi.fn(),
}));

import { useWorkspaceHealth } from "@/hooks/useWorkspaceHealth";

function mockHealth(workspace: "connected" | "unreachable" | "checking") {
  (useWorkspaceHealth as ReturnType<typeof vi.fn>).mockReturnValue({
    workspace,
    claude: "unknown",
    tokenExpiresAt: null,
  });
}

describe("WorkspaceStatusBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while the workspace is connected", () => {
    mockHealth("connected");
    const { container } = render(<WorkspaceStatusBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the health check is still running", () => {
    mockHealth("checking");
    const { container } = render(<WorkspaceStatusBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a red dot and short label when the workspace is unreachable", () => {
    mockHealth("unreachable");
    render(<WorkspaceStatusBadge />);
    expect(screen.getByText("Workspace offline")).toBeInTheDocument();
  });

  describe("hover tooltip", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reveals the friendly detail on hover", () => {
      mockHealth("unreachable");
      render(<WorkspaceStatusBadge />);

      // The Tooltip trigger is the wrapper span around the badge.
      fireEvent.mouseEnter(screen.getByText("Workspace offline").parentElement!);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText("Cannot reach the workspace. Is it running?")).toBeInTheDocument();
    });
  });
});
