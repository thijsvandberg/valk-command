"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StakeholderTicket } from "@/lib/stakeholder-data";
import { TicketGroup } from "./TicketGroup";

interface UpcomingSectionProps {
  sprintName: string;
  tickets: StakeholderTicket[];
}

export function UpcomingSection({ sprintName, tickets }: UpcomingSectionProps) {
  const [showKeys, setShowKeys] = useState(false);

  if (tickets.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-body-sm font-semibold uppercase tracking-[0.12em] text-text-tertiary">
          Upcoming &mdash; {sprintName}
        </h2>
        <button
          type="button"
          onClick={() => setShowKeys((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-label text-text-muted cursor-pointer hover:bg-hover-list-item hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className={`transition-transform duration-150 ${showKeys ? "rotate-180" : ""}`}
          />
          {showKeys ? "Hide" : "Show"} details
        </button>
      </div>
      <TicketGroup tickets={tickets} showKeys={showKeys} />
    </section>
  );
}
