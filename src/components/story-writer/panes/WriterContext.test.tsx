import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WriterProvider, useWriterContext, type WriterContextValue } from "./WriterContext";

function TestConsumer({ onValue }: { onValue: (v: WriterContextValue) => void }) {
  const ctx = useWriterContext();
  onValue(ctx);
  return null;
}

function makeWriterValue(overrides?: Partial<WriterContextValue>): WriterContextValue {
  return {
    ticketKey: "VPL-1",
    ticketData: null,
    ticketDetail: null,
    mutateTicket: vi.fn(),
    session: null,
    messages: [],
    aiDrafts: [],
    targetAiDrafts: [],
    relatedCandidates: [],
    status: "ready",
    streamProgress: "",
    streamError: null,
    usage: null,
    lastResponseDurationMs: null,
    codebaseResearch: false,
    model: "claude-opus-4-5",
    baseDescription: "",
    targetTicketKey: null,
    targetTicketTitle: null,
    splitModeVisible: false,
    needsTitle: false,
    onDraftChange: vi.fn(),
    onTitleChange: vi.fn(),
    onTargetDraftChange: vi.fn(),
    onTargetTitleChange: vi.fn(),
    onSend: vi.fn().mockResolvedValue(true),
    onRetry: vi.fn().mockResolvedValue(true),
    onClearFailed: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn().mockResolvedValue(undefined),
    onCreateLink: vi.fn().mockResolvedValue(undefined),
    linkedIssueKeys: new Set(),
    onApplyEpic: vi.fn().mockResolvedValue(undefined),
    currentEpicKey: null,
    onLinkCandidate: vi.fn().mockResolvedValue(undefined),
    onAcceptDraft: vi.fn().mockResolvedValue(undefined),
    onDismissDraft: vi.fn(),
    onTypeChange: vi.fn().mockResolvedValue(undefined),
    onCodebaseResearchChange: vi.fn(),
    onModelChange: vi.fn(),
    onAssigneeChange: vi.fn().mockResolvedValue(undefined),
    onSprintChange: vi.fn().mockResolvedValue(undefined),
    onStoryPointsChange: vi.fn().mockResolvedValue(undefined),
    onBusinessValueChange: vi.fn().mockResolvedValue(undefined),
    onLabelsChange: vi.fn().mockResolvedValue(undefined),
    onFlagChange: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("WriterContext", () => {
  it("wraps children and provides value via useWriterContext", () => {
    const value = makeWriterValue({ ticketKey: "VPL-42" });
    let captured: WriterContextValue | null = null;

    render(
      <WriterProvider value={value}>
        <TestConsumer onValue={(v) => { captured = v; }} />
      </WriterProvider>,
    );

    expect(captured).not.toBeNull();
    expect(captured!.ticketKey).toBe("VPL-42");
  });

  it("exposes all provided fields unchanged", () => {
    const msgs = [{ id: "m1", role: "user" as const, content: "hello", status: "sent" as const, createdAt: new Date().toISOString() }];
    const value = makeWriterValue({ messages: msgs, status: "streaming", model: "claude-3-5-sonnet-latest" });
    let captured: WriterContextValue | null = null;

    render(
      <WriterProvider value={value}>
        <TestConsumer onValue={(v) => { captured = v; }} />
      </WriterProvider>,
    );

    expect(captured!.messages).toBe(msgs);
    expect(captured!.status).toBe("streaming");
    expect(captured!.model).toBe("claude-3-5-sonnet-latest");
  });

  it("useWriterContext throws when used outside WriterProvider", () => {
    expect(() => {
      render(<TestConsumer onValue={() => {}} />);
    }).toThrow("useWriterContext must be used inside WriterProvider");
  });

  it("renders children inside the provider", () => {
    const value = makeWriterValue();
    const { getByText } = render(
      <WriterProvider value={value}>
        <span>child content</span>
      </WriterProvider>,
    );
    expect(getByText("child content")).toBeInTheDocument();
  });
});
