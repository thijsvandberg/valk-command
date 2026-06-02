import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicPicker } from "./EpicPicker";

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

vi.mock("@/hooks/useTaskStream", () => ({
  useTaskStream: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EpicPicker", () => {
  it("renders trigger with 'Select epic' when no value", () => {
    render(<EpicPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Select epic")).toBeInTheDocument();
  });

  it("renders trigger with epic name when value is set", () => {
    render(<EpicPicker value={{ key: "EPIC-1", name: "Epic Alpha" }} onChange={vi.fn()} />);
    expect(screen.getByText("Epic Alpha")).toBeInTheDocument();
  });

  it("opens popover and shows epic list", () => {
    render(<EpicPicker value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Select epic"));
    expect(screen.getByText("Epic Alpha")).toBeInTheDocument();
    expect(screen.getByText("Epic Beta")).toBeInTheDocument();
  });

  it("calls onChange with selected epic", () => {
    const onChange = vi.fn();
    render(<EpicPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Select epic"));
    fireEvent.click(screen.getByText("Epic Beta"));
    expect(onChange).toHaveBeenCalledWith({ key: "EPIC-2", name: "Epic Beta" });
  });

  it("shows 'Remove epic' option when value is set", () => {
    render(<EpicPicker value={{ key: "EPIC-1", name: "Epic Alpha" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Epic Alpha")[0]);
    expect(screen.getByText("Remove epic")).toBeInTheDocument();
  });

  it("calls onChange with null when 'Remove epic' clicked", () => {
    const onChange = vi.fn();
    render(<EpicPicker value={{ key: "EPIC-1", name: "Epic Alpha" }} onChange={onChange} />);
    fireEvent.click(screen.getAllByText("Epic Alpha")[0]);
    fireEvent.click(screen.getByText("Remove epic"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows epic keys in list", () => {
    render(<EpicPicker value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Select epic"));
    expect(screen.getByText("EPIC-1")).toBeInTheDocument();
    expect(screen.getByText("EPIC-2")).toBeInTheDocument();
  });

  it("shows stale indicator for epics with stale summaries", () => {
    render(<EpicPicker value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Select epic"));
    expect(screen.getByTestId("alert")).toBeInTheDocument();
  });

  it("does not render a navigation link on the closed pill", () => {
    render(<EpicPicker value={{ key: "EPIC-1", name: "Epic Alpha" }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/^Open epic/)).not.toBeInTheDocument();
  });

  it("shows an 'Open epic' link in the dropdown when an epic is selected", () => {
    render(<EpicPicker value={{ key: "EPIC-1", name: "Epic Alpha" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Epic Alpha")[0]);
    const link = screen.getByLabelText("Open epic Epic Alpha");
    expect(link).toHaveAttribute("href", "/tickets/EPIC-1");
  });

  it("does not show the 'Open epic' link when no epic is selected", () => {
    render(<EpicPicker value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Select epic"));
    expect(screen.queryByLabelText(/^Open epic/)).not.toBeInTheDocument();
  });

  it("renders each picker row key as a link to the epic ticket", () => {
    render(<EpicPicker value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Select epic"));
    expect(screen.getByText("EPIC-1").closest("a")).toHaveAttribute("href", "/tickets/EPIC-1");
    expect(screen.getByText("EPIC-2").closest("a")).toHaveAttribute("href", "/tickets/EPIC-2");
  });

  it("clicking a row key link navigates without selecting the epic", () => {
    const onChange = vi.fn();
    render(<EpicPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Select epic"));
    fireEvent.click(screen.getByText("EPIC-1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still selects the epic when the row body is clicked", () => {
    const onChange = vi.fn();
    render(<EpicPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Select epic"));
    fireEvent.click(screen.getByText("Epic Beta"));
    expect(onChange).toHaveBeenCalledWith({ key: "EPIC-2", name: "Epic Beta" });
  });
});
