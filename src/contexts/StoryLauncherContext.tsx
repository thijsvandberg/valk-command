"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

// Lazy: the launcher is heavy and rarely the first thing a session needs, so it
// stays out of the app-shell bundle until first opened (same as the layout's
// other modals).
const StoryWriterLauncherModal = dynamic(
  () => import("@/components/shared/StoryWriterLauncherModal").then((m) => ({ default: m.StoryWriterLauncherModal })),
);

interface StoryLauncherContextValue {
  openLauncher: () => void;
}

const NOOP = () => {};

// Default to a no-op so a consumer rendered outside the provider degrades
// silently instead of crashing.
const StoryLauncherContext = createContext<StoryLauncherContextValue>({ openLauncher: NOOP });

/**
 * Mounts a single Story Writer launcher modal at the app shell and hands every
 * descendant an opener. The nav dropdown unmounts itself on close, so the modal
 * cannot live inside it; hoisting it here lets any NavPanel mount point (header
 * and fullscreen refinement) trigger the same modal without duplication.
 */
export function StoryLauncherProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Gate the dynamic mount on first open so the chunk only loads when the user
  // actually asks for it; once mounted it stays and just renders null when closed.
  const [everOpened, setEverOpened] = useState(false);

  const openLauncher = () => {
    setEverOpened(true);
    setOpen(true);
  };

  return (
    <StoryLauncherContext.Provider value={{ openLauncher }}>
      {children}
      {everOpened && <StoryWriterLauncherModal open={open} onClose={() => setOpen(false)} />}
    </StoryLauncherContext.Provider>
  );
}

export function useStoryLauncher(): StoryLauncherContextValue {
  return useContext(StoryLauncherContext);
}
