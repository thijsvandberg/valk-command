import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "./EmptyState";
import { InlineAlert } from "./InlineAlert";

// Single shared convention for a failed data fetch (BRDG-423). SWR never throws,
// so a failed fetch is invisible unless each surface reads `error` and renders it.
// This keeps that treatment identical everywhere: an inline banner above
// still-visible (often cached) content, or a full-view retry screen when there is
// nothing to show. It composes the existing primitives as-is; it does NOT recolor
// InlineAlert (that is BRDG-419).

const DEFAULT_TITLE = "Couldn't load this view";
const DEFAULT_MESSAGE =
  "Something went wrong while loading. Check your connection and try again.";

// Derive a user-facing message from an unknown SWR error. ApiError (and any Error)
// carries a useful `.message`; otherwise fall back to the generic line.
export function dataErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return DEFAULT_MESSAGE;
}

interface DataErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  // "inline": a banner that sits above content that is still rendered (cached data
  // or a partial view). "full": a centered retry screen that replaces an empty view.
  variant?: "inline" | "full";
  title?: string;
  className?: string;
}

export function DataErrorState({
  error,
  onRetry,
  variant = "inline",
  title = DEFAULT_TITLE,
  className,
}: DataErrorStateProps) {
  const message = dataErrorMessage(error);

  if (variant === "full") {
    return (
      <EmptyState
        icon={
          <AlertTriangle
            size={20}
            strokeWidth={1.5}
            className="text-[var(--color-danger-400)]"
          />
        }
        title={title}
        description={message}
        action={
          onRetry ? (
            <Button
              variant="soft"
              size="md"
              icon={<RotateCw size={13} strokeWidth={1.5} />}
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : undefined
        }
        className={className}
      />
    );
  }

  return (
    <InlineAlert variant="error" className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">{message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-sm font-medium underline-offset-2 cursor-pointer transition-opacity duration-150 hover:underline active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
          >
            <RotateCw size={12} strokeWidth={2} />
            Retry
          </button>
        )}
      </div>
    </InlineAlert>
  );
}
