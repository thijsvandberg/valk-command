"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/client-error";

// Global client-error listener (BRDG-398). Catches the failures that never reach
// a React error boundary: uncaught runtime errors and unhandled promise
// rejections (e.g. a fetch in a click handler, an SSE parse, a background sync).
// Mounted once in the app layout; renders nothing. Forwarding is throttled and
// never throws (see reportClientError).
export function ClientErrorReporter() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      // event.error carries the stack when present; fall back to the message.
      reportClientError("window.onerror", event.error ?? event.message, {
        source: "window.onerror",
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      reportClientError("unhandledrejection", event.reason, {
        source: "unhandledrejection",
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
