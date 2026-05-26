import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssigneePicker } from "./AssigneePicker";

const MOCK_USERS = [
  { accountId: "alice", displayName: "Alice", avatarUrl: null, isFavorite: true, teams: ["BT"] },
  { accountId: "bob", displayName: "Bob", avatarUrl: null, isFavorite: false, teams: ["BT", "BO"] },
  { accountId: "charlie", displayName: "Charlie", avatarUrl: null, isFavorite: false, teams: ["BO"] },
  { accountId: "diana", displayName: "Diana", avatarUrl: null, isFavorite: true, teams: ["GXP"] },
  { accountId: "eve", displayName: "Eve", avatarUrl: null, isFavorite: false, teams: [] },
];

vi.mock("swr", () => ({
  __esModule: true,
  default: (key: string | null) => {
    if (!key) return { data: undefined };
    return { data: { users: MOCK_USERS } };
  },
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
}));

describe("AssigneePicker", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockClear();
  });

  it("renders trigger with assignee name", () => {
    render(
      <AssigneePicker
        value={{ name: "Alice", initials: "AL", color: "red" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders trigger with 'Unassigned' when no value", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("opens popover on click and shows users", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByPlaceholderText("Search people...")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("always shows Unassigned option", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const unassignedButtons = screen.getAllByText("Unassigned");
    expect(unassignedButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows favorites at top with Favorites label", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Favorites")).toBeInTheDocument();

    const allButtons = screen.getAllByRole("button");
    const userButtons = allButtons.filter((b) =>
      ["Alice", "Bob", "Charlie", "Diana", "Eve"].some((name) => b.textContent?.includes(name)),
    );

    const names = userButtons.map((b) => b.textContent?.trim());
    const aliceIdx = names.findIndex((n) => n?.includes("Alice"));
    const dianaIdx = names.findIndex((n) => n?.includes("Diana"));
    const bobIdx = names.findIndex((n) => n?.includes("Bob"));

    expect(aliceIdx).toBeLessThan(bobIdx);
    expect(dianaIdx).toBeLessThan(bobIdx);
  });

  it("favorites do not appear in regular list (no duplicates)", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const aliceElements = screen.getAllByText("Alice");
    expect(aliceElements).toHaveLength(1);

    const dianaElements = screen.getAllByText("Diana");
    expect(dianaElements).toHaveLength(1);
  });

  it("search filters users by name", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByPlaceholderText("Search people...");
    fireEvent.change(input, { target: { value: "bob" } });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("shows team filter chips when teams are assigned", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const chipBar = screen.getByTestId("team-filter-chips");
    expect(chipBar).toBeInTheDocument();
    expect(chipBar.textContent).toContain("All");
    expect(chipBar.textContent).toContain("BT");
    expect(chipBar.textContent).toContain("BO");
    expect(chipBar.textContent).toContain("GXP");
  });

  it("clicking team chip filters to that team", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const chipBar = screen.getByTestId("team-filter-chips");
    const boChip = Array.from(chipBar.querySelectorAll("button")).find((b) => b.textContent === "BO")!;
    fireEvent.click(boChip);

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Diana")).not.toBeInTheDocument();
    expect(screen.queryByText("Eve")).not.toBeInTheDocument();
  });

  it("clicking All resets the team filter", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const chipBar = screen.getByTestId("team-filter-chips");
    const boChip = Array.from(chipBar.querySelectorAll("button")).find((b) => b.textContent === "BO")!;
    fireEvent.click(boChip);
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();

    const allChip = Array.from(chipBar.querySelectorAll("button")).find((b) => b.textContent === "All")!;
    fireEvent.click(allChip);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Eve")).toBeInTheDocument();
  });

  it("Unassigned remains visible with team filter active", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("BT"));

    const unassignedButtons = screen.getAllByText("Unassigned");
    expect(unassignedButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("favorites section respects team filter", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("BT"));

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Diana")).not.toBeInTheDocument();
  });

  it("search works within team filter", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const chipBar = screen.getByTestId("team-filter-chips");
    const boChip = Array.from(chipBar.querySelectorAll("button")).find((b) => b.textContent === "BO")!;
    fireEvent.click(boChip);

    const input = screen.getByPlaceholderText("Search people...");
    fireEvent.change(input, { target: { value: "bob" } });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("calls onChange with selected user", () => {
    render(<AssigneePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("Bob"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Bob" }));
  });

  it("calls onChange with null when Unassigned is clicked", () => {
    render(
      <AssigneePicker
        value={{ name: "Alice", initials: "AL", color: "red" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    const unassignedInPopover = screen.getAllByText("Unassigned").find(
      (el) => el.closest("[class*='hover:bg-hover-list-item']"),
    );
    if (unassignedInPopover) fireEvent.click(unassignedInPopover);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
