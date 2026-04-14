export default function StakeholderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-surface-base)] overflow-y-auto">
      {children}
    </div>
  );
}
