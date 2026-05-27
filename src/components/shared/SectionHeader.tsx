export function SectionHeader({
  title,
  count,
  countLabel,
  actions,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border-default pb-2">
      <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">{title}</h3>
      {countLabel ? (
        <span className="flex h-5 items-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
          {countLabel}
        </span>
      ) : count !== undefined && count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
          {count}
        </span>
      )}
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
