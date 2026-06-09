import type { TicketReadiness } from "@/types/ticket";
import { READINESS_CONFIG } from "@/types/ticket";
import { ReadinessIcon } from "@/components/shared/ReadinessCell";

// Shared Readiness filter option renderer. Used by both the Sprint Board FilterBar and the
// dedicated search filter panel so the Readiness dropdown stays identical across the app (BRDG-324).
// The sentinel value "none" represents null readiness (ready for development).
export function ReadinessOption({ value }: { value: string }) {
  if (value === "none") {
    return (
      <span className="flex items-center gap-2">
        <span className="flex w-4 justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />
        </span>
        Ready for Development
      </span>
    );
  }
  const cfg = READINESS_CONFIG[value as keyof typeof READINESS_CONFIG];
  return (
    <span className="flex items-center gap-2">
      <span className="flex w-4 justify-center" style={{ color: cfg?.color ?? "var(--color-status-neutral)" }}>
        <ReadinessIcon value={value as TicketReadiness} size={15} strokeWidth={2} />
      </span>
      {cfg?.label ?? value}
    </span>
  );
}
