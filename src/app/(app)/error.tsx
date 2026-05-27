"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);

    // Hide sidebar when error is shown
    const sidebar = document.querySelector<HTMLElement>("[data-testid='sidebar']");
    if (sidebar) sidebar.style.display = "none";

    return () => {
      if (sidebar) sidebar.style.display = "";
    };
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-text-secondary">
      <h2 className="font-[var(--font-display)] text-heading font-semibold tracking-[-0.02em] text-text-primary">Something went wrong</h2>
      <p className="max-w-md text-center text-body-lg">
        An unexpected error occurred. You can try again or navigate to a different page.
      </p>
      <Button variant="ghost" size="lg" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
