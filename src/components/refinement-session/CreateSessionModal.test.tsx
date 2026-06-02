import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CreateSessionModal } from "./CreateSessionModal";

describe("CreateSessionModal", () => {
  it("does not render content when closed", () => {
    render(
      <CreateSessionModal open={false} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.queryByText("New refinement session")).not.toBeInTheDocument();
  });

  it("opens with today's date prefilled, without a Refinement prefix", () => {
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.getByText("New refinement session")).toBeInTheDocument();
    const input = screen.getByTestId("create-session-name-input") as HTMLInputElement;
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to today's date when submitted empty", () => {
    const onCreate = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={onCreate} />,
    );
    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Create"));
    expect(onCreate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("calls onCreate with trimmed name on submit", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={onClose} onCreate={onCreate} />,
    );

    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "  My Session  " } });
    fireEvent.click(screen.getByText("Create"));

    expect(onCreate).toHaveBeenCalledWith("My Session");
    expect(onClose).toHaveBeenCalled();
  });

  it("submits on Enter key", () => {
    const onCreate = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={onCreate} />,
    );

    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "Sprint 44" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCreate).toHaveBeenCalledWith("Sprint 44");
  });

  it("keeps Create enabled when input is empty so the suggestion can be accepted", () => {
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={vi.fn()} />,
    );

    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "   " } });

    expect(screen.getByText("Create")).toBeEnabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={onClose} onCreate={vi.fn()} />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
