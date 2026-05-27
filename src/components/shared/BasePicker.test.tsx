import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BasePicker, usePickerState } from "./BasePicker";

// ---------------------------------------------------------------------------
// Helper: minimal picker built with BasePicker compound component
// ---------------------------------------------------------------------------

function TestPicker({
  portal = false,
  align,
  onOpenChange,
  items = ["Alpha", "Beta", "Gamma"],
  selected = "",
  onSelect = vi.fn(),
}: {
  portal?: boolean;
  align?: "left" | "right";
  onOpenChange?: (open: boolean) => void;
  items?: string[];
  selected?: string;
  onSelect?: (item: string) => void;
}) {
  return (
    <BasePicker.Root portal={portal} align={align} onOpenChange={onOpenChange}>
      <BasePicker.Trigger className="test-trigger" title="Open picker">
        {selected || "Select"}
      </BasePicker.Trigger>
      <BasePicker.Popover width="w-[200px]">
        <BasePicker.Search placeholder="Search items..." />
        <BasePicker.List>
          {items.map((item) => (
            <BasePicker.Item
              key={item}
              selected={item === selected}
              onSelect={() => onSelect(item)}
            >
              <span>{item}</span>
            </BasePicker.Item>
          ))}
          {items.length === 0 && <BasePicker.Empty>No items</BasePicker.Empty>}
        </BasePicker.List>
      </BasePicker.Popover>
    </BasePicker.Root>
  );
}

describe("BasePicker", () => {
  describe("Root + Trigger + Popover", () => {
    it("renders trigger text", () => {
      render(<TestPicker />);
      expect(screen.getByText("Select")).toBeInTheDocument();
    });

    it("popover is hidden when closed", () => {
      render(<TestPicker />);
      expect(screen.queryByPlaceholderText("Search items...")).not.toBeInTheDocument();
    });

    it("opens popover on trigger click", () => {
      render(<TestPicker />);
      fireEvent.click(screen.getByText("Select"));
      expect(screen.getByPlaceholderText("Search items...")).toBeInTheDocument();
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
      expect(screen.getByText("Gamma")).toBeInTheDocument();
    });

    it("closes popover on second trigger click", () => {
      render(<TestPicker />);
      const trigger = screen.getByText("Select");
      fireEvent.click(trigger);
      expect(screen.getByPlaceholderText("Search items...")).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByPlaceholderText("Search items...")).not.toBeInTheDocument();
    });

    it("calls onOpenChange when opening and closing", () => {
      const onOpenChange = vi.fn();
      render(<TestPicker onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText("Select"));
      expect(onOpenChange).toHaveBeenCalledWith(true);

      fireEvent.click(screen.getByText("Select"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Click outside", () => {
    it("closes popover on click outside", () => {
      render(
        <div>
          <TestPicker />
          <button data-testid="outside">Outside</button>
        </div>,
      );

      fireEvent.click(screen.getByText("Select"));
      expect(screen.getByPlaceholderText("Search items...")).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId("outside"));
      expect(screen.queryByPlaceholderText("Search items...")).not.toBeInTheDocument();
    });

    it("does NOT close when clicking inside popover", () => {
      render(<TestPicker />);
      fireEvent.click(screen.getByText("Select"));

      const searchInput = screen.getByPlaceholderText("Search items...");
      fireEvent.mouseDown(searchInput);
      expect(screen.getByPlaceholderText("Search items...")).toBeInTheDocument();
    });
  });

  describe("Escape key", () => {
    it("closes popover on Escape", () => {
      render(<TestPicker />);
      fireEvent.click(screen.getByText("Select"));
      expect(screen.getByPlaceholderText("Search items...")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByPlaceholderText("Search items...")).not.toBeInTheDocument();
    });
  });

  describe("Search", () => {
    it("renders search input with placeholder", () => {
      render(<TestPicker />);
      fireEvent.click(screen.getByText("Select"));
      expect(screen.getByPlaceholderText("Search items...")).toBeInTheDocument();
    });

    it("updates query on input change", () => {
      render(<TestPicker />);
      fireEvent.click(screen.getByText("Select"));

      const input = screen.getByPlaceholderText("Search items...");
      fireEvent.change(input, { target: { value: "test" } });
      expect(input).toHaveValue("test");
    });

    it("resets query when picker closes and reopens", () => {
      render(<TestPicker />);
      const trigger = screen.getByText("Select");

      fireEvent.click(trigger);
      const input = screen.getByPlaceholderText("Search items...");
      fireEvent.change(input, { target: { value: "test" } });
      expect(input).toHaveValue("test");

      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(trigger);
      expect(screen.getByPlaceholderText("Search items...")).toHaveValue("");
    });
  });

  describe("Item", () => {
    it("calls onSelect when item is clicked", () => {
      const onSelect = vi.fn();
      render(<TestPicker onSelect={onSelect} />);
      fireEvent.click(screen.getByText("Select"));

      fireEvent.click(screen.getByText("Beta"));
      expect(onSelect).toHaveBeenCalledWith("Beta");
    });

    it("shows check icon for selected item", () => {
      render(<TestPicker selected="Alpha" />);
      // Trigger shows "Alpha" as selected text; click it to open
      fireEvent.click(screen.getAllByText("Alpha")[0]);

      // The item row inside the list should have a check icon (svg)
      const alphaSpan = screen.getAllByText("Alpha").find(
        (el) => el.tagName === "SPAN" && el.closest("[class*='hover:bg-hover-list-item']"),
      )!;
      const alphaButton = alphaSpan.closest("button");
      const svg = alphaButton?.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("does NOT show check icon for unselected items", () => {
      render(<TestPicker selected="Alpha" />);
      fireEvent.click(screen.getAllByText("Alpha")[0]);

      const betaButton = screen.getByText("Beta").closest("button");
      const svg = betaButton?.querySelector("svg");
      expect(svg).toBeNull();
    });
  });

  describe("Empty", () => {
    it("shows empty message when no items", () => {
      render(<TestPicker items={[]} />);
      fireEvent.click(screen.getByText("Select"));
      expect(screen.getByText("No items")).toBeInTheDocument();
    });
  });

  describe("Section + Divider", () => {
    it("renders section header and divider", () => {
      render(
        <BasePicker.Root portal={false}>
          <BasePicker.Trigger>Open</BasePicker.Trigger>
          <BasePicker.Popover>
            <BasePicker.List>
              <BasePicker.Section>Group A</BasePicker.Section>
              <BasePicker.Item onSelect={() => {}}>
                <span>Item 1</span>
              </BasePicker.Item>
              <BasePicker.Divider />
              <BasePicker.Section>Group B</BasePicker.Section>
              <BasePicker.Item onSelect={() => {}}>
                <span>Item 2</span>
              </BasePicker.Item>
            </BasePicker.List>
          </BasePicker.Popover>
        </BasePicker.Root>,
      );

      fireEvent.click(screen.getByText("Open"));
      expect(screen.getByText("Group A")).toBeInTheDocument();
      expect(screen.getByText("Group B")).toBeInTheDocument();
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
    });
  });

  describe("Trigger render function", () => {
    it("passes open state to render function", () => {
      render(
        <BasePicker.Root portal={false}>
          <BasePicker.Trigger>
            {({ open }) => <span>{open ? "Close" : "Open"}</span>}
          </BasePicker.Trigger>
          <BasePicker.Popover>
            <BasePicker.List>
              <BasePicker.Item onSelect={() => {}}>
                <span>Item</span>
              </BasePicker.Item>
            </BasePicker.List>
          </BasePicker.Popover>
        </BasePicker.Root>,
      );

      expect(screen.getByText("Open")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Open"));
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
  });

  describe("Portal vs relative mode", () => {
    it("renders popover relative (non-portal) inside parent container", () => {
      const { container } = render(<TestPicker portal={false} />);
      fireEvent.click(screen.getByText("Select"));

      // In non-portal mode, the popover is inside the container div with class "relative"
      const relativeContainer = container.querySelector(".relative");
      expect(relativeContainer).toBeInTheDocument();
      const popover = relativeContainer?.querySelector("[class*='absolute']");
      expect(popover).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// usePickerState hook tests
// ---------------------------------------------------------------------------

describe("usePickerState", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => usePickerState({ portal: false }));
    expect(result.current.open).toBe(false);
  });

  it("opens and closes", () => {
    const { result } = renderHook(() => usePickerState({ portal: false }));

    act(() => result.current.handleOpen());
    expect(result.current.open).toBe(true);

    act(() => result.current.handleClose());
    expect(result.current.open).toBe(false);
  });

  it("calls onOpen and onClose callbacks", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      usePickerState({ portal: false, onOpen, onClose }),
    );

    act(() => result.current.handleOpen());
    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => result.current.handleClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key", () => {
    const { result } = renderHook(() => usePickerState({ portal: false }));

    act(() => result.current.handleOpen());
    expect(result.current.open).toBe(true);

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(result.current.open).toBe(false);
  });

  it("provides ref objects", () => {
    const { result } = renderHook(() => usePickerState());
    expect(result.current.triggerRef).toBeDefined();
    expect(result.current.popoverRef).toBeDefined();
  });
});
