import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RefinementHistoryList } from "./RefinementHistoryList";
import type { RefinementSessionResponse } from "@/lib/api-client";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockSessions: RefinementSessionResponse[] = [
  {
    id: "s1",
    name: "Sprint 42 Refinement",
    ticketKeys: ["VPL-1", "VPL-2", "VPL-3"],
    ticketCount: 3,
    status: "completed",
    generalComment: "Good session, all tickets estimated.",
    currentIndex: 0,
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T12:00:00Z",
  },
  {
    id: "s2",
    name: "Sprint 43 Refinement",
    ticketKeys: ["VPL-4"],
    ticketCount: 1,
    status: "completed",
    generalComment: null,
    currentIndex: 0,
    createdAt: "2026-05-21T10:00:00Z",
    updatedAt: "2026-05-21T11:00:00Z",
  },
];

describe("RefinementHistoryList", () => {
  it("shows empty state when no sessions", () => {
    render(<RefinementHistoryList sessions={[]} />);
    expect(screen.getByText("No refinements yet.")).toBeInTheDocument();
  });

  it("renders session names", () => {
    render(<RefinementHistoryList sessions={mockSessions} />);
    expect(screen.getByText("Sprint 42 Refinement")).toBeInTheDocument();
    expect(screen.getByText("Sprint 43 Refinement")).toBeInTheDocument();
  });

  it("renders ticket counts", () => {
    render(<RefinementHistoryList sessions={mockSessions} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders general comment when present", () => {
    render(<RefinementHistoryList sessions={mockSessions} />);
    expect(screen.getByText("Good session, all tickets estimated.")).toBeInTheDocument();
  });

  it("does not render comment section when generalComment is null", () => {
    render(<RefinementHistoryList sessions={[mockSessions[1]]} />);
    expect(screen.queryByText("Good session")).not.toBeInTheDocument();
  });

  it("links each session to its detail page", () => {
    render(<RefinementHistoryList sessions={mockSessions} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/refinement/s1");
    expect(links[1]).toHaveAttribute("href", "/refinement/s2");
  });
});
