import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScanControls } from "./ScanControls";
import { DEPRECATION_SCAN_TASKS } from "@/lib/cleanup-types";

// SWR is keyed: tasks vs auto-scan settings return different shapes.
const tasksMutate = vi.fn();
const autoMutate = vi.fn();
let tasksData: { tasks: Array<{ name: string; label: string; description: string; intervalMs: number; enabled: boolean }> };
let autoData: { enabled: boolean; dailyCount: number };

vi.mock("swr", () => ({
  default: (key: string) => {
    if (key === "/api/scheduler/tasks") return { data: tasksData, mutate: tasksMutate };
    if (key === "/api/cleanup/auto-scan-settings") return { data: autoData, mutate: autoMutate };
    return { data: undefined, mutate: vi.fn() };
  },
}));

const setTaskEnabled = vi.fn().mockResolvedValue({ ok: true });
const run = vi.fn().mockResolvedValue({ ran: true, result: {} });
const autoUpdate = vi.fn().mockResolvedValue({ enabled: true, dailyCount: 5 });

vi.mock("@/lib/api-client", () => ({
  scheduler: {
    setTaskEnabled: (...args: unknown[]) => setTaskEnabled(...args),
    run: (...args: unknown[]) => run(...args),
  },
  autoScanSettings: {
    update: (...args: unknown[]) => autoUpdate(...args),
  },
}));

function task(name: string, label: string, enabled: boolean) {
  return { name, label, description: "", intervalMs: 1000, enabled };
}

beforeEach(() => {
  vi.clearAllMocks();
  tasksData = {
    tasks: [
      task(DEPRECATION_SCAN_TASKS.staleness, "Backlog Staleness Scan", false),
      task(DEPRECATION_SCAN_TASKS.deepScan, "Backlog Deep Scan", false),
      task(DEPRECATION_SCAN_TASKS.autoEnqueue, "Auto Background Deep Scan", false),
    ],
  };
  autoData = { enabled: false, dailyCount: 5 };
});

function openPopover() {
  fireEvent.click(screen.getByRole("button", { name: /Scans/i }));
}

describe("ScanControls", () => {
  it("lists the three deprecation tasks with off toggles by default", () => {
    render(<ScanControls onRan={() => {}} />);
    openPopover();
    expect(screen.getByText("Backlog Staleness Scan")).toBeInTheDocument();
    expect(screen.getByText("Backlog Deep Scan")).toBeInTheDocument();
    expect(screen.getByText("Auto Background Deep Scan")).toBeInTheDocument();
    for (const sw of screen.getAllByRole("switch")) {
      expect(sw).toHaveAttribute("aria-checked", "false");
    }
  });

  it("reflects the effective enabled state from the API", () => {
    tasksData.tasks[0].enabled = true;
    render(<ScanControls onRan={() => {}} />);
    openPopover();
    const stalenessSwitch = screen.getByRole("switch", { name: /Disable Backlog Staleness Scan/i });
    expect(stalenessSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("toggling a task calls the toggle API with the new enabled state", async () => {
    const onRan = vi.fn();
    render(<ScanControls onRan={onRan} />);
    openPopover();
    fireEvent.click(screen.getByRole("switch", { name: /Enable Backlog Staleness Scan/i }));
    await waitFor(() => {
      expect(setTaskEnabled).toHaveBeenCalledWith(DEPRECATION_SCAN_TASKS.staleness, true);
    });
    expect(onRan).toHaveBeenCalled();
  });

  it("Run now hits the run route for that task", async () => {
    const onRan = vi.fn();
    render(<ScanControls onRan={onRan} />);
    openPopover();
    // The deep-scan row's Run now button.
    const runButtons = screen.getAllByRole("button", { name: /Run now/i });
    fireEvent.click(runButtons[1]);
    await waitFor(() => {
      expect(run).toHaveBeenCalledWith(DEPRECATION_SCAN_TASKS.deepScan);
    });
    expect(onRan).toHaveBeenCalled();
  });

  it("turning auto on keeps the scheduler flag and auto-scan-settings consistent", async () => {
    render(<ScanControls onRan={() => {}} />);
    openPopover();
    fireEvent.click(screen.getByRole("switch", { name: /Enable Auto Background Deep Scan/i }));
    await waitFor(() => {
      expect(setTaskEnabled).toHaveBeenCalledWith(DEPRECATION_SCAN_TASKS.autoEnqueue, true);
    });
    // Both sources of truth are written so they never disagree.
    expect(autoUpdate).toHaveBeenCalledWith({ enabled: true });
  });
});
