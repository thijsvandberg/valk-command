import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityToast } from "@/components/sync/SyncToast";
import { SWRProvider } from "@/components/SWRProvider";
import { CommandPalette } from "@/components/command-palette";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DeployNotifier } from "@/components/DeployNotifier";
import { KeyboardShortcutsModal } from "@/components/shared/KeyboardShortcutsModal";
import { TaskCompletionNotifier } from "@/components/chat/TaskCompletionNotifier";
import { FocusModeWrapper } from "@/components/FocusModeWrapper";

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
