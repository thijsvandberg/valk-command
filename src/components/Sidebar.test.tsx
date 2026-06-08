import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SidebarData } from "@/hooks/useSidebarData";
import Sidebar from "./Sidebar";

// next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({ push: mockPush, refresh: vi.fn() })),
}));

// next/link -> plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Clerk
const mockSignOut = vi.fn(() => Promise.resolve());
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
  useUser: () => ({
    user: {
      firstName: "Test",
      lastName: "User",
      fullName: "Test User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
      imageUrl: null,
    },
  }),
}));

// SyncIndicator (avoids ActivityProvider)
vi.mock("@/components/sync/SyncIndicator", () => ({
  SyncIndicator: () => <div data-testid="sync-indicator" />,
}));

// ThemeContext
const mockToggleTheme = vi.fn();
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn(), toggleTheme: mockToggleTheme }),
}));

// api-client (sign-out side effect)
const mockApiFetch = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// useSidebarData (the live counts) — mutable per test
let sidebarData: SidebarData;
vi.mock("@/hooks/useSidebarData", () => ({
  useSidebarData: () => sidebarData,
}));

import { usePathname } from "next/navigation";
const mockUsePathname = vi.mocked(usePathname);

function fullData(): SidebarData {
  return {
    hero: { sprintKey: "BT: 140", todo: 14, inProgress: 3, done: 2, progress: 0.1, dayX: 1, dayY: 10 },
    chat: { count: 4, note: "unread" },
    storyWriter: { count: 2, note: "drafts" },
    refinement: { count: 8, note: "to refine" },
  };
}

function emptyData(): SidebarData {
  return {
    hero: null,
    chat: { count: null, note: "unread" },
    storyWriter: { count: null, note: "drafts" },
    refinement: { count: null, note: "to refine" },
  };
}

// The launcher is drag-enabled (useCornerSnap): a tap is a pointerdown +
// pointerup with no movement, which the hook treats as the click.
function tapLauncher() {
  const btn = screen.getByRole("button", { name: "Open navigation" });
  fireEvent.pointerDown(btn, { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(btn, { clientX: 10, clientY: 10 });
}

function openPanel() {
  tapLauncher();
}

// The panel stays mounted (opacity toggles) and is removed from the a11y tree
// when closed, so target it by test id and assert the aria-hidden attribute.
function getDialog() {
  return screen.getByTestId("sidebar-panel");
}

describe("Sidebar (bento launcher)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sidebarData = fullData();
    mockUsePathname.mockReturnValue("/");
    // stub navigation away on sign out
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn() },
    });
  });

  it("renders only the collapsed launcher with the panel hidden", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument();
    expect(getDialog()).toHaveAttribute("aria-hidden", "true");
  });

  it("opens the panel when the launcher is clicked", () => {
    render(<Sidebar />);
    openPanel();
    expect(getDialog()).toHaveAttribute("aria-hidden", "false");
  });

  it("renders the Sprint Board hero with sprint key and live status summary", () => {
    render(<Sidebar />);
    openPanel();
    const hero = screen.getByRole("link", { name: /Sprint Board/ });
    expect(hero).toBeInTheDocument();
    expect(within(hero).getByText("BT: 140")).toBeInTheDocument();
    expect(within(hero).getByText(/14 to do/)).toBeInTheDocument();
    expect(within(hero).getByText(/3 in progress/)).toBeInTheDocument();
    expect(within(hero).getByText(/2 done/)).toBeInTheDocument();
  });

  it("renders the three common rows with counts and the four rare footer links", () => {
    render(<Sidebar />);
    openPanel();
    for (const label of ["Chat", "Story Writer", "Refinement"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    for (const label of ["Epics", "Pipelines", "Stakeholder", "Cleanup"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  describe("active state (reuses isActive rules)", () => {
    it("marks Sprint Board active when pathname is /", () => {
      mockUsePathname.mockReturnValue("/");
      render(<Sidebar />);
      openPanel();
      expect(screen.getByRole("link", { name: /Sprint Board/ })).toHaveAttribute("aria-current", "page");
    });

    it("marks Chat active on /chat", () => {
      mockUsePathname.mockReturnValue("/chat");
      render(<Sidebar />);
      openPanel();
      expect(screen.getByRole("link", { name: /Chat/ })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: /Sprint Board/ })).not.toHaveAttribute("aria-current");
    });

    it("marks Story Writer active on a */write route", () => {
      mockUsePathname.mockReturnValue("/tickets/VPL-1/write");
      render(<Sidebar />);
      openPanel();
      expect(screen.getByRole("link", { name: /Story Writer/ })).toHaveAttribute("aria-current", "page");
    });

    it("marks Story Writer active on /story-writer/*", () => {
      mockUsePathname.mockReturnValue("/story-writer/abc");
      render(<Sidebar />);
      openPanel();
      expect(screen.getByRole("link", { name: /Story Writer/ })).toHaveAttribute("aria-current", "page");
    });
  });

  describe("account flip", () => {
    function flipToAccount() {
      render(<Sidebar />);
      openPanel();
      fireEvent.click(screen.getByRole("button", { name: /Test User/ }));
    }

    it("shows the five account items including the current theme value", () => {
      flipToAccount();
      const theme = screen.getByRole("menuitem", { name: /theme/i });
      expect(theme).toBeInTheDocument();
      expect(within(theme).getByText("Dark")).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /keyboard shortcuts/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    });

    it("toggles the theme", () => {
      flipToAccount();
      fireEvent.click(screen.getByRole("menuitem", { name: /theme/i }));
      expect(mockToggleTheme).toHaveBeenCalled();
    });

    it("navigates to settings routes via the router", () => {
      flipToAccount();
      fireEvent.click(screen.getByRole("menuitem", { name: /notifications/i }));
      expect(mockPush).toHaveBeenCalledWith("/settings/notifications");
      // Choosing a route closes the panel; reopen and reflip to reach Settings.
      tapLauncher();
      fireEvent.click(screen.getByRole("button", { name: /Test User/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: /^settings$/i }));
      expect(mockPush).toHaveBeenCalledWith("/settings");
    });

    it("dispatches the keyboard-shortcuts event", () => {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");
      flipToAccount();
      fireEvent.click(screen.getByRole("menuitem", { name: /keyboard shortcuts/i }));
      expect(dispatchSpy.mock.calls.some(([e]) => (e as Event).type === "valk:openKeyboardShortcuts")).toBe(true);
    });

    it("signs out via the shared handler", async () => {
      flipToAccount();
      fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
      await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
      expect(mockApiFetch).toHaveBeenCalledWith("/api/dev/bypass", { method: "DELETE" });
      expect(window.location.assign).toHaveBeenCalledWith("/login");
    });
  });

  describe("closing", () => {
    it("closes on Escape", () => {
      render(<Sidebar />);
      openPanel();
      expect(getDialog()).toHaveAttribute("aria-hidden", "false");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(getDialog()).toHaveAttribute("aria-hidden", "true");
    });

    it("closes on outside click", () => {
      render(<Sidebar />);
      openPanel();
      fireEvent.mouseDown(document.body);
      expect(getDialog()).toHaveAttribute("aria-hidden", "true");
    });

    it("closes after selecting a destination", () => {
      render(<Sidebar />);
      openPanel();
      fireEvent.click(screen.getByRole("link", { name: /Chat/ }));
      expect(getDialog()).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("draggable launcher", () => {
    it("treats a drag as a move, not a tap (panel stays closed)", () => {
      render(<Sidebar />);
      const btn = screen.getByRole("button", { name: "Open navigation" });
      fireEvent.pointerDown(btn, { clientX: 10, clientY: 10 });
      // Move well past the drag threshold before releasing.
      fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
      fireEvent.pointerUp(window, { clientX: 200, clientY: 200 });
      expect(getDialog()).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("label-only fallback", () => {
    beforeEach(() => {
      sidebarData = emptyData();
    });

    it("renders common rows without a fake count when data is missing", () => {
      render(<Sidebar />);
      openPanel();
      const chat = screen.getByRole("link", { name: /Chat/ });
      expect(chat).toBeInTheDocument();
      // No numeric count or note text rendered for an unavailable count.
      expect(within(chat).queryByText("unread")).not.toBeInTheDocument();
      expect(chat.textContent?.replace(/\s/g, "")).toBe("Chat");
    });

    it("renders the hero label without a status summary when there is no active sprint", () => {
      render(<Sidebar />);
      openPanel();
      const hero = screen.getByRole("link", { name: /Sprint Board/ });
      expect(within(hero).queryByText(/to do/)).not.toBeInTheDocument();
      expect(within(hero).queryByText("BT: 140")).not.toBeInTheDocument();
    });
  });
});
