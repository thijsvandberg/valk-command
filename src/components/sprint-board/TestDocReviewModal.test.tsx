import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateTestDoc = vi.fn();
const mockSaveTestDoc = vi.fn();
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  tickets: {
    generateTestDoc: (...args: unknown[]) => mockGenerateTestDoc(...args),
    saveTestDoc: (...args: unknown[]) => mockSaveTestDoc(...args),
  },
}));

const mockDetails: Record<string, { title: string; type: string; jiraStatus: string; description: string }> = {};
vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: (key: string | null) => ({ data: key ? mockDetails[key] : undefined }),
}));

// Capture the stream callbacks so tests can emit results like the SSE layer would.
type StreamOptions = {
  onResult?: (data: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};
let streamOptions: StreamOptions | undefined;
let streamTaskId: string | null = null;
vi.mock("@/hooks/useTaskStream", () => ({
  useTaskStream: (taskId: string | null, options?: StreamOptions) => {
    streamTaskId = taskId;
    streamOptions = options;
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

async function emitResult(markdown: string, classification = "ok") {
  // The task id is set from the generate response first; wait for the stream hook to see it.
  await waitFor(() => expect(streamTaskId).not.toBeNull());
  act(() => {
    streamOptions?.onResult?.({ output: docPayload(markdown, classification) });
  });
}

describe("TestDocReviewModal (BRDG-426)", () => {
  beforeEach(() => {
    mockGenerateTestDoc.mockReset();
    mockSaveTestDoc.mockReset();
    streamOptions = undefined;
    streamTaskId = null;
    mockDetails["VPL-1"] = {
      title: "First story",
      type: "story",
      jiraStatus: "TEST",
      description: "### Story one description",
    };
    mockDetails["VPL-2"] = {
      title: "Second story",
      type: "bug",
      jiraStatus: "TEST",
      description: "### Story two description",
    };
    mockGenerateTestDoc.mockResolvedValue({ taskId: "task-1", streamUrl: "/stream" });
    mockSaveTestDoc.mockResolvedValue({ saved: true, pushed: true });
  });

  it("renders the doc editor and the story side by side after generation", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);

    expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-1");
    expect(screen.getByTestId("test-doc-progress")).toBeInTheDocument();

    await emitResult(DOC);

    const editor = screen.getByTestId("test-doc-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe(DOC);
    expect(screen.getByTestId("test-doc-story-pane")).toHaveTextContent("Story one description");
    expect(screen.getByText("First story")).toBeInTheDocument();
  });

  it("single mode: no Skip and no queue position; Save closes the modal", async () => {
    const onClose = vi.fn();
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={onClose} />);
    await emitResult(DOC);

    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-doc-queue-position")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockSaveTestDoc).toHaveBeenCalledWith("VPL-1", { markdown: DOC, classification: "ok" });
  });

  it("bulk mode: queue advances on Save and generates for the next key", async () => {
    render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);
    expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("1 / 2");

    await emitResult(DOC);
    mockGenerateTestDoc.mockClear();
    streamTaskId = null;

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("2 / 2"),
    );
    expect(mockGenerateTestDoc).toHaveBeenCalledWith("VPL-2");
  });

  it("bulk mode: Skip advances without saving", async () => {
    render(<TestDocReviewModal keys={["VPL-1", "VPL-2"]} onClose={() => {}} />);
    await emitResult(DOC);

    fireEvent.click(screen.getByText("Skip"));

    await waitFor(() =>
      expect(screen.getByTestId("test-doc-queue-position")).toHaveTextContent("2 / 2"),
    );
    expect(mockSaveTestDoc).not.toHaveBeenCalled();
  });

  it("needs_input: shows the notice and disables Save until the PO edits", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await emitResult("**Dates preserved** — needs input", "needs_input");

    expect(screen.getByText(/lacks enough context/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByTestId("test-doc-editor"), {
      target: { value: "**Dates preserved**\n\n- Confirm dates survive entry from the hotel site" },
    });
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
  });

  it("not_stakeholder_relevant: shows the notice but keeps Save enabled", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await emitResult("Internal: sync groundwork — not separately testable", "not_stakeholder_relevant");

    expect(screen.getByText(/not stakeholder-testable/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
  });

  it("conflict outcome: shows the warning and offers Next/Done instead of advancing silently", async () => {
    mockSaveTestDoc.mockResolvedValue({ saved: true, conflict: true, message: "Jira was updated." });
    const onClose = vi.fn();
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={onClose} />);
    await emitResult(DOC);

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByText(/Jira push hit a conflict/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unstructured output degrades to the raw text with a warning", async () => {
    render(<TestDocReviewModal keys={["VPL-1"]} onClose={() => {}} />);
    await waitFor(() => expect(streamTaskId).not.toBeNull());
    act(() => {
      streamOptions?.onResult?.({ output: "just plain text, no tag" });
    });

    expect(screen.getByText(/unstructured output/)).toBeInTheDocument();
    expect((screen.getByTestId("test-doc-editor") as HTMLTextAreaElement).value).toBe(
      "just plain text, no tag",
    );
  });
});
