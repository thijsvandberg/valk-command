import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReactNode } from "react";
import { tickets as ticketsApi, type SprintTestDocs } from "@/lib/api-client";

let mockData: SprintTestDocs | undefined;
let mockError: Error | undefined;
vi.mock("swr", () => ({
  default: () => ({ data: mockData, error: mockError }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, jiraStatus }: { ticketKey: string; jiraStatus: string }) => (
    <span data-testid="ticket-pill">{ticketKey} {jiraStatus}</span>
  ),
}));

vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="ticket-pill">{ticketKey}</span>,
}));

vi.mock("@/components/shared/IssueMetaBadges", () => ({
  EpicBadge: ({ epic }: { epic: string }) => <span data-testid="epic-badge">{epic}</span>,
}));

// Render the overflow menu's contents inline when open, so the portalled +
// floating-ui-positioned panel doesn't need a real layout in jsdom.
vi.mock("@/components/shared/AnchoredPanel", () => ({
  AnchoredPanel: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <>{children}</> : null,
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => [text],
}));

// ticket-cache pulls in swr-scoped-mutate, whose top-level swr import the "swr"
// mock above does not provide.
vi.mock("@/lib/ticket-cache", () => ({
  patchTicketDetailCache: vi.fn(),
}));

import { SprintTestDocsModal, buildTestDocDocument } from "./SprintTestDocsModal";
import { __getPendingEdits, __resetPendingEdits, hasPendingEdit } from "./pendingTicketEdits";

const BASE: SprintTestDocs = {
  sprintName: "BT: 139",
  documented: [
    { key: "VPL-2", type: "story", title: "Big story", status: "DONE", storyPoints: 8, epic: "Payments", doc: "**Big feature**\n\n- Confirm A" },
    { key: "VPL-1", type: "story", title: "Flagged story", status: "TEST", storyPoints: 3, epic: null, doc: "**Flagged**\n\n- Confirm B", needsInput: true },
  ],
  internal: [
    { key: "VPL-3", type: "story", title: "Sync groundwork", status: "DONE", storyPoints: null, epic: null, doc: "Internal: sync groundwork" },
  ],
  notNeeded: [
    { key: "VPL-7", type: "story", title: "DB partitions chore", status: "DONE", storyPoints: null, epic: null, doc: null },
  ],
  missing: [
    { key: "VPL-4", type: "story", title: "Missing one", status: "DONE", storyPoints: 5, epic: "Payments", doc: null },
    { key: "VPL-5", type: "story", title: "Missing two", status: "TEST", storyPoints: null, epic: null, doc: null, hasDraft: true },
  ],
  other: [{ key: "VPL-6", type: "story", title: "Still open", status: "IN PROGRESS", storyPoints: null, epic: null, doc: null }],
};

function renderModal(overrides: Partial<Parameters<typeof SprintTestDocsModal>[0]> = {}) {
  const props = {
    sprintId: "6361",
    onClose: vi.fn(),
    onGenerateMissing: vi.fn(),
    onEditItem: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
  render(<SprintTestDocsModal {...props} />);
  return props;
}

describe("buildTestDocDocument", () => {
  it("joins documented blocks with Jira key links behind titles, Misc trailing", () => {
    const doc = buildTestDocDocument(BASE.documented, BASE.internal);
    expect(doc).toBe(
      "**Big feature** ([VPL-2](https://new-story.atlassian.net/browse/VPL-2))\n\n- Confirm A\n\n" +
      "**Flagged** ([VPL-1](https://new-story.atlassian.net/browse/VPL-1))\n\n- Confirm B\n\n" +
      "**Misc**\n\nInternal: sync groundwork ([VPL-3](https://new-story.atlassian.net/browse/VPL-3))",
    );
  });

  it("omits the Misc section when there are no internal docs", () => {
    const doc = buildTestDocDocument(BASE.documented, []);
    expect(doc).not.toContain("**Misc**");
  });

  it("includes docs passed in and omits ones left out (opt-in unfinished docs)", () => {
    const unfinished = {
      key: "VPL-8", type: "story", title: "Open", status: "IN PROGRESS",
      storyPoints: null, epic: null, doc: "**Open feature**\n\n- Confirm C",
    };
    expect(buildTestDocDocument([...BASE.documented, unfinished], BASE.internal)).toContain("Open feature");
    expect(buildTestDocDocument(BASE.documented, BASE.internal)).not.toContain("Open feature");
  });
});

describe("SprintTestDocsModal (BRDG-461)", () => {
  beforeEach(() => {
    mockData = BASE;
    mockError = undefined;
    __resetPendingEdits();
  });

  it("renders sprint name, documented blocks in order, Misc tail and missing list", () => {
    renderModal();
    expect(screen.getByText("BT: 139")).toBeInTheDocument();

    const blocks = screen.getAllByTestId("test-docs-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("Big feature");
    expect(blocks[1]).toHaveTextContent("Flagged");
    expect(blocks[1]).toHaveTextContent("needs input");
    // The block title now carries the regular ticket pill (icon + key + status), not a plain link.
    expect(within(blocks[0]).getByTestId("ticket-pill")).toHaveTextContent("VPL-2");

    expect(screen.getByTestId("test-docs-misc")).toHaveTextContent("Internal: sync groundwork");
    const missing = screen.getByTestId("test-docs-missing");
    expect(missing).toHaveTextContent("2 finished stories miss test documentation");
    expect(missing).toHaveTextContent("VPL-4");
    expect(missing).toHaveTextContent("VPL-5");
  });

  it("Generate missing fires with exactly the missing keys", () => {
    const props = renderModal();
    fireEvent.click(screen.getByText("Generate missing (2)"));
    expect(props.onGenerateMissing).toHaveBeenCalledWith(["VPL-4", "VPL-5"]);
  });

  it("Copy document writes the built markdown to the clipboard and toasts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const props = renderModal();
    fireEvent.click(screen.getByText("Copy document"));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Test document copied to clipboard"));
    expect(writeText).toHaveBeenCalledWith(buildTestDocDocument(BASE.documented, BASE.internal));
  });

  it("shows the empty state and disables Copy when nothing is documented", () => {
    mockData = { ...BASE, documented: [], internal: [], missing: [] };
    renderModal();
    expect(screen.getByText(/No test documentation saved/)).toBeInTheDocument();
    expect(screen.getByText("Copy document").closest("button")).toBeDisabled();
  });

  it("hides the missing section when nothing is missing", () => {
    mockData = { ...BASE, missing: [] };
    renderModal();
    expect(screen.queryByTestId("test-docs-missing")).not.toBeInTheDocument();
  });

  it("lists not-needed tickets separately, outside the copy and the missing list", () => {
    renderModal();
    const section = screen.getByTestId("test-docs-not-needed");
    expect(section).toHaveTextContent("No test documentation needed (1)");
    expect(section).toHaveTextContent("VPL-7");
    expect(buildTestDocDocument(BASE.documented, BASE.internal)).not.toContain("DB partitions chore");
    expect(screen.getByTestId("test-docs-missing")).not.toHaveTextContent("VPL-7");
  });

  it("not-needed rows offer Open into the review popup, but no Generate/Skip", () => {
    const props = renderModal();
    const section = screen.getByTestId("test-docs-not-needed");
    const row = within(section).getByText("VPL-7 DONE").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByText("Open"));
    expect(props.onEditItem).toHaveBeenCalledWith("VPL-7");
    expect(within(section).queryByText("Generate")).not.toBeInTheDocument();
    expect(within(section).queryByText("Skip")).not.toBeInTheDocument();
  });

  it("plain lists render regular ticket rows: pill + title + epic", () => {
    renderModal();
    const missing = screen.getByTestId("test-docs-missing");
    // The board-style pill carries key + status.
    expect(within(missing).getAllByTestId("ticket-pill").map((p) => p.textContent)).toEqual(["VPL-4 DONE", "VPL-5 TEST"]);
    expect(within(missing).getByTestId("epic-badge")).toHaveTextContent("Payments");
    expect(within(screen.getByTestId("test-docs-not-needed")).getAllByTestId("ticket-pill")).toHaveLength(1);
    expect(within(screen.getByTestId("test-docs-other")).getAllByTestId("ticket-pill")).toHaveLength(1);
  });

  it("collapses every missing-row action behind the overflow menu, with no draft-ready badge (BRDG-472)", () => {
    const props = renderModal();
    const missing = screen.getByTestId("test-docs-missing");
    // The draft-ready badge is gone; an unreviewed draft now shows as Regenerate.
    expect(within(missing).queryByText("draft ready")).not.toBeInTheDocument();
    const row = within(missing).getByText("VPL-5 TEST").closest("li") as HTMLElement;
    // Nothing inline: Open and the generate action both live behind the "...".
    expect(within(row).queryByText("Open")).not.toBeInTheDocument();
    expect(within(row).queryByText("Regenerate")).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "More actions for VPL-5" }));
    // No saved doc yet, so the open action reads "Open".
    fireEvent.click(within(row).getByText("Open"));
    expect(props.onEditItem).toHaveBeenCalledWith("VPL-5");
    // VPL-5 carries an unreviewed draft, so Generate reads "Regenerate".
    fireEvent.click(within(row).getByRole("button", { name: "More actions for VPL-5" }));
    fireEvent.click(within(row).getByText("Regenerate"));
    expect(props.onGenerateMissing).toHaveBeenCalledWith(["VPL-5"]);
  });

  it("labels the menu's open action Edit when a doc exists and Open when it does not, and Generate vs Regenerate to match", () => {
    mockData = {
      ...BASE,
      other: [
        { key: "VPL-6", type: "story", title: "Still open", status: "IN PROGRESS", storyPoints: null, epic: null, doc: null },
        { key: "VPL-8", type: "story", title: "Open with doc", status: "IN PROGRESS", storyPoints: null, epic: null, doc: "**Open feature**\n\n- Confirm C", internalDoc: false },
      ],
    };
    renderModal();
    const section = screen.getByTestId("test-docs-other");
    const openRow = within(section).getByText("VPL-6 IN PROGRESS").closest("li") as HTMLElement;
    const editRow = within(section).getByText("VPL-8 IN PROGRESS").closest("li") as HTMLElement;

    fireEvent.click(within(openRow).getByRole("button", { name: "More actions for VPL-6" }));
    expect(within(openRow).getByText("Open")).toBeInTheDocument();
    expect(within(openRow).queryByText("Edit")).not.toBeInTheDocument();
    // No doc and no draft, so the generate action reads "Generate".
    expect(within(openRow).getByText("Generate")).toBeInTheDocument();

    fireEvent.click(within(editRow).getByRole("button", { name: "More actions for VPL-8" }));
    expect(within(editRow).getByText("Edit")).toBeInTheDocument();
    expect(within(editRow).queryByText("Open")).not.toBeInTheDocument();
    // A saved doc turns the generate action into "Regenerate".
    expect(within(editRow).getByText("Regenerate")).toBeInTheDocument();
  });

  it("Skip marks a missing story as no test documentation needed and refreshes", async () => {
    const spy = vi
      .spyOn(ticketsApi, "markTestDocNotNeeded")
      .mockResolvedValue({ saved: true, notNeeded: true } as never);
    const props = renderModal();
    const missing = screen.getByTestId("test-docs-missing");
    const row = within(missing).getByText("VPL-4 DONE").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "More actions for VPL-4" }));
    fireEvent.click(within(row).getByText("Skip"));
    // The board-row marker flips through the pending-edits overlay so a stale
    // list refetch cannot show the old state; the write's success confirms it.
    expect(hasPendingEdit("VPL-4", "testDocState")).toBe(true);
    await waitFor(() => expect(spy).toHaveBeenCalledWith("VPL-4"));
    await waitFor(() =>
      expect(props.showToast).toHaveBeenCalledWith("VPL-4 marked as no test documentation needed"),
    );
    const edit = [...__getPendingEdits().values()].find(
      (e) => e.key === "VPL-4" && e.field === "testDocState",
    );
    expect(edit).toMatchObject({ value: "not_needed", confirmed: true });
    spy.mockRestore();
  });

  it("a failed Skip clears the overlay so the marker falls back to server data", async () => {
    const spy = vi
      .spyOn(ticketsApi, "markTestDocNotNeeded")
      .mockRejectedValue(new Error("boom"));
    const props = renderModal();
    const missing = screen.getByTestId("test-docs-missing");
    const row = within(missing).getByText("VPL-4 DONE").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "More actions for VPL-4" }));
    fireEvent.click(within(row).getByText("Skip"));
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Could not skip VPL-4"));
    expect(hasPendingEdit("VPL-4", "testDocState")).toBe(false);
    spy.mockRestore();
  });

  it("per-block Edit jumps into the single-story review", () => {
    const props = renderModal();
    const blocks = screen.getAllByTestId("test-docs-block");
    fireEvent.click(within(blocks[0]).getByText("Edit"));
    expect(props.onEditItem).toHaveBeenCalledWith("VPL-2");

    fireEvent.click(within(screen.getByTestId("test-docs-misc")).getByText("Edit"));
    expect(props.onEditItem).toHaveBeenCalledWith("VPL-3");
  });

  it("offers per-row Generate (via the overflow menu) on unfinished tickets so the PO decides what ships", () => {
    const props = renderModal();
    const section = screen.getByTestId("test-docs-other");
    expect(section).toHaveTextContent("VPL-6");
    fireEvent.click(within(section).getByRole("button", { name: "More actions for VPL-6" }));
    fireEvent.click(within(section).getByText("Generate"));
    expect(props.onGenerateMissing).toHaveBeenCalledWith(["VPL-6"]);
  });

  it("shows an include checkbox only on unfinished rows that already have a doc (BRDG-465)", () => {
    mockData = {
      ...BASE,
      other: [
        { key: "VPL-6", type: "story", title: "Still open", status: "IN PROGRESS", storyPoints: null, epic: null, doc: null },
        { key: "VPL-8", type: "story", title: "Open with doc", status: "IN PROGRESS", storyPoints: null, epic: null, doc: "**Open feature**\n\n- Confirm C", internalDoc: false },
      ],
    };
    renderModal();
    const section = screen.getByTestId("test-docs-other");
    const checkboxes = within(section).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]).toHaveAttribute("aria-label", "Include VPL-8 in the document");
  });

  it("ticking an unfinished doc folds it into the Documented preview and the copy; unticking removes both (BRDG-465)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockData = {
      ...BASE,
      other: [
        { key: "VPL-8", type: "story", title: "Open with doc", status: "IN PROGRESS", storyPoints: null, epic: null, doc: "**Open feature**\n\n- Confirm C", internalDoc: false },
      ],
    };
    renderModal();

    // Excluded by default: 2 auto blocks, not in the copy.
    expect(screen.getAllByTestId("test-docs-block")).toHaveLength(2);
    fireEvent.click(screen.getByText("Copy document"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).not.toContain("Open feature");

    // Tick: a provisional block appears (tagged) and joins the copy.
    fireEvent.click(within(screen.getByTestId("test-docs-other")).getByRole("checkbox"));
    const blocks = screen.getAllByTestId("test-docs-block");
    expect(blocks).toHaveLength(3);
    const provisional = blocks.find((b) => b.textContent?.includes("Open feature")) as HTMLElement;
    expect(provisional).toHaveTextContent("not finished yet");
    writeText.mockClear();
    fireEvent.click(screen.getByText("Copy document"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("Open feature");

    // Untick: gone from preview and copy again.
    fireEvent.click(within(screen.getByTestId("test-docs-other")).getByRole("checkbox"));
    expect(screen.getAllByTestId("test-docs-block")).toHaveLength(2);
    writeText.mockClear();
    fireEvent.click(screen.getByText("Copy document"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).not.toContain("Open feature");
  });

  it("routes a ticked internal unfinished doc into the Misc section (BRDG-465)", () => {
    mockData = {
      ...BASE,
      other: [
        { key: "VPL-9", type: "story", title: "Open internal", status: "TODO", storyPoints: null, epic: null, doc: "Internal open one-liner", internalDoc: true },
      ],
    };
    renderModal();
    fireEvent.click(within(screen.getByTestId("test-docs-other")).getByRole("checkbox"));
    expect(screen.getByTestId("test-docs-misc")).toHaveTextContent("Internal open one-liner");
  });

  it("shows an error state when the fetch fails", () => {
    mockData = undefined;
    mockError = new Error("boom");
    renderModal();
    expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
  });
});
