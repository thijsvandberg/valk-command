import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddSubtasksModal } from "./AddSubtasksModal";

const createSubtask = vi.fn();

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  tickets: {
    createSubtask: (...args: unknown[]) => createSubtask(...args),
  },
}));

let counter = 0;
beforeEach(() => {
  createSubtask.mockReset();
  counter = 0;
  createSubtask.mockImplementation((_key: string, body: { title: string }) =>
    Promise.resolve({ key: `VPL-${++counter}`, title: body.title, type: "subtask", jiraStatus: "TO DO", assignee: null }),
  );
});

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<AddSubtasksModal open ticketKey="VPL-1" onClose={onClose} onCreated={onCreated} />);
  return { onClose, onCreated };
}

describe("AddSubtasksModal (BRDG-366)", () => {
  it("creates a subtask on Enter, shows it in the list, and stays open", async () => {
    const { onClose, onCreated } = setup();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.change(input, { target: { value: "First task" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The row appears optimistically and the input clears for the next entry.
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("");

    await waitFor(() => expect(createSubtask).toHaveBeenCalledWith("VPL-1", { title: "First task" }));
    // Creating a subtask must NOT close the modal or report yet (that would clear the
    // warning and unmount the modal mid-session).
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("creates several subtasks, then reports the total once on close", async () => {
    const { onClose, onCreated } = setup();
    const input = screen.getByPlaceholderText("Create subtask...");

    fireEvent.change(input, { target: { value: "One" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("One");

    fireEvent.change(screen.getByPlaceholderText("Add another subtask..."), { target: { value: "Two" } });
    fireEvent.keyDown(screen.getByPlaceholderText("Add another subtask..."), { key: "Enter" });
    await screen.findByText("Two");
    await waitFor(() => expect(screen.getByText("2 subtasks added")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error and drops the row when creation fails", async () => {
    createSubtask.mockRejectedValueOnce(new Error("boom"));
    const { onCreated } = setup();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.change(input, { target: { value: "Doomed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await screen.findByText(/Failed to add "Doomed"/i);
    expect(screen.queryByText("Doomed")).toBeNull();
  });

  it("does not report on close when nothing was created", () => {
    const { onClose, onCreated } = setup();
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("does nothing on Enter when the input is empty", () => {
    setup();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createSubtask).not.toHaveBeenCalled();
  });
});
