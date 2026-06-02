import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetTeams = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/useEpics", () => ({
  useSetEpicTeams: () => mockSetTeams,
}));

import { EpicTeamPicker } from "./EpicTeamPicker";

describe("EpicTeamPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders chips for assigned teams", () => {
    render(<EpicTeamPicker epicKey="VPL-E1" teams={["BT", "GXP"]} />);
    expect(screen.getByText("BT")).toBeInTheDocument();
    expect(screen.getByText("GXP")).toBeInTheDocument();
  });

  it("renders an unobtrusive affordance when unassigned", () => {
    render(<EpicTeamPicker epicKey="VPL-E1" teams={[]} />);
    expect(screen.getByRole("button", { name: /assign teams/i })).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("adds a team via the popover", async () => {
    render(<EpicTeamPicker epicKey="VPL-E1" teams={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /assign teams/i }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /BT/i }));
    await waitFor(() => expect(mockSetTeams).toHaveBeenCalledWith("VPL-E1", ["BT"]));
  });

  it("removes an already-assigned team", async () => {
    render(<EpicTeamPicker epicKey="VPL-E1" teams={["BT", "GXP"]} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^BT/i }));
    await waitFor(() => expect(mockSetTeams).toHaveBeenCalledWith("VPL-E1", ["GXP"]));
  });

  it("clears all teams", async () => {
    render(<EpicTeamPicker epicKey="VPL-E1" teams={["BT"]} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /clear teams/i }));
    await waitFor(() => expect(mockSetTeams).toHaveBeenCalledWith("VPL-E1", []));
  });

  it("preserves the fixed team order when adding", async () => {
    render(<EpicTeamPicker epicKey="VPL-E1" teams={["GXP"]} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^BO/i }));
    // TEAMS order is BO, BM, BT, GXP, HT -> BO comes before GXP.
    await waitFor(() => expect(mockSetTeams).toHaveBeenCalledWith("VPL-E1", ["BO", "GXP"]));
  });
});
