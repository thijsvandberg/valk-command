import { useState, useCallback, useEffect } from "react";

interface UseKeyboardNavOptions {
  /** Wrap around at ends (default: true) */
  loop?: boolean;
  /** Escape key handler */
  onEscape?: () => void;
  /** Enter key handler, receives current active index */
  onSelect?: (index: number) => void;
  /** Whether the hook is active (default: true) */
  enabled?: boolean;
}

interface UseKeyboardNavResult {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  handlers: {
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

/**
 * Keyboard navigation for lists: ArrowUp/Down, Home/End, Enter, Escape.
 * Skips disabled indices when navigating.
 */
export function useKeyboardNav(
  itemCount: number,
  disabledIndices?: Set<number>,
  options: UseKeyboardNavOptions = {},
): UseKeyboardNavResult {
  const { loop = true, onEscape, onSelect, enabled = true } = options;
  const [activeIndex, setActiveIndex] = useState(-1);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) setActiveIndex(-1);
  }, [enabled]);

  const findNextEnabled = useCallback(
    (from: number, direction: 1 | -1): number => {
      if (itemCount === 0) return -1;
      let idx = from;
      for (let i = 0; i < itemCount; i++) {
        idx += direction;
        if (loop) {
          idx = ((idx % itemCount) + itemCount) % itemCount;
        } else if (idx < 0 || idx >= itemCount) {
          return from;
        }
        if (!disabledIndices?.has(idx)) return idx;
      }
      return from;
    },
    [itemCount, disabledIndices, loop],
  );

  const findFirstEnabled = useCallback((): number => {
    for (let i = 0; i < itemCount; i++) {
      if (!disabledIndices?.has(i)) return i;
    }
    return -1;
  }, [itemCount, disabledIndices]);

  const findLastEnabled = useCallback((): number => {
    for (let i = itemCount - 1; i >= 0; i--) {
      if (!disabledIndices?.has(i)) return i;
    }
    return -1;
  }, [itemCount, disabledIndices]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const start = activeIndex < 0 ? -1 : activeIndex;
          setActiveIndex(findNextEnabled(start, 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const start = activeIndex < 0 ? itemCount : activeIndex;
          setActiveIndex(findNextEnabled(start, -1));
          break;
        }
        case "Home":
          e.preventDefault();
          setActiveIndex(findFirstEnabled());
          break;
        case "End":
          e.preventDefault();
          setActiveIndex(findLastEnabled());
          break;
        case "Enter":
          if (activeIndex >= 0) {
            e.preventDefault();
            onSelect?.(activeIndex);
          }
          break;
        case "Escape":
          onEscape?.();
          break;
      }
    },
    [enabled, activeIndex, itemCount, findNextEnabled, findFirstEnabled, findLastEnabled, onSelect, onEscape],
  );

  return {
    activeIndex,
    setActiveIndex,
    handlers: { onKeyDown: handleKeyDown },
  };
}
