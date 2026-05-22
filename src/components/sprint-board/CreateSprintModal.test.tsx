import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateSprintModal } from "./CreateSprintModal";

vi.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: undefined }),
  mutate: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  jira: {
    createSprint: vi.fn(),
  },
}));

import { jira } from "@/lib/api-client";
import { mutate } from "swr";

describe("CreateSprintModal", () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders modal with all fields", () => {
    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    expect(screen.getByText("Create Sprint")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Sprint 42")).toBeInTheDocument();
    expect(screen.getByText("Sprint goal")).toBeInTheDocument();
    expect(screen.getByText("Start date")).toBeInTheDocument();
    expect(screen.getByText("End date")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables Create button when name is empty", () => {
    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    const createBtn = screen.getByText("Create");
    expect(createBtn).toBeDisabled();
  });

  it("enables Create button when name is entered", () => {
    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Sprint 42"), {
      target: { value: "Sprint 50" },
    });

    expect(screen.getByText("Create")).not.toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("creates sprint on submit and calls onCreated with sprint ID", async () => {
    vi.mocked(jira.createSprint).mockResolvedValue({
      id: 500,
      name: "Sprint 50",
      state: "future",
      startDate: null,
      endDate: null,
      goal: null,
    });

    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Sprint 42"), {
      target: { value: "Sprint 50" },
    });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(jira.createSprint).toHaveBeenCalledWith({
        name: "Sprint 50",
      });
    });

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith("/api/jira/sprints");
      expect(onCreated).toHaveBeenCalledWith("500");
      expect(showToast).toHaveBeenCalledWith("Sprint created");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error toast on creation failure", async () => {
    vi.mocked(jira.createSprint).mockRejectedValue(new Error("Network error"));

    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Sprint 42"), {
      target: { value: "Sprint 50" },
    });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Network error");
    });

    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows loading state during creation", async () => {
    let resolveCreate!: (v: { id: number; name: string; state: string; startDate: string | null; endDate: string | null; goal: string | null }) => void;
    vi.mocked(jira.createSprint).mockImplementation(
      () => new Promise((res) => { resolveCreate = res; }),
    );

    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Sprint 42"), {
      target: { value: "Sprint 50" },
    });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });

    resolveCreate({ id: 500, name: "Sprint 50", state: "future", startDate: null, endDate: null, goal: null });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it("passes goal and dates when provided", async () => {
    vi.mocked(jira.createSprint).mockResolvedValue({
      id: 501,
      name: "Sprint 51",
      state: "future",
      startDate: "2026-06-01T09:00:00.000Z",
      endDate: "2026-06-14T17:00:00.000Z",
      goal: "Ship auth",
    });

    render(
      <CreateSprintModal onClose={onClose} onCreated={onCreated} showToast={showToast} />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Sprint 42"), {
      target: { value: "Sprint 51" },
    });

    const goalTextarea = screen.getByPlaceholderText("Describe the sprint's primary objective...");
    fireEvent.change(goalTextarea, { target: { value: "Ship auth" } });

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(jira.createSprint).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Sprint 51",
          goal: "Ship auth",
        }),
      );
    });
  });
});
