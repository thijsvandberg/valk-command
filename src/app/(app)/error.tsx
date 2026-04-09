"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-white/70">
      <h2 className="text-lg font-semibold text-white/90">Something went wrong</h2>
      <p className="max-w-md text-center text-sm">
        An unexpected error occurred. You can try again or navigate to a different page.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 active:bg-white/[0.12] cursor-pointer"
        style={{ transition: "background-color 0.15s ease" }}
      >
        Try again
      </button>
    </div>
  );
}
