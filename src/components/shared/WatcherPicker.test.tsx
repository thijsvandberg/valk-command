import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WatcherPicker } from "./WatcherPicker";

const MOCK_USERS = [
  { accountId: "acc-alice", displayName: "Alice", avatarUrl: null, isFavorite: true, teams: ["BT"] },
  { accountId: "acc-bob", displayName: "Bob", avatarUrl: null, isFavorite: false, teams: ["BT", "BO"] },
  { accountId: "acc-charlie", displayName: "Charlie", avatarUrl: null, isFavorite: false, teams: ["BO"] },
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
  jira: { watcherCandidatesUrl: () => "/api/jira/watcher-candidates" },
}));

function openPicker() {
  fireEvent.click(screen.getByLabelText("Add watcher"));
}

describe("WatcherPicker", () => {
  const onAdd = vi.fn();
  const onRemove = vi.fn();

  beforeEach(() => {
    onAdd.mockClear();
    onRemove.mockClear();
  });

  it("renders an add-watcher trigger", () => {
    render(<WatcherPicker watchers={[]} onAdd={onAdd} onRemove={onRemove} />);
    expect(screen.getByLabelText("Add watcher")).toBeInTheDocument();
  });

  it("lists candidate users when opened", () => {
    render(<WatcherPicker watchers={[]} onAdd={onAdd} onRemove={onRemove} />);
    openPicker();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("calls onAdd for a user that is not yet watching", () => {
    render(<WatcherPicker watchers={[]} onAdd={onAdd} onRemove={onRemove} />);
    openPicker();
    fireEvent.click(screen.getByText("Bob"));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-bob" }));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("calls onRemove for a user that is already watching", () => {
    render(
      <WatcherPicker
        watchers={[{ accountId: "acc-alice", displayName: "Alice", avatarUrl: null }]}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    );
    openPicker();
    fireEvent.click(screen.getByText("Alice"));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-alice" }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("keeps the popover open after toggling a user", () => {
    render(<WatcherPicker watchers={[]} onAdd={onAdd} onRemove={onRemove} />);
    openPicker();
    fireEvent.click(screen.getByText("Bob"));
    // Other candidates remain visible -> popover did not close.
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("filters by search query", () => {
    render(<WatcherPicker watchers={[]} onAdd={onAdd} onRemove={onRemove} />);
    openPicker();
    fireEvent.change(screen.getByPlaceholderText("Search people..."), { target: { value: "char" } });
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });
});
