import Sidebar from "@/components/Sidebar";
import { SyncProvider } from "@/contexts/SyncContext";
import { SyncToast } from "@/components/sync/SyncToast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SyncProvider>
      <div className="flex h-screen bg-[var(--color-surface-base)] text-white">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <SyncToast />
    </SyncProvider>
  );
}
