export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-default pb-2">
      <h3 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
          {count}
        </span>
      )}
    </div>
  );
}
