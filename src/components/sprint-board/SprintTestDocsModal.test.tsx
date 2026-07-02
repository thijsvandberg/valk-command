import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SprintTestDocs } from "@/lib/api-client";

let mockData: SprintTestDocs | undefined;
let mockError: Error | undefined;
vi.mock("swr", () => ({
  default: () => ({ data: mockData, error: mockError }),
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => [text],
}));

import { SprintTestDocsModal, buildTestDocDocument } from "./SprintTestDocsModal";

const BASE: SprintTestDocs = {
  sprintName: "BT: 139",
  documented: [
    { key: "VPL-2", title: "Big story", status: "DONE", storyPoints: 8, doc: "**Big feature**\n\n- Confirm A" },
    { key: "VPL-1", title: "Flagged story", status: "TEST", storyPoints: 3, doc: "**Flagged**\n\n- Confirm B", needsInput: true },
  ],
  internal: [
    { key: "VPL-3", title: "Sync groundwork", status: "DONE", storyPoints: null, doc: "Internal: sync groundwork" },
  ],
  missing: [
    { key: "VPL-4", title: "Missing one", status: "DONE", storyPoints: 5, doc: null },
    { key: "VPL-5", title: "Missing two", status: "TEST", storyPoints: null, doc: null },
  ],
  other: [{ key: "VPL-6", title: "Still open", status: "IN PROGRESS", storyPoints: null, doc: null }],
};

function renderModal(overrides: Partial<Parameters<typeof SprintTestDocsModal>[0]> = {}) {
  const props = {
    sprintId: "6361",
    onClose: vi.fn(),
    onGenerateMissing: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
  render(<SprintTestDocsModal {...props} />);
  return props;
}

describe("buildTestDocDocument", () => {
  it("joins documented blocks and appends internal under a Misc header, no keys", () => {
    const doc = buildTestDocDocument(BASE);
    expect(doc).toBe(
      "**Big feature**\n\n- Confirm A\n\n**Flagged**\n\n- Confirm B\n\n**Misc**\n\nInternal: sync groundwork",
    );
    expect(doc).not.toContain("VPL-");
  });

  it("omits the Misc section when there are no internal docs", () => {
    const doc = buildTestDocDocument({ ...BASE, internal: [] });
    expect(doc).not.toContain("**Misc**");
  });
});

describe("SprintTestDocsModal (BRDG-461)", () => {
  beforeEach(() => {
    mockData = BASE;
    mockError = undefined;
  });

  it("renders sprint name, documented blocks in order, Misc tail and missing list", () => {
    renderModal();
    expect(screen.getByText("BT: 139")).toBeInTheDocument();

    const blocks = screen.getAllByTestId("test-docs-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("Big feature");
    expect(blocks[1]).toHaveTextContent("Flagged");
    expect(blocks[1]).toHaveTextContent("needs input");

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
    expect(writeText).toHaveBeenCalledWith(buildTestDocDocument(BASE));
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

  it("shows an error state when the fetch fails", () => {
    mockData = undefined;
    mockError = new Error("boom");
    renderModal();
    expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
  });
});
