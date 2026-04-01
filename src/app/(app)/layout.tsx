import Sidebar from "@/components/Sidebar";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityToast } from "@/components/sync/SyncToast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActivityProvider>
      <div className="flex h-screen bg-[var(--color-surface-base)] text-white">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <ActivityToast />
    </ActivityProvider>
  );
}
