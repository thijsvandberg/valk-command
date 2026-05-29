import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SplitStoryPicker } from "./SplitStoryPicker";

vi.mock("@/lib/api-client", () => ({
  sprintSlots: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    icon,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  ),
}));

import { sprintSlots } from "@/lib/api-client";

function makeDefaultProps(overrides = {}) {
  return {
    open: true,
    originalTitle: "Original Story Title",
    originalSprintId: null,
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("SplitStoryPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sprintSlots.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <SplitStoryPicker {...makeDefaultProps({ open: false })} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the modal when open is true", () => {
    render(<SplitStoryPicker {...makeDefaultProps()} />);

    expect(screen.getByText("Split story")).toBeInTheDocument();
    expect(screen.getByText("Select or create the target story")).toBeInTheDocument();
  });

  it("defaults to 'Create new story' mode", () => {
    render(<SplitStoryPicker {...makeDefaultProps()} />);

    expect(screen.getByText("Create new story")).toBeInTheDocument();
    expect(screen.getByLabelText("New story title")).toBeInTheDocument();
  });

  it("pre-fills new story title with 'Split: {originalTitle}'", () => {
    render(<SplitStoryPicker {...makeDefaultProps({ originalTitle: "My Story" })} />);

    expect(screen.getByDisplayValue("Split: My Story")).toBeInTheDocument();
  });

  it("switches to existing mode when 'Use existing story' is clicked", () => {
    render(<SplitStoryPicker {...makeDefaultProps()} />);

    fireEvent.click(screen.getByText("Use existing story"));

    expect(screen.getByLabelText("Ticket key")).toBeInTheDocument();
    expect(screen.queryByLabelText("New story title")).not.toBeInTheDocument();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<SplitStoryPicker {...makeDefaultProps({ onClose })} />);

    fireEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onConfirm with new story params in create mode", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<SplitStoryPicker {...makeDefaultProps({ onConfirm })} />);

    fireEvent.change(screen.getByLabelText("New story title"), {
      target: { value: "My New Split Story" },
    });

    fireEvent.click(screen.getByText("Create & split"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        undefined,
        expect.anything(),
        "My New Split Story",
        "story",
      );
    });
  });

  it("calls onConfirm with existing key in existing mode", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<SplitStoryPicker {...makeDefaultProps({ onConfirm })} />);

    fireEvent.click(screen.getByText("Use existing story"));
    fireEvent.change(screen.getByPlaceholderText("VPL-123"), {
      target: { value: "vpl-42" },
    });

    fireEvent.click(screen.getByText("Link & split"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("VPL-42", undefined, undefined, undefined);
    });
  });

  it("shows validation error when existing key is empty on confirm", async () => {
    render(<SplitStoryPicker {...makeDefaultProps()} />);

    fireEvent.click(screen.getByText("Use existing story"));
    fireEvent.click(screen.getByText("Link & split"));

    await waitFor(() => {
      expect(screen.getByText("Enter a ticket key")).toBeInTheDocument();
    });
  });

  it("converts existing key to uppercase while typing", () => {
    render(<SplitStoryPicker {...makeDefaultProps()} />);

    fireEvent.click(screen.getByText("Use existing story"));
    const input = screen.getByPlaceholderText("VPL-123");
    fireEvent.change(input, { target: { value: "vpl-99" } });

    expect((input as HTMLInputElement).value).toBe("VPL-99");
  });

  it("shows error message when onConfirm rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<SplitStoryPicker {...makeDefaultProps({ onConfirm })} />);

    fireEvent.click(screen.getByText("Create & split"));

    await waitFor(() => {
      expect(screen.getByText("Failed to activate split mode")).toBeInTheDocument();
    });
  });

  it("loads sprints on open and pre-selects matching sprint", async () => {
    const sprints = [
      { slotIndex: 0, sprintId: "sprint-1", sprintName: "Sprint 1" },
      { slotIndex: 1, sprintId: "sprint-2", sprintName: "Sprint 2" },
    ];
    (sprintSlots.list as ReturnType<typeof vi.fn>).mockResolvedValue(sprints);

    render(
      <SplitStoryPicker
        {...makeDefaultProps({ originalSprintId: "sprint-2" })}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Sprint 1")).toBeInTheDocument();
      expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    });
  });

  it("renders issue type selector in create mode", () => {
    render(<SplitStoryPicker {...makeDefaultProps()} />);

    expect(screen.getByLabelText("Issue type")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Story")).toBeInTheDocument();
  });

  it("calls onClose when overlay is clicked with mousedown on overlay", () => {
    const onClose = vi.fn();
    render(<SplitStoryPicker {...makeDefaultProps({ onClose })} />);

    const overlay = screen.getByText("Split story").closest(".fixed")!;
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalled();
  });
});
