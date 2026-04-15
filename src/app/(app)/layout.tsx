import Sidebar from "@/components/Sidebar";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityToast } from "@/components/sync/SyncToast";
import { SWRProvider } from "@/components/SWRProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DeployNotifier } from "@/components/DeployNotifier";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
    <ActivityProvider>
      <div className="flex flex-col h-screen bg-[var(--color-surface-base)] text-white">
        {/* Full-width header — ViewHeader portals its content here */}
        <div id="view-header-portal" className="shrink-0" />
        {/* Sidebar + content below the header */}
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
      <ActivityToast />
      <CommandPalette />
      <GlobalSearch />
      <DeployNotifier />
    </ActivityProvider>
    </SWRProvider>
  );
}
