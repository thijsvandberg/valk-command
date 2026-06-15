import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketHistory } from "./TicketHistory";
import type { Ticket } from "@/types/ticket";

const mockApiFetch = vi.fn();
const mockGetLocalEdits = vi.fn();
const mockSaveLocalEdit = vi.fn();
const mockPushToJira = vi.fn();
const mockImportVersion = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  tickets: {
    getLocalEdits: (...args: unknown[]) => mockGetLocalEdits(...args),
    saveLocalEdit: (...args: unknown[]) => mockSaveLocalEdit(...args),
    pushToJira: (...args: unknown[]) => mockPushToJira(...args),
    importVersion: (...args: unknown[]) => mockImportVersion(...args),
  },
}));

vi.mock("@/components/shared/SectionHeader", () => ({
  SectionHeader: ({ title, count }: { title: string; count?: number }) => (
    <div data-testid="section-header">
      {title}{count !== undefined ? ` (${count})` : ""}
    </div>
  ),
}));

vi.mock("./VersionList", () => ({
  VersionList: ({
    sorted,
    onVersionClick,
  }: {
    sorted: Array<{ versionNumber: number; updatedBy: string; date: string; label?: string }>;
    onVersionClick: (versionNumber: number) => void;
    onPreviewClick: (versionNumber: number) => void;
    isDraftOutdated: boolean;
    oldOptions: unknown[];
    newOptions: unknown[];
    compareOld: number | null;
    compareNew: number | null;
    importing: boolean;
    importResult: unknown;
    onOldChange: (v: number) => void;
    onNewChange: (v: number) => void;
    onImportHistory: () => void;
  }) => (
    <div data-testid="version-list">
      {sorted.map((v) => (
        <button
          key={v.versionNumber}
          data-testid={`version-${v.versionNumber}`}
          onClick={() => onVersionClick(v.versionNumber)}
        >
          v{v.versionNumber} - {v.updatedBy}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./VersionPreview", () => ({
  VersionPreview: () => <div data-testid="version-preview" />,
}));

// DiffViewer is dynamically imported — mock next/dynamic to return a stub
vi.mock("next/dynamic", () => ({
  default: () => {
    const DiffViewerStub = () => <div data-testid="diff-viewer" />;
    return DiffViewerStub;
  },
}));

vi.mock("./version-utils", () => ({
  parseVersionDate: (date: string) => new Date(date).getTime(),
  parseRawVersionData: (data: Array<Record<string, unknown>>) =>
    data.map((d, i) => ({
      id: d.id as string,
      versionNumber: i + 1,
      date: (d.date as string) || new Date().toISOString(),
      contentHash: (d.contentHash as string) || `hash-${i}`,
      content: (d.description as string) || "",
      updatedBy: (d.updatedBy as string) || "User",
      updatedByAvatar: null,
      label: (d.label as string) || undefined,
    })),
  storyVersionToOption: (v: { versionNumber: number; date: string; label?: string }) => ({
    value: v.versionNumber,
    label: `v${v.versionNumber}`,
  }),
}));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    ...overrides,
  };
}

function makeVersionData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ver-${i + 1}`,
    date: new Date(Date.now() - (count - i) * 86400000).toISOString(),
    contentHash: `hash-${i + 1}`,
    description: `Version ${i + 1} content`,
    updatedBy: `User ${i + 1}`,
    label: i === count - 1 ? "current" : undefined,
  }));
}

describe("TicketHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalEdits.mockResolvedValue([]);
  });

  it("shows loading skeleton while fetching", () => {
    // Never resolves to keep loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<TicketHistory ticket={makeTicket()} />);
    // Check for animated skeleton elements
    const animatedEls = document.querySelectorAll(".animate-pulse");
    expect(animatedEls.length).toBeGreaterThan(0);
  });

  it("shows 'No version history' when no versions exist", async () => {
    mockApiFetch.mockResolvedValueOnce([]); // versions
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] }); // story writer drafts

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      expect(screen.getByText("No version history yet")).toBeInTheDocument();
    });
  });

  it("renders VersionList when versions exist", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(3));
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      expect(screen.getByTestId("version-list")).toBeInTheDocument();
    });
  });

  it("renders versions in descending order by version number", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(3));
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const versionButtons = buttons.filter((b) => b.textContent?.startsWith("v"));
      // Should be v3, v2, v1 (descending)
      expect(versionButtons[0].textContent).toContain("v3");
      expect(versionButtons[1].textContent).toContain("v2");
      expect(versionButtons[2].textContent).toContain("v1");
    });
  });

  it("calls onVersionsLoaded with count after loading", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(4));
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });

    const onVersionsLoaded = vi.fn();
    render(<TicketHistory ticket={makeTicket()} onVersionsLoaded={onVersionsLoaded} />);

    await waitFor(() => {
      expect(onVersionsLoaded).toHaveBeenCalledWith(4);
    });
  });

  it("adds a local draft version when local edits exist", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(2));
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });
    mockGetLocalEdits.mockResolvedValue([
      { field: "description", localValue: "My draft", modifiedAt: new Date().toISOString() },
    ]);

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      // Should show a "You" entry for the local draft
      expect(screen.getByText(/You/)).toBeInTheDocument();
    });
  });

  it("adds AI drafts when story writer drafts exist", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(1));
    mockApiFetch.mockResolvedValueOnce({
      aiDrafts: [
        { id: "ai-1", createdAt: new Date().toISOString(), content: "AI content", draftIndex: 0 },
      ],
    });

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      expect(screen.getByText(/AI Draft 1/)).toBeInTheDocument();
    });
  });

  it("auto-opens the conflict diff when showConflictDiff is set", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(2)); // includes a "current"
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });
    mockGetLocalEdits.mockResolvedValue([
      { field: "description", localValue: "My draft", modifiedAt: new Date().toISOString() },
    ]);

    render(<TicketHistory ticket={makeTicket()} showConflictDiff />);

    await waitFor(() => {
      expect(screen.getByTestId("diff-viewer")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("version-list")).not.toBeInTheDocument();
  });

  it("shows the version list by default (no auto-open)", async () => {
    mockApiFetch.mockResolvedValueOnce(makeVersionData(2));
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });
    mockGetLocalEdits.mockResolvedValue([
      { field: "description", localValue: "My draft", modifiedAt: new Date().toISOString() },
    ]);

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      expect(screen.getByTestId("version-list")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();
  });

  it("shows History section header", async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    mockApiFetch.mockResolvedValueOnce({ aiDrafts: [] });

    render(<TicketHistory ticket={makeTicket()} />);

    await waitFor(() => {
      expect(screen.getByTestId("section-header")).toHaveTextContent("History");
    });
  });
});
