import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateTestDoc = vi.fn();
const mockSaveTestDoc = vi.fn();
const mockGetTestDoc = vi.fn();
const mockSaveTestDocDraft = vi.fn();
const mockMarkNotNeeded = vi.fn();
const mockCancelTask = vi.fn();
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  tickets: {
    generateTestDoc: (...args: unknown[]) => mockGenerateTestDoc(...args),
    saveTestDoc: (...args: unknown[]) => mockSaveTestDoc(...args),
    getTestDoc: (...args: unknown[]) => mockGetTestDoc(...args),
    saveTestDocDraft: (...args: unknown[]) => mockSaveTestDocDraft(...args),
    markTestDocNotNeeded: (...args: unknown[]) => mockMarkNotNeeded(...args),
  },
  workspaceTasks: {
    cancel: (...args: unknown[]) => mockCancelTask(...args),
  },
}));

const mockDetails: Record<string, { title: string; type: string; jiraStatus: string; description: string }> = {};
vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: (key: string | null) => ({ data: key ? mockDetails[key] : undefined }),
}));

// Capture stream callbacks PER TASK so tests can emit results like the SSE
// layer would — the modal now runs several watcher streams concurrently.
type StreamOptions = {
  onResult?: (data: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};
let streamsByTask: Record<string, StreamOptions>;
vi.mock("@/hooks/useTaskStream", () => ({
  useTaskStream: (taskId: string | null, options?: StreamOptions) => {
    if (taskId && options) streamsByTask[taskId] = options;
    return { status: "idle", progress: null, output: null, error: null, close: vi.fn() };
  },
}));

vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="ticket-pill">{ticketKey}</span>,
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => [text],
}));

vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

import { TestDocReviewModal } from "./TestDocReviewModal";

const DOC = "**Title**\n\n- Confirm the thing";

function openEditor() {
  fireEvent.click(screen.getByText("Edit", { selector: "button" }));
}

function docPayload(markdown: string, classification = "ok") {
  return `<test-doc>${JSON.stringify({ classification, markdown })}</test-doc>`;
}

// Generation POSTs resolve with task-<key> so tests can address each stream.
function taskIdFor(key: string) {
  return `task-${key}`;
}

async function emitResult(key: string, markdown: string, classification = "ok") {
  const taskId = taskIdFor(key);
  await waitFor(() => expect(streamsByTask[taskId]).toBeDefined());
  act(() => {
    streamsByTask[taskId].onResult?.({ output: docPayload(markdown, classification) });
  });
}

describe("TestDocReviewModal (BRDG-426)", () => {
  beforeEach(() => {
    mockGenerateTestDoc.mockReset();
    mockSaveTestDoc.mockReset();
    mockCancelTask.mockReset();
    streamsByTask = {};
    for (const key of ["VPL-1", "VPL-2", "VPL-3", "VPL-4", "VPL-5"]) {
      mockDetails[key] = {
        title: `Story ${key}`,
        type: "story",
        jiraStatus: "TEST",
        description: `### Description of ${key}`,
      };
    }
    mockGenerateTestDoc.mockImplementation((key: string) =>
      Promise.resolve({ taskId: taskIdFor(key), streamUrl: "/stream" }),
    );
    mockSaveTestDoc.mockResolvedValue({ saved: true, pushed: true });
    mockGetTestDoc.mockReset();
    mockGetTestDoc.mockResolvedValue({ saved: null, draft: null });
    mockSaveTestDocDraft.mockReset();
    mockSaveTestDocDraft.mockResolvedValue({ saved: true });
    mockMarkNotNeeded.mockReset();
    mockMarkNotNeeded.mockResolvedValue({ saved: true, notNeeded: true });
    mockCancelTask.mockResolvedValue({ ok: true });
  });

  it("renders the doc editor and the story side by side after generation", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

    expect(screen.getByTestId("test-doc-progress")).toBeInTheDocument();
    await emitResult("VPL-1", DOC);

    // Rendered markdown is the default reading mode; Edit opens the textarea.
    expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("Confirm the thing");
    openEditor();
    const editor = screen.getByTestId("test-doc-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe(DOC);
    expect(screen.getByTestId("test-doc-story-pane")).toHaveTextContent("Description of VPL-1");
    expect(screen.getByTestId("ticket-pill")).toHaveTextContent("VPL-1");
    expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-1");
  });

  it("single mode: no Skip and no queue position; Save closes the modal", async () => {
    const onClose = vi.fn();
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={onClose} />);
    await emitResult("VPL-1", DOC);

    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-doc-queue-position")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockSaveTestDoc).toHaveBeenCalledWith("VPL-1", { markdown: DOC, classification: "ok" });
  });

  describe("bulk prefetch", () => {
    it("starts all generations immediately (up to the cap) without waiting for review", async () => {
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2", "VPL-3", "VPL-4"]} onClose={() => {}} />);

      // Cap is 3: the first three fire on open, the fourth waits for a slot.
      await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledTimes(3));
      expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-1");
      expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-2");
      expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-3");

      // A finished prefetch frees a slot: the fourth starts while the PO is
      // still reviewing the first.
      await emitResult("VPL-2", "**Second**\n\n- B");
      await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-4"));
    });

    it("shows an already-prefetched doc instantly after Save, with a ready indicator", async () => {
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);

      // Second doc lands while the first is still under review.
      await emitResult("VPL-2", "**Second**\n\n- B");
      await emitResult("VPL-1", DOC);

      expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("1 / 2 · 1 ready");

      fireEvent.click(screen.getByText("Save"));

      // No spinner on arrival: the editor renders the prefetched doc directly.
      await waitFor(() =>
        expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("2 / 2"),
      );
      expect(screen.queryByTestId("test-doc-progress")).not.toBeInTheDocument();
      expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Second**");
    });

    it("Skip advances without saving", async () => {
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);
      await emitResult("VPL-1", DOC);

      fireEvent.click(screen.getByText("Skip"));

      await waitFor(() =>
        expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("2 / 2"),
      );
      expect(mockSaveTestDoc).not.toHaveBeenCalled();
    });

    it("closing mid-queue cancels the generations still in flight", async () => {
      const onClose = vi.fn();
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2", "VPL-3"]} onClose={onClose} />);

      // First doc ready; 2 and 3 still streaming.
      await emitResult("VPL-1", DOC);
      await waitFor(() => expect(streamsByTask[taskIdFor("VPL-3")]).toBeDefined());

      fireEvent.click(screen.getByText("Cancel"));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(mockCancelTask).toHaveBeenCalledWith(taskIdFor("VPL-2"));
      expect(mockCancelTask).toHaveBeenCalledWith(taskIdFor("VPL-3"));
      expect(mockCancelTask).not.toHaveBeenCalledWith(taskIdFor("VPL-1"));
    });

    it("a background unstructured result does not flip the current item into edit mode", async () => {
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);
      await emitResult("VPL-1", DOC);
      expect(screen.getByTestId("test-doc-preview")).toBeInTheDocument();

      // VPL-2 lands unstructured in the background while VPL-1 is on screen.
      const task2 = taskIdFor("VPL-2");
      await waitFor(() => expect(streamsByTask[task2]).toBeDefined());
      act(() => {
        streamsByTask[task2].onResult?.({ output: "plain text, no tag" });
      });

      // Still previewing VPL-1...
      expect(screen.getByTestId("test-doc-preview")).toBeInTheDocument();
      // ...and advancing lands VPL-2 straight in the editor (it needs hand-work).
      fireEvent.click(screen.getByText("Skip"));
      await waitFor(() => expect(screen.getByTestId("test-doc-editor")).toBeInTheDocument());
    });

    it("a background prefetch error only surfaces when that item is reached", async () => {
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);
      await emitResult("VPL-1", DOC);
      const task2 = taskIdFor("VPL-2");
      await waitFor(() => expect(streamsByTask[task2]).toBeDefined());
      act(() => {
        streamsByTask[task2].onError?.("stream failed");
      });

      // Still reviewing VPL-1: no error banner.
      expect(screen.queryByText(/stream failed/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Skip"));
      await waitFor(() => expect(screen.getByText(/stream failed/)).toBeInTheDocument());
      expect(screen.queryByTestId("test-doc-progress")).not.toBeInTheDocument();
      expect(screen.getByText("Regenerate").closest("button")).not.toBeDisabled();
    });
  });

  describe("draft cache (generated docs persist unaccepted)", () => {
    it("caches a fresh generation as a draft immediately", async () => {
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
      await emitResult("VPL-1", DOC);

      await waitFor(() =>
        expect(mockSaveTestDocDraft).toHaveBeenCalledWith("VPL-1", {
          markdown: DOC,
          classification: "ok",
        }),
      );
    });

    it("shows a cached draft instantly without regenerating, with a provenance notice", async () => {
      mockGetTestDoc.mockResolvedValue({
        saved: null,
        draft: { markdown: "**Cached**\n\n- From last time", classification: "ok", generatedAt: "2026-07-02T10:00:00.000Z" },
      });
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

      await waitFor(() =>
        expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("From last time"),
      );
      expect(mockGenerateTestDoc).not.toHaveBeenCalled();
      expect(screen.getByText(/generated earlier/)).toBeInTheDocument();
    });

    it("shows the accepted doc when no draft exists, offering regenerate", async () => {
      mockGetTestDoc.mockResolvedValue({
        saved: { markdown: "**Accepted**\n\n- Saved doc", classification: "ok", updatedAt: "2026-07-01T09:00:00.000Z" },
        draft: null,
      });
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

      await waitFor(() =>
        expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("Saved doc"),
      );
      expect(mockGenerateTestDoc).not.toHaveBeenCalled();
      expect(screen.getByText(/saved test documentation/)).toBeInTheDocument();
      expect(screen.getByText("Regenerate").closest("button")).not.toBeDisabled();
    });

    it("Regenerate from a cached doc triggers a fresh generation", async () => {
      mockGetTestDoc.mockResolvedValue({
        saved: null,
        draft: { markdown: "**Cached**", classification: "ok", generatedAt: null },
      });
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
      await waitFor(() => expect(screen.getByTestId("test-doc-preview")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Regenerate"));

      await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-1"));
      await emitResult("VPL-1", "**Fresh**\n\n- New");
      expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Fresh**");
    });

    it("bulk: cached keys skip generation, uncached keys still generate", async () => {
      mockGetTestDoc.mockImplementation((key: string) =>
        Promise.resolve(
          key === "VPL-1"
            ? { saved: null, draft: { markdown: "**Cached one**", classification: "ok", generatedAt: null } }
            : { saved: null, draft: null },
        ),
      );
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByTestId("test-doc-preview")).toBeInTheDocument());
      await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-2"));
      expect(mockGenerateTestDoc).not.toHaveBeenCalledWith("VPL-1");
    });
  });

  describe("No test doc needed (PO judgement)", () => {
    it("marks the ticket while still generating, cancels the task and advances", async () => {
      const onClose = vi.fn();
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={onClose} />);
      // Task started but no result yet: the button must already work.
      await waitFor(() => expect(streamsByTask[taskIdFor("VPL-1")]).toBeDefined());

      fireEvent.click(screen.getByText("No test doc needed"));

      await waitFor(() => expect(mockMarkNotNeeded).toHaveBeenCalledWith("VPL-1"));
      expect(mockCancelTask).toHaveBeenCalledWith(taskIdFor("VPL-1"));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(mockSaveTestDoc).not.toHaveBeenCalled();
    });

    it("bulk: advances to the next item after marking", async () => {
      render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);
      await emitResult("VPL-1", DOC);

      fireEvent.click(screen.getByText("No test doc needed"));

      await waitFor(() =>
        expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("2 / 2"),
      );
      expect(mockMarkNotNeeded).toHaveBeenCalledWith("VPL-1");
    });
  });

  describe("view mode (autoGenerate=false)", () => {
    it("opens idle without starting a generation; the explicit button generates", async () => {
      render(<TestDocReviewModal keys={["VPL-1"]} autoGenerate={false} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByTestId("test-doc-idle")).toBeInTheDocument());
      expect(mockGenerateTestDoc).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("Generate test doc"));
      await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-1"));
      await emitResult("VPL-1", DOC);
      expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("Confirm the thing");
    });

    it("still shows a cached doc immediately in view mode", async () => {
      mockGetTestDoc.mockResolvedValue({
        saved: null,
        draft: { markdown: "**Cached**", classification: "ok", generatedAt: null },
      });
      render(<TestDocReviewModal keys={["VPL-1"]} autoGenerate={false} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Cached**"));
      expect(mockGenerateTestDoc).not.toHaveBeenCalled();
    });
  });

  it("needs_input: shows the notice and disables Save until the PO edits", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await emitResult("VPL-1", "**Dates preserved** — needs input", "needs_input");

    expect(screen.getByText(/lacks enough context/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByTestId("test-doc-editor"), {
      target: { value: "**Dates preserved**\n\n- Confirm dates survive entry" },
    });
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
  });

  it("not_stakeholder_relevant: shows the notice but keeps Save enabled", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await emitResult("VPL-1", "Internal: sync groundwork", "not_stakeholder_relevant");

    expect(screen.getByText(/not stakeholder-testable/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
  });

  it("conflict outcome: shows the warning and offers Next/Done instead of advancing silently", async () => {
    mockSaveTestDoc.mockResolvedValue({ saved: true, conflict: true, message: "Jira was updated." });
    const onClose = vi.fn();
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={onClose} />);
    await emitResult("VPL-1", DOC);

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByText(/Jira push hit a conflict/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a failed generate POST lands in review state with the error, spinner off", async () => {
    mockGenerateTestDoc.mockRejectedValue(new Error("Unknown skill: generate-test-doc"));
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/Failed to start generation/)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("test-doc-progress")).not.toBeInTheDocument();
    expect(screen.getByText("Regenerate").closest("button")).not.toBeDisabled();
  });

  describe("versioning on regenerate (BRDG-426)", () => {
    it("keeps the old version next to the new one; switching restores the old doc", async () => {
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
      await emitResult("VPL-1", "**Old**\n\n- A");

      delete streamsByTask[taskIdFor("VPL-1")];
      fireEvent.click(screen.getByText("Regenerate"));
      await emitResult("VPL-1", "**Fresh**\n\n- B");

      const chips = screen.getByTestId("test-doc-versions");
      expect(chips).toHaveTextContent("New");
      expect(chips).toHaveTextContent("New 2");
      expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Fresh**");

      fireEvent.click(screen.getByText("New", { selector: "button" }));
      expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Old**");
    });

    it("seeds Saved + Draft as two versions when both exist in the cache", async () => {
      mockGetTestDoc.mockResolvedValue({
        saved: { markdown: "**Accepted**", classification: "ok", updatedAt: null },
        draft: { markdown: "**Newer draft**", classification: "ok", generatedAt: null },
      });
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

      await waitFor(() => expect(screen.getByTestId("test-doc-versions")).toBeInTheDocument());
      expect(screen.getByTestId("test-doc-versions")).toHaveTextContent("Saved");
      expect(screen.getByTestId("test-doc-versions")).toHaveTextContent("Draft");
      // The newest (draft) starts active.
      expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Newer draft**");
    });

    it("compare shows the versions side by side; Use this one switches the active version", async () => {
      mockGetTestDoc.mockResolvedValue({
        saved: { markdown: "**Accepted**", classification: "ok", updatedAt: null },
        draft: { markdown: "**Newer draft**", classification: "ok", generatedAt: null },
      });
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
      await waitFor(() => expect(screen.getByTestId("test-doc-versions")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Compare"));
      const compare = screen.getByTestId("test-doc-compare");
      expect(compare).toHaveTextContent("**Accepted**");
      expect(compare).toHaveTextContent("**Newer draft**");

      fireEvent.click(screen.getByText("Use this one"));
      fireEvent.click(screen.getByText("Edit", { selector: "button" }));
      expect((screen.getByTestId("test-doc-editor") as HTMLTextAreaElement).value).toBe("**Accepted**");
    });

    it("Save accepts the ACTIVE version after switching back to the old one", async () => {
      const onClose = vi.fn();
      render(<TestDocReviewModal keys={["VPL-1"]} onClose={onClose} />);
      await emitResult("VPL-1", "**Old**\n\n- A");
      delete streamsByTask[taskIdFor("VPL-1")];
      fireEvent.click(screen.getByText("Regenerate"));
      await emitResult("VPL-1", "**Fresh**\n\n- B");

      fireEvent.click(screen.getByText("New", { selector: "button" }));
      fireEvent.click(screen.getByText("Save"));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mockSaveTestDoc).toHaveBeenCalledWith("VPL-1", {
        markdown: "**Old**\n\n- A",
        classification: "ok",
      });
    });
  });

  it("Regenerate restarts generation for the current key immediately", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await emitResult("VPL-1", DOC);

    delete streamsByTask[taskIdFor("VPL-1")];
    fireEvent.click(screen.getByText("Regenerate"));

    await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("test-doc-progress")).toBeInTheDocument();
    await emitResult("VPL-1", "**Regenerated**\n\n- New");
    expect(screen.getByTestId("test-doc-preview")).toHaveTextContent("**Regenerated**");
  });

  it("unstructured output degrades to the raw text with a warning", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    const task = taskIdFor("VPL-1");
    await waitFor(() => expect(streamsByTask[task]).toBeDefined());
    act(() => {
      streamsByTask[task].onResult?.({ output: "just plain text, no tag" });
    });

    expect(screen.getByText(/unstructured output/)).toBeInTheDocument();
    expect((screen.getByTestId("test-doc-editor") as HTMLTextAreaElement).value).toBe(
      "just plain text, no tag",
    );
  });
});
