import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CreateSessionModal } from "./CreateSessionModal";

function pickToday() {
  // Open the date popover and click today's day number in the calendar grid.
  fireEvent.click(screen.getByRole("button", { name: "Session date" }));
  const dialog = screen.getByRole("dialog", { name: "Session date" });
  const today = new Date();
  const dayButtons = Array.from(
    dialog.querySelectorAll("button"),
  ).filter((b) => b.textContent === String(today.getDate()) && !b.disabled);
  fireEvent.click(dayButtons[0]);
}

describe("CreateSessionModal", () => {
  it("does not render content when closed", () => {
    render(
      <CreateSessionModal open={false} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.queryByText("New refinement session")).not.toBeInTheDocument();
  });

  it("opens with an empty optional name field and a date field", () => {
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.getByText("New refinement session")).toBeInTheDocument();
    const input = screen.getByTestId("create-session-name-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByTestId("create-session-date-picker")).toBeInTheDocument();
  });

  it("disables Create and blocks Enter when both name and date are empty", () => {
    const onCreate = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={onCreate} />,
    );
    expect(screen.getByText("Create")).toBeDisabled();
    expect(screen.getByText("Give it a name or pick a date")).toBeVisible();

    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByText("Create"));

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates with name only", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={onClose} onCreate={onCreate} />,
    );

    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "  My Session  " } });
    fireEvent.click(screen.getByText("Create"));

    expect(onCreate).toHaveBeenCalledWith({ name: "My Session", scheduledFor: undefined });
    expect(onClose).toHaveBeenCalled();
  });

  it("creates with date only", () => {
    const onCreate = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={onCreate} />,
    );

    pickToday();
    fireEvent.click(screen.getByText("Create"));

    expect(onCreate).toHaveBeenCalledWith({
      name: undefined,
      scheduledFor: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("creates with both name and date", () => {
    const onCreate = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={onCreate} />,
    );

    fireEvent.change(screen.getByTestId("create-session-name-input"), {
      target: { value: "Sprint 44" },
    });
    pickToday();
    fireEvent.click(screen.getByText("Create"));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Sprint 44",
      scheduledFor: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("submits on Enter key when a name is given", () => {
    const onCreate = vi.fn();
    render(
      <CreateSessionModal open={true} onClose={vi.fn()} onCreate={onCreate} />,
    );

    const input = screen.getByTestId("create-session-name-input");
    fireEvent.change(input, { target: { value: "Sprint 44" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCreate).toHaveBeenCalledWith({ name: "Sprint 44", scheduledFor: undefined });
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
