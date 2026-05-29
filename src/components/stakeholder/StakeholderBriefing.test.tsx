import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StakeholderBriefing } from "./StakeholderBriefing";
import type { UseStakeholderAnalysisReturn } from "@/hooks/useStakeholderAnalysis";

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: (key: string, defaultValue: unknown) => [defaultValue, vi.fn()],
}));

vi.mock("./AiInsightsPanel", () => ({
  AiInsightsPanel: ({
    type,
    onDismiss,
    onRetry,
  }: {
    type: string;
    onDismiss: () => void;
    onRetry: () => void;
  }) => (
    <div data-testid={`ai-insights-${type}`}>
      <button onClick={onDismiss}>Dismiss {type}</button>
      <button onClick={onRetry}>Retry {type}</button>
    </div>
  ),
}));

function makeBriefRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    sprintId: 1,
    sprintName: "Sprint 42",
    type: "brief" as const,
    status: "completed" as const,
    content: null,
    narrative: null,
    risks: null,
    workspaceTaskId: null,
    conversationId: null,
    snapshotDonePoints: 10,
    snapshotTodoCount: 5,
    createdAt: "2026-05-29T10:00:00Z",
    completedAt: "2026-05-29T10:05:00Z",
    ...overrides,
  };
}

function makeIdleLiveState() {
  return { status: "idle" as const, progressText: "", error: null };
}

function makeAnalysis(overrides: Partial<UseStakeholderAnalysisReturn> = {}): UseStakeholderAnalysisReturn {
  return {
    brief: null,
    deepDive: null,
    liveState: {
      brief: makeIdleLiveState(),
      "deep-dive": makeIdleLiveState(),
    },
    isStale: vi.fn().mockReturnValue(false),
    generate: vi.fn(),
    mutate: vi.fn(),
    ...overrides,
  };
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  analysis: makeAnalysis(),
  currentDonePoints: 10,
  currentTodoCount: 5,
  anyRunning: false,
  onGenerate: vi.fn(),
  dismissed: { brief: false, "deep-dive": false },
  onDismiss: vi.fn(),
  storedBriefRisks: [],
};

describe("StakeholderBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when open is false", () => {
    render(<StakeholderBriefing {...defaultProps} open={false} />);
    expect(screen.queryByText("AI Analysis")).not.toBeInTheDocument();
  });

  it("renders the drawer header when open", () => {
    render(<StakeholderBriefing {...defaultProps} />);
    expect(screen.getByText("AI Analysis")).toBeInTheDocument();
  });

  it("renders the close button", () => {
    render(<StakeholderBriefing {...defaultProps} />);
    expect(screen.getByLabelText("Close AI analysis")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<StakeholderBriefing {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close AI analysis"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<StakeholderBriefing {...defaultProps} onClose={onClose} />);
    // The backdrop is the first sibling div
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Generate Status Brief prompt when no brief content is available", () => {
    render(<StakeholderBriefing {...defaultProps} />);
    expect(screen.getByText("Generate Status Brief")).toBeInTheDocument();
  });

  it("shows Generate Sprint Insights prompt when no deep-dive content is available", () => {
    render(<StakeholderBriefing {...defaultProps} />);
    expect(screen.getByText("Generate Sprint Insights")).toBeInTheDocument();
  });

  it("calls onGenerate with 'brief' when brief Generate button is clicked", () => {
    const onGenerate = vi.fn();
    render(<StakeholderBriefing {...defaultProps} onGenerate={onGenerate} />);
    // Find the button in the brief section
    const buttons = screen.getAllByText("Generate Status Brief");
    fireEvent.click(buttons[0]);
    expect(onGenerate).toHaveBeenCalledWith("brief");
  });

  it("calls onGenerate with 'deep-dive' when deep-dive Generate button is clicked", () => {
    const onGenerate = vi.fn();
    render(<StakeholderBriefing {...defaultProps} onGenerate={onGenerate} />);
    const buttons = screen.getAllByText("Generate Sprint Insights");
    fireEvent.click(buttons[0]);
    expect(onGenerate).toHaveBeenCalledWith("deep-dive");
  });

  it("disables generate buttons when anyRunning is true", () => {
    render(<StakeholderBriefing {...defaultProps} anyRunning={true} />);
    const generateButtons = screen.getAllByRole("button", { name: /Generate/ });
    generateButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("renders AiInsightsPanel when brief has content", () => {
    const analysis = makeAnalysis({
      brief: makeBriefRow({ narrative: "Sprint is on track.", content: null }),
    });
    render(<StakeholderBriefing {...defaultProps} analysis={analysis} />);
    expect(screen.getByTestId("ai-insights-brief")).toBeInTheDocument();
  });

  it("renders AiInsightsPanel when deep-dive has content", () => {
    const analysis = makeAnalysis({
      deepDive: makeBriefRow({ content: "Deep analysis text.", type: "deep-dive" }),
    });
    render(<StakeholderBriefing {...defaultProps} analysis={analysis} />);
    expect(screen.getByTestId("ai-insights-deep-dive")).toBeInTheDocument();
  });

  it("does not render brief section when brief is dismissed", () => {
    render(
      <StakeholderBriefing
        {...defaultProps}
        dismissed={{ brief: true, "deep-dive": false }}
      />,
    );
    expect(screen.queryByText("Generate Status Brief")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-insights-brief")).not.toBeInTheDocument();
  });

  it("does not render deep-dive section when deep-dive is dismissed", () => {
    render(
      <StakeholderBriefing
        {...defaultProps}
        dismissed={{ brief: false, "deep-dive": true }}
      />,
    );
    expect(screen.queryByText("Generate Sprint Insights")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-insights-deep-dive")).not.toBeInTheDocument();
  });

  it("renders AiInsightsPanel when brief liveState is not idle", () => {
    const analysis = makeAnalysis({
      liveState: {
        brief: { status: "streaming", progressText: "", error: null },
        "deep-dive": makeIdleLiveState(),
      },
    });
    render(<StakeholderBriefing {...defaultProps} analysis={analysis} />);
    expect(screen.getByTestId("ai-insights-brief")).toBeInTheDocument();
  });
});
