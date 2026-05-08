import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  label?: string;
  variant?: "text" | "spinner";
  className?: string;
}

export function LoadingState({
  label = "Loading...",
  variant = "text",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={`flex flex-1 items-center justify-center${className ? ` ${className}` : ""}`}
      role="status"
    >
      {variant === "spinner" ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={32}
            strokeWidth={2}
            className="animate-spin text-text-muted"
          />
          <span className="text-sm text-text-tertiary">{label}</span>
        </div>
      ) : (
        <span className="text-sm text-text-tertiary">{label}</span>
      )}
    </div>
  );
}
