"use client";

import { useEffect } from "react";
import { useEpicProgress } from "@/hooks/useEpics";
import { setEpicColorMap } from "@/lib/epic-color-registry";

// Loads the PO-assigned epic colors from the progress payload and pushes them
// into the module-level registry that getEpicColor() reads. Mounting this once
// per tree (app shell + stakeholder view) is enough; it renders only children.
// Refreshes whenever SWR revalidates progress (e.g. after an epic sync).
export function EpicColorProvider({ children }: { children: React.ReactNode }) {
  const { data } = useEpicProgress();

  useEffect(() => {
    if (!data) return;
    setEpicColorMap(data.map((e) => ({ key: e.key, name: e.name, color: e.color })));
  }, [data]);

  return <>{children}</>;
}
