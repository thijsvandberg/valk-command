"use client";

import { useState, useRef } from "react";
import { formatTimeAgo, formatExactTime, LATE_SYNC_THRESHOLD_MS } from "./notification-utils";

export function TimeAgo({ createdAt, eventAt }: { createdAt: string; eventAt?: string | null }) {
  const [visible, setVisible] = useState(false);
  const [syncVisible, setSyncVisible] = useState(false);
  const [pos, setPos] = useState<"above" | "below">("above");
  const ref = useRef<HTMLSpanElement>(null);
  const syncRef = useRef<HTMLSpanElement>(null);

  const displayIso = eventAt ?? createdAt;
  const syncGapMs = eventAt ? new Date(createdAt).getTime() - new Date(eventAt).getTime() : 0;
  const isLateSync = syncGapMs > LATE_SYNC_THRESHOLD_MS;

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos(rect.top > 60 ? "above" : "below");
    }
    setVisible(true);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        ref={ref}
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
      >
        <span className="text-caption text-text-muted tabular-nums cursor-default select-none">
          {formatTimeAgo(displayIso)}
        </span>
        {visible && (
          <span
            className={`pointer-events-none absolute right-0 z-tooltip whitespace-nowrap rounded-md border border-border-strong bg-surface-floating px-2.5 py-1.5 text-label text-text-secondary shadow-md ${
              pos === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
            }`}
          >
            {formatExactTime(displayIso)}
          </span>
        )}
      </span>
      {isLateSync && (
        <span
          ref={syncRef}
          className="relative inline-block"
          onMouseEnter={() => setSyncVisible(true)}
          onMouseLeave={() => setSyncVisible(false)}
        >
          <span className="text-caption text-text-muted tabular-nums cursor-default select-none">
            (synced {formatTimeAgo(createdAt)})
          </span>
          {syncVisible && (
            <span
              className={`pointer-events-none absolute right-0 z-tooltip whitespace-nowrap rounded-md border border-border-strong bg-surface-floating px-2.5 py-1.5 text-label text-text-secondary shadow-md ${
                pos === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
              }`}
            >
              Synced at {formatExactTime(createdAt)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
