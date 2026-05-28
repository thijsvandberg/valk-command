import { useEffect, type RefObject } from "react";

type SingleOrMultipleRefs =
  | RefObject<HTMLElement | null>
  | RefObject<HTMLElement | null>[];

interface UseOutsideClickOptions {
  /** Whether the hook is active (default: true) */
  enabled?: boolean;
  /** Close on Escape key (default: true) */
  escapeClose?: boolean;
}

/**
 * Fires `onClose` when a mousedown event lands outside all provided refs.
 * Optionally also fires on Escape key press.
 */
export function useOutsideClick(
  refs: SingleOrMultipleRefs,
  onClose: () => void,
  options: UseOutsideClickOptions = {},
): void {
  const { enabled = true, escapeClose = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const refArray = Array.isArray(refs) ? refs : [refs];

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const isInside = refArray.some(
        (ref) => ref.current?.contains(target),
      );
      if (!isInside) onClose();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handleMouseDown);
    if (escapeClose) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      if (escapeClose) {
        document.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [refs, onClose, enabled, escapeClose]);
}
