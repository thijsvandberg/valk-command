"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { reportClientError } from "@/lib/client-error";
import { ErrorDigest } from "@/components/ErrorDigest";
import { ERROR_BOUNDARY_TITLE, ERROR_BOUNDARY_MESSAGE } from "@/components/shared/error-copy";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);

    // Forward to the server sink (BRDG-398) so the failure lands in the prod
    // log; pass the digest so a dev can tie this screen to the matching server
    // line. reportClientError is throttled and never throws.
    reportClientError("app-error-boundary", error, {
      digest: error.digest,
      source: "app-error-boundary",
    });

    // Hide sidebar when error is shown
    const sidebar = document.querySelector<HTMLElement>("[data-testid='sidebar']");
    if (sidebar) sidebar.style.display = "none";

    return () => {
      if (sidebar) sidebar.style.display = "";
    };
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-text-secondary">
      <h2 className="font-[var(--font-display)] text-heading font-semibold tracking-[-0.02em] text-text-primary">{ERROR_BOUNDARY_TITLE}</h2>
      <p className="max-w-md text-center text-body-lg">
        {ERROR_BOUNDARY_MESSAGE}
      </p>
      <Button variant="ghost" size="lg" onClick={reset}>
        Try again
      </Button>
      <ErrorDigest digest={error.digest} />
    </div>
  );
}
