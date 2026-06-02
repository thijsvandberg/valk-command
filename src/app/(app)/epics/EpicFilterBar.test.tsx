import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicFilterBar } from "./EpicFilterBar";

function setup(overrides: Partial<React.ComponentProps<typeof EpicFilterBar>> = {}) {
  const props = {
    teamFilter: [],
    noTeam: false,
    statusFilter: [],
    onToggleTeam: vi.fn(),
    onToggleNoTeam: vi.fn(),
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

  it("toggles the No team option", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Team/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /no team/i }));
    expect(props.onToggleNoTeam).toHaveBeenCalled();
  });

  it("labels the trigger 'No team' when only noTeam is active", () => {
    setup({ noTeam: true });
    expect(screen.getByRole("button", { name: /no team/i })).toBeInTheDocument();
  });

  it("toggles a status by its standard label", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /IN PROGRESS/ }));
    expect(props.onToggleStatus).toHaveBeenCalledWith("IN PROGRESS");
  });

  it("renders standard status abbreviation pills", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    expect(screen.getByText("TODO")).toBeInTheDocument();
    expect(screen.getByText("PROG")).toBeInTheDocument();
    expect(screen.getByText("DEPR")).toBeInTheDocument();
  });

  it("summarises active counts and exposes Clear filters", () => {
    const props = setup({ teamFilter: ["BT", "GXP"], statusFilter: ["DONE"] });
    expect(screen.getByRole("button", { name: /2 teams/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^DONE/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(props.onClearAll).toHaveBeenCalled();
  });
});
