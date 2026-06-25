"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { reportClientError } from "@/lib/client-error";
import { ErrorDigest } from "@/components/ErrorDigest";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);

    // Forward to the server sink (BRDG-398) so even a root-level crash lands in
    // the prod log; pass the digest so a dev can tie this screen to the matching
    // server line. reportClientError is throttled and never throws.
    reportClientError("global-error-boundary", error, {
      digest: error.digest,
      source: "global-error-boundary",
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[var(--color-surface-base)] text-text-primary">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <h2 className="font-[var(--font-display)] text-heading font-semibold tracking-[-0.02em] text-text-primary">Something went wrong</h2>
          <p className="max-w-md text-center text-body-lg text-text-secondary">
            A critical error occurred. Please try reloading the page.
          </p>
          <Button variant="ghost" size="lg" onClick={reset}>
            Try again
          </Button>
          <ErrorDigest digest={error.digest} />
        </div>
      </body>
    </html>
  );
}
