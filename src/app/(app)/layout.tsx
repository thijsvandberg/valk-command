import dynamic from "next/dynamic";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityToast } from "@/components/sync/SyncToast";
import { SWRProvider } from "@/components/SWRProvider";
import { FocusModeWrapper } from "@/components/FocusModeWrapper";
import { EpicColorProvider } from "@/components/shared/EpicColorProvider";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => ({ default: m.CommandPalette })),
);
const GlobalSearch = dynamic(
  () => import("@/components/GlobalSearch").then((m) => ({ default: m.GlobalSearch })),
);
const DeployNotifier = dynamic(
  () => import("@/components/DeployNotifier").then((m) => ({ default: m.DeployNotifier })),
);
const KeyboardShortcutsModal = dynamic(
  () => import("@/components/shared/KeyboardShortcutsModal").then((m) => ({ default: m.KeyboardShortcutsModal })),
);
const TaskCompletionNotifier = dynamic(
  () => import("@/components/chat/TaskCompletionNotifier").then((m) => ({ default: m.TaskCompletionNotifier })),
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
    <ClientErrorReporter />
    <ActivityProvider>
      <EpicColorProvider>
      <FocusModeWrapper>
        {children}
      </FocusModeWrapper>
      </EpicColorProvider>
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
