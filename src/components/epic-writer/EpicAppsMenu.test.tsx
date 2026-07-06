import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EpicAppsMenu } from "./EpicAppsMenu";

describe("EpicAppsMenu (BRDG-484)", () => {
  it("renders an Apps trigger and opens the view list", () => {
    render(<EpicAppsMenu view="breakdown" onSelect={() => {}} />);
    // Closed by default.
    expect(screen.queryByRole("menuitem", { name: /Breakdown/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    expect(screen.getByRole("menuitem", { name: /Breakdown/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Draft/ })).toBeTruthy();
  });

  it("calls onSelect with the chosen view and closes the menu", () => {
    const onSelect = vi.fn();
    render(<EpicAppsMenu view="breakdown" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Draft/ }));
    expect(onSelect).toHaveBeenCalledWith("draft");
    // Menu closes after a selection.
    expect(screen.queryByRole("menuitem", { name: /Draft/ })).toBeNull();
  });

  it("lists the Sprints planning view and selects it (BRDG-486)", () => {
    const onSelect = vi.fn();
    render(<EpicAppsMenu view="breakdown" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    expect(screen.getByRole("menuitem", { name: /Sprints/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Sprints/ }));
    expect(onSelect).toHaveBeenCalledWith("sprints");
  });

  it("lists an open child story as a third view (BRDG-485)", () => {
    const onSelect = vi.fn();
    render(<EpicAppsMenu view="child" onSelect={onSelect} childKey="VPL-47292" />);
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /VPL-47292/ }));
    expect(onSelect).toHaveBeenCalledWith("child");
  });

  it("omits the child view when no child is open", () => {
    render(<EpicAppsMenu view="breakdown" onSelect={() => {}} childKey={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    expect(screen.getByRole("menuitem", { name: /Breakdown/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Sprints/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Draft/ })).toBeTruthy();
    // Only the three base views (Breakdown, Sprints, Draft).
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  // BRDG-487 #3: chat is a toggleable app, listed only when onToggleChat is given.
  it("lists Chat as a toggleable app and calls onToggleChat on click", () => {
    const onToggleChat = vi.fn();
    render(
      <EpicAppsMenu view="breakdown" onSelect={() => {}} chatVisible onToggleChat={onToggleChat} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    const chatItem = screen.getByRole("menuitem", { name: /Chat/ });
    expect(chatItem).toBeTruthy();
    fireEvent.click(chatItem);
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it("does not list Chat when onToggleChat is not provided", () => {
    render(<EpicAppsMenu view="breakdown" onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    expect(screen.queryByRole("menuitem", { name: /^Chat$/ })).toBeNull();
  });
});
