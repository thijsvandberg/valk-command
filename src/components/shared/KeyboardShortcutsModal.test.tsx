import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

vi.mock("./Modal", () => ({
  Modal: ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) =>
    open ? (
      <div data-testid="modal" role="dialog">
        <button onClick={onClose} data-testid="modal-close">Close</button>
        {children}
      </div>
    ) : null,
}));

vi.mock("@/lib/keyboard-shortcuts", () => ({
  KEYBOARD_SHORTCUTS: [
    {
      scope: "Global",
      shortcuts: [
        { keys: ["Cmd", "K"], action: "Open Command Palette" },
        { keys: ["Esc"], action: "Close" },
      ],
    },
    {
      scope: "Ticket Detail",
      shortcuts: [
        { keys: ["["], action: "Toggle sidebar" },
      ],
    },
  ],
}));

describe("KeyboardShortcutsModal", () => {
  it("does not render modal by default", () => {
    render(<KeyboardShortcutsModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when valk:openKeyboardShortcuts event fires", async () => {
    render(<KeyboardShortcutsModal />);
    window.dispatchEvent(new Event("valk:openKeyboardShortcuts"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("displays shortcut groups and entries", async () => {
    render(<KeyboardShortcutsModal />);
    window.dispatchEvent(new Event("valk:openKeyboardShortcuts"));

    await waitFor(() => {
      expect(screen.getByText("Global")).toBeInTheDocument();
    });
    expect(screen.getByText("Ticket Detail")).toBeInTheDocument();
    expect(screen.getByText("Open Command Palette")).toBeInTheDocument();
    expect(screen.getByText("Toggle sidebar")).toBeInTheDocument();
  });

  it("renders keyboard key badges", async () => {
    render(<KeyboardShortcutsModal />);
    window.dispatchEvent(new Event("valk:openKeyboardShortcuts"));

    await waitFor(() => {
      expect(screen.getByText("Cmd")).toBeInTheDocument();
    });
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("closes when modal onClose is called", async () => {
    render(<KeyboardShortcutsModal />);
    window.dispatchEvent(new Event("valk:openKeyboardShortcuts"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("modal-close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
