import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Sidebar from "./Sidebar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock @clerk/nextjs to avoid needing a ClerkProvider
const mockSignOut = vi.fn();
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

// Mock SyncIndicator to avoid needing ActivityProvider
vi.mock("@/components/sync/SyncIndicator", () => ({
  SyncIndicator: () => <div data-testid="sync-indicator" />,
}));

// Mock ThemeContext to avoid needing ThemeProvider
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { usePathname } from "next/navigation";
const mockUsePathname = vi.mocked(usePathname);

describe("Sidebar", () => {
  it("renders the sidebar element", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("renders all 6 navigation items as icon-only links with titles", () => {
    render(<Sidebar />);
    expect(screen.getByTitle("Sprint Board")).toBeInTheDocument();
    expect(screen.getByTitle("Chat")).toBeInTheDocument();
    expect(screen.getByTitle("Story Writer")).toBeInTheDocument();
    expect(screen.getByTitle("Pipelines")).toBeInTheDocument();
    expect(screen.getByTitle("Refinement")).toBeInTheDocument();
    expect(screen.getByTitle("Stakeholder")).toBeInTheDocument();
  });

  it("all navigation links point to correct routes", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const links = nav.querySelectorAll("a");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual([
      "/sprint-board",
      "/epics",
      "/chat",
      "/story-writer",
      "/pipelines",
      "/refinement",
      "/stakeholder",
    ]);
  });

  it("highlights the active route with aria-current", () => {
    mockUsePathname.mockReturnValue("/chat");
    render(<Sidebar />);
    const chatLink = screen.getByTitle("Chat");
    expect(chatLink).toHaveAttribute("aria-current", "page");
    const sprintLink = screen.getByTitle("Sprint Board");
    expect(sprintLink).not.toHaveAttribute("aria-current");
  });

  it("highlights Sprint Board when pathname is /", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Sidebar />);
    const sprintLink = screen.getByTitle("Sprint Board");
    expect(sprintLink).toHaveAttribute("aria-current", "page");
  });

  it("opens and closes on mobile toggle", () => {
    render(<Sidebar />);
    const sidebar = screen.getByTestId("sidebar");

    // Initially closed on mobile (has -translate-x-full)
    expect(sidebar.className).toContain("-translate-x-full");

    // Open sidebar
    const openButton = screen.getByLabelText("Open sidebar");
    fireEvent.click(openButton);
    expect(sidebar.className).not.toContain("-translate-x-full");

    // Close sidebar
    const closeButton = screen.getByLabelText("Close sidebar");
    fireEvent.click(closeButton);
    expect(sidebar.className).toContain("-translate-x-full");
  });

  it("renders the user avatar with initials", () => {
    render(<Sidebar />);
    const avatarButton = screen.getByLabelText("User menu");
    expect(avatarButton).toBeInTheDocument();
    expect(screen.getByText("TU")).toBeInTheDocument();
  });

  it("opens profile popover on avatar click", () => {
    render(<Sidebar />);
    const avatarButton = screen.getByLabelText("User menu");
    fireEvent.click(avatarButton);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("shows Settings and Notifications in profile popover", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByLabelText("User menu"));

    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("closes profile popover on Escape", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByLabelText("User menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
