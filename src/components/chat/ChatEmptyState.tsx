import { MessageCircle } from "lucide-react";

export default function ChatEmptyState() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center px-8"
      data-testid="chat-empty-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface-floating)] border border-white/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
        <MessageCircle className="h-6 w-6 text-white/30" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/80">
        Select a conversation
      </h3>
      <p className="mt-2 max-w-sm text-center font-[var(--font-body)] text-sm leading-[1.7] text-white/40">
        Choose an existing conversation from the sidebar or start a new one to send tasks to the workspace.
      </p>
    </div>
  );
}
