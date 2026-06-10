import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SidebarData } from "@/hooks/useSidebarData";
import { NavPanel } from "./NavPanel";

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

// TicketRefPill pulls SWR + the full api-client; a key-only stand-in keeps the
// suite's api-client mock minimal.
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="ticket-pill">{ticketKey}</span>
  ),
}));

import { recordTicketView } from "@/lib/recently-viewed-store";

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

// NavPanel is visibility-controlled by the parent; render it open with a spy.
function renderOpen(onClose = vi.fn()) {
  render(<NavPanel open onClose={onClose} />);
  return onClose;
}

function flipToAccount(onClose = vi.fn()) {
  renderOpen(onClose);
  fireEvent.click(screen.getByRole("button", { name: /Test User/ }));
  return onClose;
}

describe("NavPanel (header navigation dropdown)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sidebarData = fullData();
    mockUsePathname.mockReturnValue("/");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn() },
    });
  });

  it("renders the Sprint Board hero with sprint key and live status summary", () => {
    renderOpen();
    const hero = screen.getByRole("link", { name: /Sprint Board/ });
    expect(hero).toBeInTheDocument();
    expect(within(hero).getByText("BT: 140")).toBeInTheDocument();
    expect(within(hero).getByText(/14 to do/)).toBeInTheDocument();
    expect(within(hero).getByText(/3 in progress/)).toBeInTheDocument();
    expect(within(hero).getByText(/2 done/)).toBeInTheDocument();
  });

  it("renders the three common rows with counts and the four rare footer links", () => {
    renderOpen();
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
      renderOpen();
      expect(screen.getByRole("link", { name: /Sprint Board/ })).toHaveAttribute("aria-current", "page");
    });

    it("marks Chat active on /chat", () => {
      mockUsePathname.mockReturnValue("/chat");
      renderOpen();
      expect(screen.getByRole("link", { name: /Chat/ })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: /Sprint Board/ })).not.toHaveAttribute("aria-current");
    });

    it("marks Story Writer active on a */write route", () => {
      mockUsePathname.mockReturnValue("/tickets/VPL-1/write");
      renderOpen();
      expect(screen.getByRole("link", { name: /Story Writer/ })).toHaveAttribute("aria-current", "page");
    });

    it("marks Story Writer active on /story-writer/*", () => {
      mockUsePathname.mockReturnValue("/story-writer/abc");
      renderOpen();
      expect(screen.getByRole("link", { name: /Story Writer/ })).toHaveAttribute("aria-current", "page");
    });
  });

  describe("account flip", () => {
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

    it("navigates to settings routes via the router and closes the panel", () => {
      const onClose = flipToAccount();
      fireEvent.click(screen.getByRole("menuitem", { name: /notifications/i }));
      expect(mockPush).toHaveBeenCalledWith("/settings/notifications");
      expect(onClose).toHaveBeenCalled();
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

  describe("onClose on navigate", () => {
    it("fires onClose when a destination link is chosen", () => {
      const onClose = renderOpen();
      fireEvent.click(screen.getByRole("link", { name: /Chat/ }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("label-only fallback", () => {
    beforeEach(() => {
      sidebarData = emptyData();
    });

    it("renders common rows without a fake count when data is missing", () => {
      renderOpen();
      const chat = screen.getByRole("link", { name: /Chat/ });
      expect(chat).toBeInTheDocument();
      expect(within(chat).queryByText("unread")).not.toBeInTheDocument();
      expect(chat.textContent?.replace(/\s/g, "")).toBe("Chat");
    });

    it("renders the hero label without a status summary when there is no active sprint", () => {
      renderOpen();
      const hero = screen.getByRole("link", { name: /Sprint Board/ });
      expect(within(hero).queryByText(/to do/)).not.toBeInTheDocument();
      expect(within(hero).queryByText("BT: 140")).not.toBeInTheDocument();
    });
  });

  describe("recently viewed flip", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    function flipToRecent(onClose = vi.fn()) {
      renderOpen(onClose);
      fireEvent.click(screen.getByRole("button", { name: /Recently viewed/ }));
      return onClose;
    }

    it("shows the Recently viewed affordance in the navigation view", () => {
      renderOpen();
      expect(screen.getByRole("button", { name: /Recently viewed/ })).toBeInTheDocument();
    });

    it("flips to the list without navigating away from the page", () => {
      recordTicketView("VPL-1", "Ticket one");
      flipToRecent();
      expect(screen.getByTestId("recently-viewed-view")).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("renders entries with pill + title, most-recent-first", () => {
      recordTicketView("VPL-1", "Ticket one");
      recordTicketView("VPL-2", "Ticket two");
      flipToRecent();

      const pills = screen.getAllByTestId("ticket-pill");
      expect(pills.map((p) => p.textContent)).toEqual(["VPL-2", "VPL-1"]);
      expect(screen.getByText("Ticket two")).toBeInTheDocument();
      expect(screen.getByText("Ticket one")).toBeInTheDocument();
    });

    it("navigates to the ticket and closes the panel when an entry is clicked", () => {
      recordTicketView("VPL-7", "Clickable ticket");
      const onClose = flipToRecent();

      fireEvent.click(screen.getByRole("button", { name: /Clickable ticket/ }));
      expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-7");
      expect(onClose).toHaveBeenCalled();
    });

    it("supports keyboard activation of an entry", () => {
      recordTicketView("VPL-8", "Keyboard ticket");
      const onClose = flipToRecent();

      fireEvent.keyDown(screen.getByRole("button", { name: /Keyboard ticket/ }), { key: "Enter" });
      expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-8");
      expect(onClose).toHaveBeenCalled();
    });

    it("renders the empty state when nothing has been viewed", () => {
      flipToRecent();
      expect(screen.getByText("No recently viewed tickets yet")).toBeInTheDocument();
    });

    it("flips back to the navigation view via the back affordance", () => {
      recordTicketView("VPL-1", "Ticket one");
      flipToRecent();
      fireEvent.click(screen.getByRole("button", { name: /Recently viewed/ }));
      expect(screen.queryByTestId("recently-viewed-view")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Sprint Board/ })).toBeInTheDocument();
    });

    it("falls back to a pill-only row when an entry has no title", () => {
      recordTicketView("VPL-9");
      flipToRecent();
      expect(screen.getAllByTestId("ticket-pill").map((p) => p.textContent)).toEqual(["VPL-9"]);
    });
  });
});
