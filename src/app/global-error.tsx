"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

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
      <body className="bg-[#0c0c0e] text-text-primary">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-text-primary">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-text-secondary">
            A critical error occurred. Please try reloading the page.
          </p>
          <Button variant="ghost" size="lg" onClick={reset}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
