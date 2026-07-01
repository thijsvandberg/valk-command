import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketReview } from "./TicketReview";
import type { StoredReview } from "@/types/ticket";

const mockGenerateReview = vi.fn();
const mockDeleteReview = vi.fn();
const mockStreamTaskAsPromise = vi.fn();
const mockGlobalMutate = vi.fn();

// The component mutates through the provider-bound useSWRConfig().mutate
// (BRDG-458); route it to the same spy the old global-mutate assertions use.
vi.mock("swr", () => ({
  mutate: (...args: unknown[]) => mockGlobalMutate(...args),
  useSWRConfig: () => ({ mutate: (...args: unknown[]) => mockGlobalMutate(...args) }),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketReviews: (ticketKey: string) => ({
    data: mockReviewsData(ticketKey),
    saveReview: vi.fn(),
    deleteReview: (...args: unknown[]) => mockDeleteReview(...args),
    mutate: vi.fn(),
  }),
}));

// Module-level state for mock data
let _mockReviews: StoredReview[] = [];
let _mockCurrentVersionHash: string | null = null;

function mockReviewsData(_ticketKey: string) {
  return {
    reviews: _mockReviews,
    currentVersionHash: _mockCurrentVersionHash,
  };
}

vi.mock("@/lib/api-client", () => ({
  tickets: {
    generateReview: (...args: unknown[]) => mockGenerateReview(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status = 500, public body?: { error?: string }) {
      super(message);
    }
  },
}));

vi.mock("@/hooks/useTaskStream", () => ({
  streamTaskAsPromise: (...args: unknown[]) => mockStreamTaskAsPromise(...args),
}));

vi.mock("@/components/shared/SectionHeader", () => ({
  SectionHeader: ({ title, count }: { title: string; count?: number }) => (
    <div data-testid={`header-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      {title}{count !== undefined ? ` (${count})` : ""}
    </div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>{children}</button>
  ),
}));

vi.mock("@/components/shared/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    onClose,
    onConfirm,
    title,
    confirmLabel,
  }: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel: string;
    confirmClassName?: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button data-testid="confirm-cancel" onClick={onClose}>Cancel</button>
        <button data-testid="confirm-action" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    ) : null,
}));

vi.mock("@/lib/status-colors", () => ({
  getScoreColor: (score: number) => (score >= 90 ? "green" : score >= 60 ? "orange" : "red"),
  verdictLabel: (score: number) => ({
    text: score >= 90 ? "Excellent" : score >= 60 ? "Needs work" : "Poor",
    color: score >= 90 ? "green" : score >= 60 ? "orange" : "red",
  }),
}));

function makeReview(overrides: Partial<StoredReview> = {}): StoredReview {
  return {
    id: "rev-1",
    ticketKey: "VPL-1",
    overallScore: 80,
    dimensions: [
      { key: "clarity", label: "Clarity", score: 80, feedback: "Good clarity" },
      { key: "completeness", label: "Completeness", score: 75, feedback: "Missing some AC" },
    ],
    suggestions: [],
    summary: "Overall a solid story",
    source: "ticket-detail",
    createdAt: "2024-01-01T10:00:00Z",
    storyVersionNumber: 1,
    storyVersionHash: "hash-v1",
    ...overrides,
  };
}

describe("TicketReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockReviews = [];
    _mockCurrentVersionHash = null;
    mockGenerateReview.mockResolvedValue({ taskId: "task-123" });
    mockStreamTaskAsPromise.mockResolvedValue(undefined);
    mockDeleteReview.mockResolvedValue(undefined);
  });

  it("shows 'No review yet' when no reviews exist", () => {
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("No review yet")).toBeInTheDocument();
  });

  it("shows 'Review Story via Agent' button when no reviews exist", () => {
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("Review Story via Agent")).toBeInTheDocument();
  });

  it("renders latest review score when review exists", () => {
    _mockReviews = [makeReview({ overallScore: 85 })];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("renders 'Latest Review' header", () => {
    _mockReviews = [makeReview()];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByTestId("header-latest-review")).toBeInTheDocument();
  });

  it("renders review dimensions", () => {
    _mockReviews = [makeReview()];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("Clarity")).toBeInTheDocument();
    expect(screen.getByText("Completeness")).toBeInTheDocument();
  });

  it("renders review summary", () => {
    _mockReviews = [makeReview({ summary: "Very good story structure" })];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("Very good story structure")).toBeInTheDocument();
  });

  it("shows 'Re-review' button when review exists", () => {
    _mockReviews = [makeReview()];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("Re-review")).toBeInTheDocument();
  });

  it("shows Delete button when review exists", () => {
    _mockReviews = [makeReview()];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls generateReview on 'Review Story via Agent' click", async () => {
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Review Story via Agent"));
    await waitFor(() => {
      expect(mockGenerateReview).toHaveBeenCalledWith("VPL-1", { source: "ticket-detail" });
    });
  });

  it("shows 'Reviewing...' during agent review", async () => {
    mockStreamTaskAsPromise.mockReturnValue(new Promise(() => {}));
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Review Story via Agent"));
    await waitFor(() => {
      expect(screen.getByText("Reviewing...")).toBeInTheDocument();
    });
  });

  it("button is disabled during review", async () => {
    mockStreamTaskAsPromise.mockReturnValue(new Promise(() => {}));
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Review Story via Agent"));
    await waitFor(() => {
      expect(screen.getByText("Reviewing...")).toBeDisabled();
    });
  });

  it("shows error when review generation fails", async () => {
    mockGenerateReview.mockRejectedValue(new Error("Agent failed"));
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Review Story via Agent"));
    await waitFor(() => {
      expect(screen.getByText("Agent failed")).toBeInTheDocument();
    });
  });

  it("shows error when no taskId returned", async () => {
    mockGenerateReview.mockResolvedValue({});
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Review Story via Agent"));
    await waitFor(() => {
      expect(screen.getByText("No task ID returned from review generation")).toBeInTheDocument();
    });
  });

  it("opens confirm dialog when Delete is clicked", () => {
    _mockReviews = [makeReview()];
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete review?")).toBeInTheDocument();
  });

  it("calls deleteReview when confirmed", async () => {
    _mockReviews = [makeReview({ id: "rev-to-delete" })];
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => {
      expect(mockDeleteReview).toHaveBeenCalledWith("rev-to-delete");
    });
  });

  it("closes confirm dialog on cancel", () => {
    _mockReviews = [makeReview()];
    render(<TicketReview ticketKey="VPL-1" />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("renders 'Previous Reviews' section for older reviews", () => {
    _mockReviews = [
      makeReview({ id: "rev-1", createdAt: "2024-01-02T00:00:00Z" }),
      makeReview({ id: "rev-2", createdAt: "2024-01-01T00:00:00Z" }),
    ];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByTestId("header-previous-reviews")).toBeInTheDocument();
  });

  it("shows review score for older review in collapsed state", () => {
    _mockReviews = [
      makeReview({ id: "rev-1", overallScore: 85, createdAt: "2024-01-02T00:00:00Z" }),
      makeReview({ id: "rev-2", overallScore: 60, createdAt: "2024-01-01T00:00:00Z" }),
    ];
    render(<TicketReview ticketKey="VPL-1" />);
    // Older review score appears in the collapsible header
    expect(screen.getByText("60")).toBeInTheDocument();
  });

  it("renders suggestions when present", () => {
    _mockReviews = [
      makeReview({
        suggestions: ["[Clarity|AC section|80/100] Missing edge cases -> Add error scenario examples"],
      }),
    ];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText(/Missing edge cases/)).toBeInTheDocument();
  });

  it("shows 'Based on v1 (current)' when review matches current version", () => {
    _mockCurrentVersionHash = "hash-v1";
    _mockReviews = [makeReview({ storyVersionHash: "hash-v1", storyVersionNumber: 1 })];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText(/Based on v1 \(current\)/)).toBeInTheDocument();
  });

  it("shows 'Based on v1 (outdated)' when review does not match current version", () => {
    _mockCurrentVersionHash = "hash-v2";
    _mockReviews = [makeReview({ storyVersionHash: "hash-v1", storyVersionNumber: 1 })];
    render(<TicketReview ticketKey="VPL-1" />);
    expect(screen.getByText(/Based on v1 \(outdated\)/)).toBeInTheDocument();
  });
});
