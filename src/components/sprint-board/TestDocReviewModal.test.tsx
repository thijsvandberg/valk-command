import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateTestDoc = vi.fn();
const mockSaveTestDoc = vi.fn();
const mockCancelTask = vi.fn();
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  tickets: {
    generateTestDoc: (...args: unknown[]) => mockGenerateTestDoc(...args),
    saveTestDoc: (...args: unknown[]) => mockSaveTestDoc(...args),
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

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => [text],
}));

vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

import { TestDocReviewModal } from "./TestDocReviewModal";

const DOC = "**Title**\n\n- Confirm the thing";

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
    mockCancelTask.mockResolvedValue({ ok: true });
  });

  it("renders the doc editor and the story side by side after generation", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

    expect(screen.getByTestId("test-doc-progress")).toBeInTheDocument();
    await emitResult("VPL-1", DOC);

    const editor = screen.getByTestId("test-doc-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe(DOC);
    expect(screen.getByTestId("test-doc-story-pane")).toHaveTextContent("Description of VPL-1");
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
      expect((screen.getByTestId("test-doc-editor") as HTMLTextAreaElement).value).toBe(
        "**Second**\n\n- B",
      );
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

  it("Regenerate restarts generation for the current key immediately", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await emitResult("VPL-1", DOC);

    delete streamsByTask[taskIdFor("VPL-1")];
    fireEvent.click(screen.getByText("Regenerate"));

    await waitFor(() => expect(mockGenerateTestDoc).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("test-doc-progress")).toBeInTheDocument();
    await emitResult("VPL-1", "**Regenerated**\n\n- New");
    expect((screen.getByTestId("test-doc-editor") as HTMLTextAreaElement).value).toBe(
      "**Regenerated**\n\n- New",
    );
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
