export default function ChatEmptyState() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center px-8"
      data-testid="chat-empty-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface-floating)] border border-white/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-white/30">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
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
