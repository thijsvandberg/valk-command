import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useSWR from "swr";
import { EpicListPanel } from "./EpicListPanel";
import { apiFetch } from "@/lib/api-client";

vi.mock("swr", () => ({ default: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  swrFetcher: vi.fn(),
  ApiError: class ApiError extends Error { status = 500; body = {}; },
}));
vi.mock("@/hooks/useTaskStream", () => ({ useTaskStream: vi.fn() }));

const EPICS = [
  { key: "VPL-46805", name: "Price comparison" },
  { key: "VPL-45583", name: "Hotel Technology General" },
];
const mutate = vi.fn();

const flush = () =>
  waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/jira/sync-epics", { method: "POST" }));

beforeEach(() => {
  vi.mocked(useSWR).mockReturnValue({ data: EPICS, mutate } as never);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(undefined as never);
  mutate.mockClear();
});

describe("EpicListPanel", () => {
  it("renders each epic's name and key", async () => {
    render(<EpicListPanel onSelect={vi.fn()} />);
    expect(screen.getByText("Price comparison")).toBeInTheDocument();
    expect(screen.getByText("VPL-46805")).toBeInTheDocument();
    expect(screen.getByText("Hotel Technology General")).toBeInTheDocument();
    await flush();
  });

  it("auto-syncs epics from Jira once on open, so a new epic shows without a full reload", async () => {
    render(<EpicListPanel onSelect={vi.fn()} />);
    await flush();
  });

  it("filters the list by the search query", async () => {
    render(<EpicListPanel onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search epics..."), { target: { value: "hotel" } });
    expect(screen.queryByText("Price comparison")).not.toBeInTheDocument();
    expect(screen.getByText("Hotel Technology General")).toBeInTheDocument();
    await flush();
  });

  it("passes both the epic key and name when an epic is picked", async () => {
    const onSelect = vi.fn();
    render(<EpicListPanel onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Price comparison"));
    expect(onSelect).toHaveBeenCalledWith("VPL-46805", "Price comparison");
    await flush();
  });

  it("clears the epic via the No epic option", async () => {
    const onSelect = vi.fn();
    render(<EpicListPanel onSelect={onSelect} />);
    fireEvent.click(screen.getByText("No epic"));
    expect(onSelect).toHaveBeenCalledWith(null, null);
    await flush();
  });

  it("re-syncs from Jira when the refresh button is clicked", async () => {
    render(<EpicListPanel onSelect={vi.fn()} />);
    await flush();
    vi.mocked(apiFetch).mockClear();
    fireEvent.click(screen.getByLabelText("Sync epics from Jira"));
    await flush();
  });

  it("hides the AI suggest action when no ticketKey is given (bulk selection)", async () => {
    render(<EpicListPanel onSelect={vi.fn()} />);
    expect(screen.queryByLabelText("Suggest epic with AI")).not.toBeInTheDocument();
    await flush();
  });

  it("offers AI suggest and requests a suggestion for the single target ticket", async () => {
    render(<EpicListPanel ticketKey="VPL-1" onSelect={vi.fn()} />);
    await flush();
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue({ taskId: "task-1" } as never);
    fireEvent.click(screen.getByLabelText("Suggest epic with AI"));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-1/suggest-epic", { method: "POST" }),
    );
  });
});
