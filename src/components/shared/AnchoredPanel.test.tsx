import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRef, useState } from "react";
import { computePosition, autoUpdate, offset, flip, shift, size } from "@floating-ui/dom";
import { AnchoredPanel } from "./AnchoredPanel";

// jsdom performs no layout, so floating-ui cannot compute real geometry. Mock it
// to assert the positioning contract: placement, collision middleware, applied
// coordinates, and the autoUpdate lifecycle.
vi.mock("@floating-ui/dom", () => ({
  computePosition: vi.fn(() =>
    Promise.resolve({ x: 111, y: 222, placement: "bottom-start", strategy: "fixed", middlewareData: {} }),
  ),
  autoUpdate: vi.fn((_ref: unknown, _panel: unknown, update: () => void) => {
    update();
    return vi.fn();
  }),
  offset: vi.fn((value: number) => ({ name: "offset", options: value })),
  flip: vi.fn(() => ({ name: "flip" })),
  shift: vi.fn((options: unknown) => ({ name: "shift", options })),
  size: vi.fn((options: unknown) => ({ name: "size", options })),
}));

function Harness({
  portal = true,
  point,
  fitViewport = false,
  dismissable = true,
  withTriggerInside = false,
}: {
  portal?: boolean;
  point?: { x: number; y: number };
  fitViewport?: boolean;
  dismissable?: boolean;
  withTriggerInside?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen((v) => !v)}>
        Toggle
      </button>
      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        point={point}
        portal={portal}
        fitViewport={fitViewport}
        dismissable={dismissable}
        insideRefs={withTriggerInside ? [triggerRef] : undefined}
        role="menu"
      >
        {({ maxHeight }) => <div data-testid="content" data-max-height={maxHeight ?? ""}>Panel content</div>}
      </AnchoredPanel>
    </div>
  );
}

describe("AnchoredPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while closed and mounts on open", async () => {
    render(<Harness />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByText("Toggle"));
    // The panel stays visibility:hidden until floating-ui resolves a position.
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("portals to document.body with the popover z token and collision-aware position", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Toggle"));
    const panel = await screen.findByRole("menu");
    expect(panel.parentElement).toBe(document.body);
    expect(panel.className).toContain("z-popover");
    await waitFor(() => {
      expect(panel.style.left).toBe("111px");
      expect(panel.style.top).toBe("222px");
      expect(panel.style.visibility).toBe("visible");
    });
    expect(offset).toHaveBeenCalledWith(4);
    expect(flip).toHaveBeenCalled();
    expect(shift).toHaveBeenCalledWith({ padding: 8 });
  });

  it("tracks the anchor with autoUpdate and cleans up on close", async () => {
    const cleanups = vi.mocked(autoUpdate).mock.results;
    render(<Harness />);
    fireEvent.click(screen.getByText("Toggle"));
    await waitFor(() => expect(autoUpdate).toHaveBeenCalled());
    const cleanup = cleanups[cleanups.length - 1].value as ReturnType<typeof vi.fn>;
    fireEvent.click(screen.getByText("Toggle"));
    expect(cleanup).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Toggle"));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on outside mousedown", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Toggle"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not close from a mousedown on an insideRefs element (trigger toggle stays a toggle)", async () => {
    render(<Harness withTriggerInside />);
    const trigger = screen.getByText("Toggle");
    fireEvent.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ignores Escape and outside clicks when dismissable is off (caller-owned dismissal)", async () => {
    render(<Harness dismissable={false} />);
    fireEvent.click(screen.getByText("Toggle"));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(document.body);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("positions from a virtual cursor point in point mode", async () => {
    render(<Harness point={{ x: 40, y: 60 }} />);
    fireEvent.click(screen.getByText("Toggle"));
    await waitFor(() => expect(computePosition).toHaveBeenCalled());
    const reference = vi.mocked(computePosition).mock.calls.at(-1)![0] as {
      getBoundingClientRect: () => DOMRect;
    };
    const rect = reference.getBoundingClientRect();
    expect(rect.left).toBe(40);
    expect(rect.top).toBe(60);
    expect(rect.width).toBe(0);
  });

  it("passes the size() available height to render-prop children with fitViewport", async () => {
    vi.mocked(size).mockImplementationOnce((options: unknown) => {
      const { apply } = options as { apply: (args: { availableHeight: number }) => void };
      apply({ availableHeight: 321 });
      return { name: "size", options } as never;
    });
    render(<Harness fitViewport />);
    fireEvent.click(screen.getByText("Toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("content").dataset.maxHeight).toBe("321");
    });
  });

  it("renders inline (no portal) as an absolute panel on the dropdown layer", () => {
    render(<Harness portal={false} />);
    fireEvent.click(screen.getByText("Toggle"));
    const panel = screen.getByRole("menu");
    expect(panel.parentElement).not.toBe(document.body);
    expect(panel.className).toContain("absolute top-full");
    expect(panel.className).toContain("z-dropdown");
    expect(computePosition).not.toHaveBeenCalledWith(expect.anything(), panel, expect.anything());
  });
});
