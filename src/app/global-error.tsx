"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#0c0c0e] text-white">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-white/60">
            A critical error occurred. Please try reloading the page.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.1] cursor-pointer"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
