import Sidebar from "@/components/Sidebar";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityToast } from "@/components/sync/SyncToast";
import { SWRProvider } from "@/components/SWRProvider";
import { CommandPalette } from "@/components/command-palette";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DeployNotifier } from "@/components/DeployNotifier";
import { KeyboardShortcutsModal } from "@/components/shared/KeyboardShortcutsModal";
import { TaskCompletionNotifier } from "@/components/chat/TaskCompletionNotifier";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
    <ActivityProvider>
      <div className="flex flex-col h-screen bg-[var(--color-surface-base)] text-text-primary">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-lg focus:bg-[var(--color-brand-600)] focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:shadow-lg focus:outline-none"
        >
          Skip to content
        </a>
        {/* Full-width header — ViewHeader portals its content here */}
        <div id="view-header-portal" className="shrink-0" />
        {/* Sidebar + content below the header */}
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main id="main-content" className="flex-1 overflow-auto isolate">
            {children}
          </main>
        </div>
      </div>
      <ActivityToast />
      <TaskCompletionNotifier />
      <CommandPalette />
      <GlobalSearch />
      <KeyboardShortcutsModal />
      <DeployNotifier />
    </ActivityProvider>
    </SWRProvider>
  );
}
