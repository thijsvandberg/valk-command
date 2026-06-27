"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { User } from "lucide-react";
import { useAccountMenuItems } from "@/components/sidebar/accountMenuItems";

interface UserProfilePopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onNavigate?: () => void;
}

const MENU_ITEM_COUNT = 4;
const SIGN_OUT_IDX = MENU_ITEM_COUNT;

export function UserProfilePopover({
  open,
  onClose,
  triggerRef,
  onNavigate,
}: UserProfilePopoverProps) {
  const { user } = useUser();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ bottom: number; left: number }>({
    bottom: 0,
    left: 0,
  });

  const { menuItems, signOutItem, allItems } = useAccountMenuItems({
    onClose,
    onNavigate,
  });

  // Position popover above the trigger
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
    });
  }, [open, triggerRef]);

  useOutsideClick([triggerRef, popoverRef], onClose, { enabled: open });

  const disabledIndices = useMemo(
    () => new Set(allItems.map((item, i) => (item.disabled ? i : -1)).filter((i) => i !== -1)),
    [allItems],
  );

  const { activeIndex: activeIdx, setActiveIndex: setActiveIdx, handlers: keyNavHandlers } = useKeyboardNav(
    allItems.length,
    disabledIndices,
    {
      enabled: open,
      onEscape: onClose,
      onSelect: useCallback((idx: number) => {
        const item = allItems[idx];
        if (item && !item.disabled) item.action();
      }, [allItems]),
    },
  );

  if (!open) return null;

  const initials = user
    ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}`
    : "";
  const hasImage = !!user?.imageUrl;

  return createPortal(
    <div
      ref={popoverRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={keyNavHandlers.onKeyDown}
      className="fixed w-64 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]"
      style={{
        zIndex: 60,
        bottom: pos.bottom,
        left: pos.left,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden"
          style={{
            backgroundColor: hasImage
              ? "transparent"
              : "color-mix(in srgb, var(--color-brand-500) 18%, transparent)",
            border: hasImage
              ? "none"
              : "1px solid color-mix(in srgb, var(--color-brand-500) 25%, transparent)",
          }}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user!.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : initials ? (
            <span className="text-body-sm font-semibold tracking-wide text-[var(--color-brand-300)]">
              {initials}
            </span>
          ) : (
            <User className="h-4 w-4 text-[var(--color-brand-300)]" strokeWidth={1.5} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-lg font-medium text-text-primary">
            {user?.fullName ?? "User"}
          </div>
          <div className="truncate text-label text-text-tertiary">
            {user?.primaryEmailAddress?.emailAddress ?? ""}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-overlay-default" />

      {/* Menu items */}
      <div className="py-1.5">
        {menuItems.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={item.action}
            onMouseEnter={() => !item.disabled && setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(-1)}
            className={`flex w-full items-center gap-2.5 px-3.5 py-[7px] text-body-sm cursor-pointer transition-colors duration-100 ${
              item.disabled
                ? "opacity-40 cursor-not-allowed"
                : activeIdx === idx
                  ? "bg-hover-list-item text-text-secondary"
                  : "text-text-secondary hover:bg-hover-list-item hover:text-text-secondary"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            <span className={item.disabled ? "text-text-muted" : "text-text-tertiary"}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.secondaryLabel && (
              <span className="text-caption text-text-muted">
                {item.secondaryLabel}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-overlay-default" />

      {/* Sign out */}
      <div className="py-1.5">
        <button
          type="button"
          role="menuitem"
          onClick={signOutItem.action}
          onMouseEnter={() => setActiveIdx(SIGN_OUT_IDX)}
          onMouseLeave={() => setActiveIdx(-1)}
          className={`flex w-full items-center gap-2.5 px-3.5 py-[7px] text-body-sm cursor-pointer transition-colors duration-100 ${
            activeIdx === SIGN_OUT_IDX
              ? "bg-red-500/8 text-red-400/90"
              : "text-red-400/60 hover:bg-red-500/8 hover:text-red-400/90"
          } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
        >
          <span>{signOutItem.icon}</span>
          <span>{signOutItem.label}</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
