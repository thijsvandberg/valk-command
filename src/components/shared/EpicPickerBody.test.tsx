import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicPickerBody } from "./EpicPicker";
import { apiFetch } from "@/lib/api-client";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("lucide-react", () => ({
  Check: (props: Record<string, unknown>) => <span data-testid="check" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="search" {...props} />,
  Zap: (props: Record<string, unknown>) => <span data-testid="zap" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="refresh" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="sparkles" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="alert" {...props} />,
  ArrowUpRight: (props: Record<string, unknown>) => <span data-testid="arrow-up-right" {...props} />,
  ExternalLink: (props: Record<string, unknown>) => <span data-testid="external-link" {...props} />,
  PanelRight: (props: Record<string, unknown>) => <span data-testid="panel-right" {...props} />,
}));

const mockMutate = vi.fn();
vi.mock("swr", () => ({
  default: () => ({
    data: [
      { key: "EPIC-1", name: "Epic Alpha", status: "To Do", childCount: 3, summary: null, summaryStale: false },
      { key: "EPIC-2", name: "Epic Beta", status: "In Progress", childCount: 5, summary: "summary", summaryStale: true },
    ],
    mutate: mockMutate,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  swrFetcher: vi.fn(),
  ApiError: class ApiError extends Error { status = 500; body = {}; },
}));

vi.mock("@/components/shared/IssueMetaBadges", () => ({
  EpicBadge: ({ epic }: { epic: string }) => <span data-testid="epic-badge">{epic}</span>,
}));

vi.mock("@/hooks/useTaskStream", () => ({ useTaskStream: vi.fn() }));

// Settle the once-per-mount auto-sync so its setState doesn't leak past a test.
const flushSync = () =>
  waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/jira/sync-epics", { method: "POST" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({} as never);
});

describe("EpicPickerBody", () => {
  it("renders each epic's name and key", async () => {
    render(<EpicPickerBody value={null} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Epic Alpha")).toBeInTheDocument();
    expect(screen.getByText("Epic Beta")).toBeInTheDocument();
    expect(screen.getByText("EPIC-1")).toBeInTheDocument();
    expect(screen.getByText("EPIC-2")).toBeInTheDocument();
    await flushSync();
  });

  it("filters the list by the search query", async () => {
    render(<EpicPickerBody value={null} onChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search epics..."), { target: { value: "beta" } });
    expect(screen.queryByText("Epic Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Epic Beta")).toBeInTheDocument();
    await flushSync();
  });

  it("calls onChange with the picked epic and closes", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<EpicPickerBody value={null} onChange={onChange} onClose={onClose} />);
    fireEvent.click(screen.getByText("Epic Beta"));
    expect(onChange).toHaveBeenCalledWith({ key: "EPIC-2", name: "Epic Beta" });
    expect(onClose).toHaveBeenCalled();
    await flushSync();
  });

  it("never shows a default 'No epic' row", async () => {
    render(<EpicPickerBody value={null} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("No epic")).not.toBeInTheDocument();
    await flushSync();
  });

  it("shows View + Unlink and a checkmark when an epic is set", async () => {
    const onChange = vi.fn();
    render(<EpicPickerBody value={{ key: "EPIC-1", name: "Epic Alpha" }} onChange={onChange} onClose={vi.fn()} />);
    expect(screen.getByLabelText("View epic Epic Alpha")).toHaveAttribute("href", "/tickets/EPIC-1");
    expect(screen.getByText("Unlink epic")).toBeInTheDocument();
    expect(screen.getByTestId("check")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Unlink epic"));
    expect(onChange).toHaveBeenCalledWith(null);
    await flushSync();
  });

  it("offers 'Remove epic' only when clearable and nothing is selected (bulk)", async () => {
    const onChange = vi.fn();
    render(<EpicPickerBody value={null} clearable onChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Remove epic"));
    expect(onChange).toHaveBeenCalledWith(null);
    await flushSync();
  });

  it("hides 'Remove epic' when not clearable", async () => {
    render(<EpicPickerBody value={null} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("Remove epic")).not.toBeInTheDocument();
    await flushSync();
  });

  it("hides the AI suggest action without a ticketKey", async () => {
    render(<EpicPickerBody value={null} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Suggest epic with AI")).not.toBeInTheDocument();
    await flushSync();
  });

  it("offers AI suggest and requests a suggestion for the ticket when ticketKey is set", async () => {
    render(<EpicPickerBody value={null} ticketKey="VPL-1" onChange={vi.fn()} onClose={vi.fn()} />);
    await flushSync();
    vi.mocked(apiFetch).mockClear();
    fireEvent.click(screen.getByLabelText("Suggest epic with AI"));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-1/suggest-epic", { method: "POST" }),
    );
  });

  it("auto-syncs epics from Jira on mount and re-syncs via the refresh button", async () => {
    render(<EpicPickerBody value={null} onChange={vi.fn()} onClose={vi.fn()} />);
    await flushSync();
    vi.mocked(apiFetch).mockClear();
    fireEvent.click(screen.getByLabelText("Sync epics from Jira"));
    await flushSync();
  });
});
