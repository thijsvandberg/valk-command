"use client";

import { useEffect } from "react";
import { TicketHistory } from "@/components/ticket-detail/TicketHistory";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function HistoryApp() {
  const writer = useWriterContext();
  const { registerToolbar, unregisterToolbar } = usePaneContext();

  useEffect(() => {
    registerToolbar("history", { label: "History" });
    return () => unregisterToolbar("history");
  }, [registerToolbar, unregisterToolbar]);

  if (!writer.ticketData) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <TicketHistory ticket={writer.ticketData} embedded />
    </div>
  );
}
