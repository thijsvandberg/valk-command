import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VersionPicker } from "./VersionPicker";
import type { VersionOption } from "./VersionPicker";

vi.mock("lucide-react", () => ({
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="chevron-icon" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="check-icon" {...props} />,
}));

vi.mock("./Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span data-testid="tag">{children}</span>,
}));

const OPTIONS: VersionOption[] = [
  { id: "v1", label: "Version 1", versionNum: 1, tag: "current", isoDate: "2026-03-28T10:00:00" },
  { id: "v2", label: "Version 2", versionNum: 2, tag: "jira", author: "Alice", isoDate: "2026-03-27T09:00:00" },
  { id: "d1", label: "AI Draft 1", tag: "ai-draft", group: "Drafts" },
  { id: "d2", label: "Local Draft", tag: "draft", group: "Drafts" },
];

describe("VersionPicker", () => {
  it("renders trigger with selected version label", () => {
    render(<VersionPicker options={OPTIONS} selectedId="v1" onSelect={vi.fn()} />);
    expect(screen.getByText("Version 1")).toBeInTheDocument();
  });

  it("shows 'Select version' when selectedId does not match", () => {
    render(<VersionPicker options={OPTIONS} selectedId="unknown" onSelect={vi.fn()} />);
    expect(screen.getByText("Select version")).toBeInTheDocument();
  });

  it("opens popover and shows all options", () => {
    render(<VersionPicker options={OPTIONS} selectedId="v1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Version 1")[0]);
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("AI Draft 1")).toBeInTheDocument();
    expect(screen.getByText("Local Draft")).toBeInTheDocument();
  });

  it("shows group header for grouped options", () => {
    render(<VersionPicker options={OPTIONS} selectedId="v1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Version 1")[0]);
    expect(screen.getByText("Drafts")).toBeInTheDocument();
  });

  it("calls onSelect with option id when clicked", () => {
    const onSelect = vi.fn();
    render(<VersionPicker options={OPTIONS} selectedId="v1" onSelect={onSelect} />);
    fireEvent.click(screen.getAllByText("Version 1")[0]);
    fireEvent.click(screen.getByText("Version 2"));
    expect(onSelect).toHaveBeenCalledWith("v2");
  });

  it("shows author name for options with author", () => {
    render(<VersionPicker options={OPTIONS} selectedId="v1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Version 1")[0]);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders tag badges for tagged options", () => {
    render(<VersionPicker options={OPTIONS} selectedId="v1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Version 1")[0]);
    const tags = screen.getAllByTestId("tag");
    expect(tags.length).toBeGreaterThan(0);
  });
});
