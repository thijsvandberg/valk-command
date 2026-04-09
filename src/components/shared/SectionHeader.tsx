export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
      <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
          {count}
        </span>
      )}
    </div>
  );
}
