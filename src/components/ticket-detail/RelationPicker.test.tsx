import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RelationPicker } from "./RelationPicker";
import type { LinkTypeOption } from "@/app/api/jira/link-types/route";

const LINK_TYPES: LinkTypeOption[] = [
  { value: "relates to", label: "Relates to", jiraTypeName: "Relates", direction: "outward" },
  { value: "blocks", label: "Blocks", jiraTypeName: "Blocks", direction: "outward" },
  { value: "is blocked by", label: "Is blocked by", jiraTypeName: "Blocks", direction: "inward" },
];

describe("RelationPicker", () => {
  it("renders every link type option", () => {
    render(<RelationPicker value="relates to" linkTypes={LINK_TYPES} onSelect={vi.fn()} autoFocus={false} />);
    expect(screen.getByText("Relates to")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Is blocked by")).toBeInTheDocument();
  });

  it("filters options by the typed text", () => {
    render(<RelationPicker value="relates to" linkTypes={LINK_TYPES} onSelect={vi.fn()} autoFocus={false} />);
    fireEvent.change(screen.getByPlaceholderText("Filter..."), { target: { value: "block" } });
    expect(screen.queryByText("Relates to")).toBeNull();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Is blocked by")).toBeInTheDocument();
  });

  it("selects an option on mousedown", () => {
    const onSelect = vi.fn();
    render(<RelationPicker value="relates to" linkTypes={LINK_TYPES} onSelect={onSelect} autoFocus={false} />);
    fireEvent.mouseDown(screen.getByText("Is blocked by"));
    expect(onSelect).toHaveBeenCalledWith("is blocked by");
  });

  it("selects the highlighted option with the keyboard", () => {
    const onSelect = vi.fn();
    render(<RelationPicker value="relates to" linkTypes={LINK_TYPES} onSelect={onSelect} autoFocus={false} />);
    const input = screen.getByPlaceholderText("Filter...");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight index 0 -> "Relates to"
    fireEvent.keyDown(input, { key: "ArrowDown" }); // index 1 -> "Blocks"
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("blocks");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<RelationPicker value="relates to" linkTypes={LINK_TYPES} onSelect={vi.fn()} onClose={onClose} autoFocus={false} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Filter..."), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
