import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelatedSuggestions } from "./RelatedIssueSuggestions";
import type { RelatedSuggestion } from "./RelatedIssueSuggestions";

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: ({ type }: { type: string }) => <span data-testid={`icon-${type}`} />,
}));

function makeSuggestion(overrides: Partial<RelatedSuggestion> = {}): RelatedSuggestion {
  return {
    id: "s-1",
    key: "VPL-100",
    title: "Related ticket",
    type: "story",
    relevance: 0.8,
    suggestedRelation: "relates to",
    reason: null,
    ...overrides,
  };
}

function renderComponent(props: Partial<React.ComponentProps<typeof RelatedSuggestions>> = {}) {
  const onToggleExpanded = vi.fn();
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  const onDeclineAll = vi.fn();
  const onRegenerate = vi.fn();

  const result = render(
    <RelatedSuggestions
      suggestions={props.suggestions ?? []}
      isLoading={props.isLoading ?? false}
      progressText={props.progressText ?? null}
      error={props.error ?? null}
      linkingKeys={props.linkingKeys ?? new Set()}
      isExpanded={props.isExpanded ?? true}
      onToggleExpanded={props.onToggleExpanded ?? onToggleExpanded}
      onAccept={props.onAccept ?? onAccept}
      onDecline={props.onDecline ?? onDecline}
      onDeclineAll={props.onDeclineAll ?? onDeclineAll}
      onRegenerate={props.onRegenerate ?? onRegenerate}
    />,
  );

  return { ...result, onToggleExpanded, onAccept, onDecline, onDeclineAll, onRegenerate };
}

describe("RelatedSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when not loading, no error, and no suggestions", () => {
    const { container } = renderComponent({ suggestions: [], isLoading: false, error: null });
    expect(container.firstChild).toBeNull();
  });

  it("renders when loading", () => {
    renderComponent({ isLoading: true, suggestions: [] });
    expect(screen.getByText("AI Suggestions")).toBeInTheDocument();
  });

  it("renders when there is an error", () => {
    renderComponent({ error: "Something went wrong", suggestions: [] });
    expect(screen.getByText("AI Suggestions")).toBeInTheDocument();
  });

  it("renders when suggestions exist", () => {
    renderComponent({ suggestions: [makeSuggestion()] });
    expect(screen.getByText("AI Suggestions")).toBeInTheDocument();
  });

  it("shows suggestion count badge", () => {
    const suggestions = [makeSuggestion({ id: "1", key: "VPL-1" }), makeSuggestion({ id: "2", key: "VPL-2" })];
    renderComponent({ suggestions, isLoading: false });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("calls onToggleExpanded when header is clicked", () => {
    const { onToggleExpanded } = renderComponent({ suggestions: [makeSuggestion()] });
    fireEvent.click(screen.getByText("AI Suggestions"));
    expect(onToggleExpanded).toHaveBeenCalled();
  });

  it("renders suggestion key and title when expanded", () => {
    renderComponent({
      suggestions: [makeSuggestion({ key: "VPL-42", title: "A related issue" })],
      isExpanded: true,
    });
    expect(screen.getByText("VPL-42")).toBeInTheDocument();
    expect(screen.getByText("A related issue")).toBeInTheDocument();
  });

  it("does not render suggestion list when collapsed", () => {
    renderComponent({
      suggestions: [makeSuggestion({ key: "VPL-42", title: "A related issue" })],
      isExpanded: false,
    });
    expect(screen.queryByText("A related issue")).not.toBeInTheDocument();
  });

  it("calls onAccept with the correct suggestion", () => {
    const suggestion = makeSuggestion({ key: "VPL-42", title: "Accept this" });
    const { onAccept } = renderComponent({ suggestions: [suggestion], isExpanded: true });
    fireEvent.click(screen.getByRole("button", { name: /Accept and link VPL-42/ }));
    expect(onAccept).toHaveBeenCalledWith(suggestion);
  });

  it("calls onDecline with the correct suggestion", () => {
    const suggestion = makeSuggestion({ key: "VPL-42", title: "Decline this" });
    const { onDecline } = renderComponent({ suggestions: [suggestion], isExpanded: true });
    fireEvent.click(screen.getByRole("button", { name: /Decline VPL-42/ }));
    expect(onDecline).toHaveBeenCalledWith(suggestion);
  });

  it("shows 'Decline all' button when 2+ suggestions exist", () => {
    const suggestions = [
      makeSuggestion({ id: "1", key: "VPL-1" }),
      makeSuggestion({ id: "2", key: "VPL-2" }),
    ];
    renderComponent({ suggestions, isExpanded: true, isLoading: false });
    expect(screen.getByText("Decline all")).toBeInTheDocument();
  });

  it("does not show 'Decline all' button with one suggestion", () => {
    renderComponent({ suggestions: [makeSuggestion()], isExpanded: true });
    expect(screen.queryByText("Decline all")).not.toBeInTheDocument();
  });

  it("calls onDeclineAll when 'Decline all' is clicked", () => {
    const suggestions = [
      makeSuggestion({ id: "1", key: "VPL-1" }),
      makeSuggestion({ id: "2", key: "VPL-2" }),
    ];
    const { onDeclineAll } = renderComponent({ suggestions, isExpanded: true, isLoading: false });
    fireEvent.click(screen.getByText("Decline all"));
    expect(onDeclineAll).toHaveBeenCalled();
  });

  it("calls onRegenerate when 'Regenerate' is clicked", () => {
    const { onRegenerate } = renderComponent({ suggestions: [makeSuggestion()], isExpanded: true });
    fireEvent.click(screen.getByText("Regenerate"));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it("shows loading text when isLoading and expanded", () => {
    renderComponent({ isLoading: true, suggestions: [], isExpanded: true, progressText: "Searching..." });
    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });

  it("shows default loading text when no progressText", () => {
    renderComponent({ isLoading: true, suggestions: [], isExpanded: true, progressText: null });
    expect(screen.getByText("Searching for related issues...")).toBeInTheDocument();
  });

  it("shows error text when error and expanded", () => {
    renderComponent({ error: "Failed to load", suggestions: [], isExpanded: true });
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
  });

  it("shows relevance percentage", () => {
    renderComponent({ suggestions: [makeSuggestion({ relevance: 0.85 })], isExpanded: true });
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("shows suggested relation label", () => {
    renderComponent({ suggestions: [makeSuggestion({ suggestedRelation: "blocks" })], isExpanded: true });
    expect(screen.getByText("blocks")).toBeInTheDocument();
  });

  it("shows loading spinner for suggestions being linked", () => {
    const suggestions = [makeSuggestion({ key: "VPL-42" })];
    renderComponent({ suggestions, isExpanded: true, linkingKeys: new Set(["VPL-42"]) });
    // Accept/decline buttons should not be present for linking item
    expect(screen.queryByRole("button", { name: /Accept and link VPL-42/ })).not.toBeInTheDocument();
  });
});
