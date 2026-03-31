import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ChangelogPage from "./page";

vi.mock("@/data/changelog.json", () => ({
  default: [
    {
      date: "2026-03-28",
      entries: [
        {
          hash: "abc123full",
          shortHash: "abc123f",
          date: "2026-03-28",
          category: "New",
          description: "Added automated changelog",
          longDescription: "Changelog page that auto-updates on every merge",
          author: "dev",
          commitUrl: "https://github.com/thijsvandberg/valk-command/commit/abc123full",
        },
        {
          hash: "def456full",
          shortHash: "def456f",
          date: "2026-03-28",
          category: "Fixed",
          description: "Resolved navigation issue",
          author: "dev",
          commitUrl: "https://github.com/thijsvandberg/valk-command/commit/def456full",
        },
      ],
    },
    {
      date: "2026-03-27",
      entries: [
        {
          hash: "ghi789full",
          shortHash: "ghi789f",
          date: "2026-03-27",
          category: "Maintenance",
          description: "Initial project setup",
          author: "dev",
          commitUrl: "https://github.com/thijsvandberg/valk-command/commit/ghi789full",
        },
      ],
    },
  ],
}));

describe("Changelog page", () => {
  it("renders the heading", () => {
    render(<ChangelogPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Changelog",
    );
  });

  it("renders date group headings", () => {
    render(<ChangelogPage />);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent("2026");
    expect(headings[1]).toHaveTextContent("2026");
  });

  it("renders all changelog entries", () => {
    render(<ChangelogPage />);
    expect(screen.getByText("Added automated changelog")).toBeInTheDocument();
    expect(screen.getByText("Resolved navigation issue")).toBeInTheDocument();
    expect(screen.getByText("Initial project setup")).toBeInTheDocument();
  });

  it("renders category badges", () => {
    render(<ChangelogPage />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
  });

  it("renders commit hash links pointing to GitHub", () => {
    render(<ChangelogPage />);
    const link = screen.getByText("abc123f");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/thijsvandberg/valk-command/commit/abc123full",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders long descriptions when present", () => {
    render(<ChangelogPage />);
    expect(
      screen.getByText("Changelog page that auto-updates on every merge"),
    ).toBeInTheDocument();
  });

  it("does not render long description when absent", () => {
    render(<ChangelogPage />);
    const article = screen.getByText("Resolved navigation issue").closest("article");
    expect(article).not.toBeNull();
    const paragraphs = article!.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
  });

  it("renders back to home link", () => {
    render(<ChangelogPage />);
    expect(screen.getByText("Back to home")).toHaveAttribute("href", "/");
  });
});
