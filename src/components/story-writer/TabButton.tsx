"use client";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: boolean;
}

export function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3.5 py-3 text-sm font-medium cursor-pointer transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
        active
          ? "text-white/90 after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-[var(--color-brand-400)] after:rounded-full"
          : "text-white/35 hover:text-white/60 active:text-white/50"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
      )}
    </button>
  );
}
