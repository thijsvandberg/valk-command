import dynamic from "next/dynamic";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityToast } from "@/components/sync/SyncToast";
import { SWRProvider } from "@/components/SWRProvider";
import { FocusModeWrapper } from "@/components/FocusModeWrapper";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);
const GlobalSearch = dynamic(
  () => import("@/components/GlobalSearch").then((m) => ({ default: m.GlobalSearch })),
  { ssr: false },
);
const DeployNotifier = dynamic(
  () => import("@/components/DeployNotifier").then((m) => ({ default: m.DeployNotifier })),
  { ssr: false },
);
const KeyboardShortcutsModal = dynamic(
  () => import("@/components/shared/KeyboardShortcutsModal").then((m) => ({ default: m.KeyboardShortcutsModal })),
  { ssr: false },
);
const TaskCompletionNotifier = dynamic(
  () => import("@/components/chat/TaskCompletionNotifier").then((m) => ({ default: m.TaskCompletionNotifier })),
  { ssr: false },
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
    <ActivityProvider>
      <FocusModeWrapper>
        {children}
      </FocusModeWrapper>
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
