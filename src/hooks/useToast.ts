"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ShowToastOptions {
  /** Renders a spinner instead of the check icon and hides the dismiss button. */
  loading?: boolean;
}

export type ShowToast = (
  message: React.ReactNode,
  durationMs?: number,
  opts?: ShowToastOptions,
) => void;

export interface UseToastResult {
  toast: React.ReactNode | null;
  toastLoading: boolean;
  showToast: ShowToast;
  dismissToast: () => void;
}

/**
 * Single-toast-per-view transient feedback. Consolidates the near-identical
 * local toast state that several views used to declare inline.
 */
export function useToast(): UseToastResult {
  const [toast, setToast] = useState<React.ReactNode | null>(null);
  const [toastLoading, setToastLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback<ShowToast>((message, durationMs = 3000, opts) => {
    setToast(message);
    setToastLoading(opts?.loading ?? false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    // durationMs <= 0 keeps the toast until manually dismissed.
    if (durationMs > 0) {
      timerRef.current = setTimeout(() => setToast(null), durationMs);
    }
  }, []);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
    setToastLoading(false);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { toast, toastLoading, showToast, dismissToast };
}
