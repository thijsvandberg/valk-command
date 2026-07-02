import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppsMenu } from "./AppsMenu";

vi.mock("./PaneContext", () => ({
  usePaneContext: vi.fn(),
}));

vi.mock("./WriterContext", () => ({
  useWriterContext: vi.fn(),
}));

import { usePaneContext } from "./PaneContext";
import { useWriterContext } from "./WriterContext";

function makePane(overrides: Record<string, unknown> = {}) {
  return {
    paneApps: ["chat", "editor", null],
    paneVisible: [true, true, false],
    openApp: vi.fn(),
    closeApp: vi.fn(),
    ...overrides,
  };
}

const ALL_APP_LABELS = [
  "Chat",
  "Editor",
  "Diff",
  "History",
  "Draft preview",
  "Related",
  "Story preview",
  "Meta",
];

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /apps/i }));
}

describe("AppsMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue({
      targetTicketKey: null,
    });
  });

  it("opens a dropdown listing all 8 apps", () => {
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePane());
    render(<AppsMenu />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    openMenu();

    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(8);
    for (const label of ALL_APP_LABELS) {
      expect(screen.getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("closes an open app and keeps the menu open", () => {
    const pane = makePane();
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(pane);
    render(<AppsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /chat/i }));

    expect(pane.closeApp).toHaveBeenCalledWith("chat");
    expect(pane.openApp).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens a closed app and keeps the menu open", () => {
    const pane = makePane();
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(pane);
    render(<AppsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /diff/i }));

    expect(pane.openApp).toHaveBeenCalledWith("diff");
    expect(pane.closeApp).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("does not treat an app in a hidden pane as open", () => {
    const pane = makePane({
      paneApps: ["chat", "editor", "diff"],
      paneVisible: [true, true, false],
    });
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(pane);
    render(<AppsMenu />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /diff/i }));
    expect(pane.openApp).toHaveBeenCalledWith("diff");
  });

  it("shows the split-target entry only when a target ticket is set", () => {
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePane());
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue({
      targetTicketKey: "VPL-999",
    });
    render(<AppsMenu />);
    openMenu();

    expect(screen.getAllByRole("menuitem")).toHaveLength(9);
    expect(screen.getByRole("menuitem", { name: /VPL-999/ })).toBeInTheDocument();
  });

  it("closes on outside mousedown", () => {
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePane());
    render(<AppsMenu />);
    openMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
