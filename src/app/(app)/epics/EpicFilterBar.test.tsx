import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicFilterBar } from "./EpicFilterBar";

function setup(overrides: Partial<React.ComponentProps<typeof EpicFilterBar>> = {}) {
  const props = {
    teamFilter: [],
    statusFilter: [],
    onToggleTeam: vi.fn(),
    onToggleStatus: vi.fn(),
    onClearTeams: vi.fn(),
    onClearStatuses: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
  render(<EpicFilterBar {...props} />);
  return props;
}

describe("EpicFilterBar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows neutral labels when no filters are active", () => {
    setup();
    expect(screen.getByRole("button", { name: /^Team/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it("toggles a team", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Team/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^BT/ }));
    expect(props.onToggleTeam).toHaveBeenCalledWith("BT");
  });

  it("toggles a status bucket by its label", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /in progress/i }));
    expect(props.onToggleStatus).toHaveBeenCalledWith("in_progress");
  });

  it("summarises the active team count and exposes Clear filters", () => {
    const props = setup({ teamFilter: ["BT", "GXP"], statusFilter: ["done"] });
    expect(screen.getByRole("button", { name: /2 teams/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Done/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(props.onClearAll).toHaveBeenCalled();
  });
});
