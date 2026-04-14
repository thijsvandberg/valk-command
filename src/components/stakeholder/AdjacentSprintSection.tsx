"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StakeholderTicket } from "@/lib/stakeholder-data";
import { TicketGroup } from "./TicketGroup";

interface AdjacentSprintSectionProps {
  label: "Previous" | "Upcoming";
  sprintName: string;
  tickets: StakeholderTicket[];
  /** Show keys toggle is only useful for upcoming (planned) tickets */
  allowKeyReveal?: boolean;
}

export function AdjacentSprintSection({
  label,
  sprintName,
  tickets,
  allowKeyReveal = false,
}: AdjacentSprintSectionProps) {
  const [expanded, setExpanded] = useState(label === "Upcoming");
  const [showKeys, setShowKeys] = useState(false);

  if (tickets.length === 0) return null;

  const labelColor =
    label === "Previous" ? "text-white/25" : "text-white/30";

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${labelColor}`}>
            {label} &mdash; {sprintName}
          </span>
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className={`text-white/20 group-hover:text-white/40 transition-all duration-150 ${expanded ? "rotate-180" : ""}`}
          />
          <span className={`text-[10px] tabular-nums ${labelColor}`}>
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
          </span>
        </button>

        {allowKeyReveal && expanded && (
          <button
            type="button"
            onClick={() => setShowKeys((v) => !v)}
            className="text-[11px] text-white/25 cursor-pointer hover:text-white/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            {showKeys ? "Hide" : "Show"} details
          </button>
        )}
      </div>

      {expanded && (
        <TicketGroup
          tickets={tickets}
          showKeys={showKeys}
          showAssignee={label === "Upcoming"}
        />
      )}
    </section>
  );
}
