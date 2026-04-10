import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Sidebar from "./Sidebar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock SyncIndicator to avoid needing ActivityProvider
vi.mock("@/components/sync/SyncIndicator", () => ({
  SyncIndicator: () => <div data-testid="sync-indicator" />,
}));

import { usePathname } from "next/navigation";
const mockUsePathname = vi.mocked(usePathname);

describe("Sidebar", () => {
  it("renders the sidebar element", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("renders all 8 navigation items", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Sprint Board")).toBeInTheDocument();
    expect(screen.getByText("Test Center")).toBeInTheDocument();
    expect(screen.getByText("Refinement")).toBeInTheDocument();
    expect(screen.getByText("Stakeholder")).toBeInTheDocument();
    expect(screen.getByText("Story Writer")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("all navigation links point to correct routes", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const links = nav.querySelectorAll("a");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual([
      "/",
      "/chat",
      "/sprint-board",
      "/test-center",
      "/refinement",
      "/stakeholder",
      "/settings/story-writer",
      "/settings",
    ]);
  });

  it("highlights the active route with aria-current", () => {
    mockUsePathname.mockReturnValue("/chat");
    render(<Sidebar />);
    const chatLink = screen.getByText("Chat").closest("a");
    expect(chatLink).toHaveAttribute("aria-current", "page");
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).not.toHaveAttribute("aria-current");
  });

  it("highlights Dashboard when pathname is /", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Sidebar />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
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
});
