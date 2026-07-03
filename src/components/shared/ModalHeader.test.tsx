import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClipboardCheck } from "lucide-react";
import { ModalHeader } from "./ModalHeader";

describe("ModalHeader", () => {
  it("renders the title, subtitle and trailing content", () => {
    render(
      <ModalHeader
        icon={<ClipboardCheck data-testid="hdr-icon" />}
        title="Test documentation"
        subtitle={<p>BT: 143</p>}
        trailing={<span data-testid="hdr-trailing">1 / 3</span>}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Test documentation")).toBeInTheDocument();
    expect(screen.getByText("BT: 143")).toBeInTheDocument();
    expect(screen.getByTestId("hdr-icon")).toBeInTheDocument();
    expect(screen.getByTestId("hdr-trailing")).toBeInTheDocument();
  });

  it("fires onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <ModalHeader
        icon={<ClipboardCheck />}
        title="Add subtasks"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("honours a custom close label", () => {
    render(
      <ModalHeader icon={<ClipboardCheck />} title="X" onClose={() => {}} closeLabel="Dismiss" />,
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});
