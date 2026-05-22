"use client";

import {
  CATEGORY_CONFIG,
  ALL_CATEGORIES,
  type ConversationCategory,
} from "@/lib/conversation-category";

interface ConversationFilterBarProps {
  categoryCounts: Record<ConversationCategory, number>;
  activeFilters: Set<ConversationCategory>;
  onToggle: (category: ConversationCategory) => void;
  onClearAll: () => void;
}

export default function ConversationFilterBar({
  categoryCounts,
  activeFilters,
  onToggle,
  onClearAll,
}: ConversationFilterBarProps) {
  const visibleCategories = ALL_CATEGORIES.filter((cat) => categoryCounts[cat] > 0);

  // Only render when conversations span 2+ categories
  if (visibleCategories.length < 2) return null;

  const isAllActive = activeFilters.size === 0;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-3 pb-2"
      role="group"
      aria-label="Conversation type filters"
      data-testid="conversation-filter-bar"
    >
      <button
        type="button"
        onClick={onClearAll}
        className={[
          "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-100 cursor-pointer",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
          isAllActive
            ? "bg-[var(--color-brand-400)]/15 text-[var(--color-brand-400)]"
            : "bg-overlay-subtle text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary",
        ].join(" ")}
      >
        All
      </button>

      {visibleCategories.map((category) => {
        const config = CATEGORY_CONFIG[category];
        const isActive = activeFilters.has(category);
        const Icon = config.icon;

        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            data-testid={`filter-pill-${category}`}
            className={[
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-100 cursor-pointer",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
              isActive
                ? "text-text-primary"
                : "bg-overlay-subtle text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary",
            ].join(" ")}
            style={isActive ? {
              backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
              color: config.color,
            } : undefined}
          >
            <Icon size={11} strokeWidth={2} />
            <span>{config.label}</span>
            <span
              className={[
                "rounded-full px-1 py-px text-[10px] leading-tight tabular-nums",
                isActive ? "opacity-70" : "bg-overlay-default",
              ].join(" ")}
              style={isActive ? {
                backgroundColor: `color-mix(in srgb, ${config.color} 20%, transparent)`,
              } : undefined}
            >
              {categoryCounts[category]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
