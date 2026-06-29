import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ViewHeader, ViewHeaderTitle } from "./ViewHeader";

// Focus mode context — only toggleFocusMode is consumed.
const mockToggleFocusMode = vi.fn();
vi.mock("@/contexts/FocusModeContext", () => ({
  useFocusModeContext: () => ({ toggleFocusMode: mockToggleFocusMode }),
}));

// NotificationBell pulls in providers — stub it.
vi.mock("@/components/NotificationBell", () => ({
  NotificationBell: () => <div data-testid="bell" />,
}));

// NavPanel is covered by its own suite; here we only assert open-state wiring.
vi.mock("@/components/nav/NavPanel", () => ({
  NavPanel: ({ open }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="nav-panel" /> : null,
}));

function renderHeader() {
  return render(
    <ViewHeader actions={<button>Action</button>}>
      <span>Sprint context</span>
    </ViewHeader>,
  );
}

function trigger() {
  return screen.getByRole("button", { name: "Open navigation" });
}

describe("ViewHeader command bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const portal = document.createElement("div");
    portal.id = "view-header-portal";
    document.body.appendChild(portal);
  });

  afterEach(() => {
    document.getElementById("view-header-portal")?.remove();
  });

  it("renders nothing until the portal target exists", () => {
    document.getElementById("view-header-portal")?.remove();
    const { container } = renderHeader();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument();
  });

  it("renders the page title as a single <h1> (BRDG-425)", () => {
    render(<ViewHeaderTitle>Sprint Board</ViewHeaderTitle>);
    expect(screen.getByRole("heading", { level: 1, name: "Sprint Board" })).toBeInTheDocument();
  });

  it("wraps the persistent nav trigger in a primary <nav> landmark (BRDG-425)", () => {
    renderHeader();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("renders the wordmark trigger, view context and right-side actions", () => {
    renderHeader();
    expect(trigger()).toBeInTheDocument();
    expect(screen.getByText("Sprint context")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByTestId("bell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle focus mode" })).toBeInTheDocument();
  });

  it("caps and centers the inner content while the bar background stays full width (BRDG-361)", () => {
    renderHeader();
    const portal = document.getElementById("view-header-portal")!;
    // The cap wrapper holds both the wordmark trigger and the right-side actions.
    const cap = portal.querySelector(".max-w-\\[1536px\\]");
    expect(cap).toBeTruthy();
    expect(cap).toContainElement(trigger());
    expect(cap).toContainElement(screen.getByRole("button", { name: "Action" }));
    // The outer bar (chrome background) must NOT carry the cap, so glows span edge-to-edge.
    const bar = portal.firstElementChild!;
    expect(bar.className).not.toContain("max-w-[1536px]");
    expect(bar).not.toBe(cap);
  });

  it("is closed by default (aria-expanded=false, no panel)", () => {
    renderHeader();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nav-panel")).not.toBeInTheDocument();
  });

  it("opens the nav panel when the trigger is clicked", () => {
    renderHeader();
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-panel")).toBeInTheDocument();
  });

  it("toggles closed on a second trigger click", () => {
    renderHeader();
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nav-panel")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderHeader();
    fireEvent.click(trigger());
    expect(screen.getByTestId("nav-panel")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nav-panel")).not.toBeInTheDocument();
  });

  it("closes on an outside mousedown", () => {
    renderHeader();
    fireEvent.click(trigger());
    expect(screen.getByTestId("nav-panel")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nav-panel")).not.toBeInTheDocument();
  });

  it("stays open when the mousedown lands inside the trigger wrapper", () => {
    renderHeader();
    fireEvent.click(trigger());
    fireEvent.mouseDown(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-panel")).toBeInTheDocument();
  });
});
