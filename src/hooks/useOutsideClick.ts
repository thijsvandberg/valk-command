import { useEffect, useRef, type RefObject } from "react";

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

  // Hold the latest refs/onClose so the listeners (subscribed once per
  // enabled/escapeClose change) always read current values. Callers pass inline
  // `refs` arrays and `onClose` closures, so depending on them directly
  // re-subscribed the document listeners on every render.
  const refsRef = useRef(refs);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    refsRef.current = refs;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;

    function handleMouseDown(e: MouseEvent) {
      const refArray = Array.isArray(refsRef.current) ? refsRef.current : [refsRef.current];
      const target = e.target as Node;
      const isInside = refArray.some(
        (ref) => ref.current?.contains(target),
      );
      if (!isInside) onCloseRef.current();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
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
  }, [enabled, escapeClose]);
}
