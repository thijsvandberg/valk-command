import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        onClose={() => {}}
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText("Delete item?")).not.toBeInTheDocument();
  });

  it("renders title and description when open", () => {
    render(
      <ConfirmDialog
        open={true}
        onClose={() => {}}
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Delete item?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("shows default button labels", () => {
    render(
      <ConfirmDialog
        open={true}
        onClose={() => {}}
        title="Title"
        description="Desc"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows custom button labels", () => {
    render(
      <ConfirmDialog
        open={true}
        onClose={() => {}}
        title="Title"
        description="Desc"
        onConfirm={() => {}}
        confirmLabel="Delete"
        cancelLabel="Go back"
      />,
    );
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Go back")).toBeInTheDocument();
  });

  it("calls onConfirm and onClose when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onClose={onClose}
        title="Title"
        description="Desc"
        onConfirm={onConfirm}
        confirmLabel="Delete"
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onClose={onClose}
        title="Title"
        description="Desc"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders extra content when provided", () => {
    render(
      <ConfirmDialog
        open={true}
        onClose={() => {}}
        title="Title"
        description="Desc"
        onConfirm={() => {}}
        extra={<span>Extra content</span>}
      />,
    );
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
