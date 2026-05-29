import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiffPane, type RightVersion, type DiffViewMode } from "./DiffPane";

vi.mock("@/components/story-diff/StoryDiff", () => ({
  StoryDiff: ({
    oldText,
    newText,
    onResultChange,
    onHunkStatesChange,
    onStatsComputed,
  }: {
    oldText: string;
    newText: string;
    onResultChange: (text: string) => void;
    onHunkStatesChange: (s: Record<number, unknown>) => void;
    onStatsComputed: (s: { changeHunkCount: number; decidedCount: number }) => void;
  }) => (
    <div
      data-testid="story-diff"
      data-old={oldText}
      data-new={newText}
      onClick={() => {
        onResultChange("accepted text");
        onHunkStatesChange({ 0: "accept" });
        onStatsComputed({ changeHunkCount: 2, decidedCount: 0 });
      }}
    />
  ),
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => <span data-testid="rendered-markdown">{text}</span>,
}));

vi.mock("@/components/shared/VersionPicker", () => ({
  VersionPicker: ({
    options,
    selectedId,
    onSelect,
  }: {
    options: RightVersion[];
    selectedId: string;
    onSelect: (id: string) => void;
  }) => (
    <select
      data-testid="version-picker"
      value={selectedId}
      onChange={(e) => onSelect(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

function makeVersion(overrides: Partial<RightVersion> = {}): RightVersion {
  return {
    id: "v1",
    label: "Version 1",
    content: "Some content",
    tag: "current",
    ...overrides,
  };
}

function makeDefaultProps(overrides = {}) {
  const versions = [makeVersion({ id: "v1", label: "Version 1", content: "Version content" })];
  return {
    baseSnapshot: "base content",
    rightVersions: versions,
    diffNewId: "v1",
    diffViewMode: "plain" as DiffViewMode,
    hunkStates: {},
    selectedDraftIdx: 0,
    totalDrafts: 0,
    snapshotKey: 0,
    onDiffNewIdChange: vi.fn(),
    onDiffViewModeChange: vi.fn(),
    onHunkStatesChange: vi.fn(),
    onResultChange: vi.fn(),
    onNavigateDraft: vi.fn(),
    onDismissDraft: vi.fn(),
    showHeader: true,
    ...overrides,
  };
}

describe("DiffPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with the version picker in header", () => {
    render(<DiffPane {...makeDefaultProps()} />);

    expect(screen.getByTestId("version-picker")).toBeInTheDocument();
  });

  it("hides header when showHeader is false", () => {
    render(<DiffPane {...makeDefaultProps({ showHeader: false })} />);

    expect(screen.queryByTestId("version-picker")).not.toBeInTheDocument();
  });

  it("shows rendered markdown in plain view mode", () => {
    render(<DiffPane {...makeDefaultProps({ diffViewMode: "plain" })} />);

    expect(screen.getByTestId("rendered-markdown")).toBeInTheDocument();
    expect(screen.getByTestId("rendered-markdown")).toHaveTextContent("Version content");
  });

  it("shows StoryDiff in diff view mode", () => {
    render(<DiffPane {...makeDefaultProps({ diffViewMode: "diff" })} />);

    expect(screen.getByTestId("story-diff")).toBeInTheDocument();
  });

  it("shows 'No versions to compare' when rightVersions is empty and no selection", () => {
    render(
      <DiffPane
        {...makeDefaultProps({
          rightVersions: [],
          diffNewId: "",
        })}
      />
    );

    expect(screen.getByText("No versions to compare")).toBeInTheDocument();
  });

  it("calls onDiffViewModeChange when toggling diff/preview mode", () => {
    const onDiffViewModeChange = vi.fn();
    render(
      <DiffPane {...makeDefaultProps({ diffViewMode: "plain", onDiffViewModeChange })} />
    );

    fireEvent.click(screen.getByText("Diff"));

    expect(onDiffViewModeChange).toHaveBeenCalledWith("diff");
  });

  it("calls onDiffViewModeChange back to plain when in diff mode", () => {
    const onDiffViewModeChange = vi.fn();
    render(
      <DiffPane {...makeDefaultProps({ diffViewMode: "diff", onDiffViewModeChange })} />
    );

    fireEvent.click(screen.getByText("Preview"));

    expect(onDiffViewModeChange).toHaveBeenCalledWith("plain");
  });

  it("shows AI draft navigation bar for AI draft versions", () => {
    const aiDraftVersion = makeVersion({
      id: "ai-d1",
      label: "AI Draft 1",
      isDraft: true,
      draftDbId: "d1",
    });
    render(
      <DiffPane
        {...makeDefaultProps({
          rightVersions: [aiDraftVersion],
          diffNewId: "ai-d1",
          selectedDraftIdx: 0,
          totalDrafts: 2,
        })}
      />
    );

    expect(screen.getByText("AI Draft 1 of 2")).toBeInTheDocument();
  });

  it("calls onNavigateDraft when navigating between AI drafts", () => {
    const onNavigateDraft = vi.fn();
    const aiDraftVersion = makeVersion({
      id: "ai-d1",
      label: "AI Draft 1",
      isDraft: true,
      draftDbId: "d1",
    });
    render(
      <DiffPane
        {...makeDefaultProps({
          rightVersions: [aiDraftVersion],
          diffNewId: "ai-d1",
          selectedDraftIdx: 0,
          totalDrafts: 3,
          onNavigateDraft,
        })}
      />
    );

    // Find the right chevron button (next)
    const buttons = screen.getAllByRole("button");
    // The right chevron should be enabled since idx=0 and total=3
    const rightChevron = buttons.find((b) => !(b as HTMLButtonElement).disabled && b.textContent === "");
    if (rightChevron) fireEvent.click(rightChevron);

    expect(onNavigateDraft).toHaveBeenCalledWith(1);
  });

  it("calls onDismissDraft when dismiss button is clicked", () => {
    const onDismissDraft = vi.fn();
    const aiDraftVersion = makeVersion({
      id: "ai-d1",
      label: "AI Draft 1",
      isDraft: true,
      draftDbId: "d1-db",
    });
    render(
      <DiffPane
        {...makeDefaultProps({
          rightVersions: [aiDraftVersion],
          diffNewId: "ai-d1",
          selectedDraftIdx: 0,
          totalDrafts: 1,
          onDismissDraft,
        })}
      />
    );

    fireEvent.click(screen.getByText("Dismiss"));

    expect(onDismissDraft).toHaveBeenCalledWith("d1-db");
  });

  it("shows 'Accept N remaining' button when there are pending hunks", () => {
    const aiDraftVersion = makeVersion({
      id: "ai-d1",
      label: "AI Draft 1",
      isDraft: true,
      draftDbId: "d1",
    });
    const props = makeDefaultProps({
      rightVersions: [aiDraftVersion],
      diffNewId: "ai-d1",
      selectedDraftIdx: 0,
      totalDrafts: 1,
      diffViewMode: "diff" as DiffViewMode,
    });
    render(<DiffPane {...props} />);

    // Trigger stats computation via the mock StoryDiff
    fireEvent.click(screen.getByTestId("story-diff"));

    expect(screen.getByText("Accept 2 remaining")).toBeInTheDocument();
  });

  it("calls onDiffNewIdChange when version picker changes", () => {
    const onDiffNewIdChange = vi.fn();
    const versions = [
      makeVersion({ id: "v1", label: "Version 1" }),
      makeVersion({ id: "v2", label: "Version 2" }),
    ];
    render(
      <DiffPane
        {...makeDefaultProps({
          rightVersions: versions,
          diffNewId: "v1",
          onDiffNewIdChange,
        })}
      />
    );

    fireEvent.change(screen.getByTestId("version-picker"), { target: { value: "v2" } });

    expect(onDiffNewIdChange).toHaveBeenCalledWith("v2");
  });
});
