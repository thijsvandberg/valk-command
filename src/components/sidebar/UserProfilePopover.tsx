"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  Moon,
  Bell,
  Command,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface UserProfilePopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onNavigate?: () => void;
}

interface MenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  secondaryLabel?: string;
  disabled?: boolean;
  destructive?: boolean;
  action: () => void;
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
  const { signOut } = useClerk();
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ bottom: number; left: number }>({
    bottom: 0,
    left: 0,
  });
  const [activeIdx, setActiveIdx] = useState(-1);

  const handleSignOut = useCallback(async () => {
    await apiFetch("/api/dev/bypass", { method: "DELETE" }).catch(() => {});
    await signOut();
    globalThis.location.assign("/login");
  }, [signOut]);

  const iconClass = "h-3.5 w-3.5 shrink-0";

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        id: "theme",
        icon: <Moon className={iconClass} strokeWidth={1.5} />,
        label: "Theme",
        secondaryLabel: "Coming soon",
        disabled: true,
        action: () => {},
      },
      {
        id: "notifications",
        icon: <Bell className={iconClass} strokeWidth={1.5} />,
        label: "Notifications",
        action: () => {
          router.push("/settings/notifications");
          onNavigate?.();
          onClose();
        },
      },
      {
        id: "shortcuts",
        icon: <Command className={iconClass} strokeWidth={1.5} />,
        label: "Keyboard shortcuts",
        action: () => {
          onClose();
          requestAnimationFrame(() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              }),
            );
          });
        },
      },
      {
        id: "settings",
        icon: <Settings className={iconClass} strokeWidth={1.5} />,
        label: "Settings",
        action: () => {
          router.push("/settings");
          onNavigate?.();
          onClose();
        },
      },
    ],
    [router, onNavigate, onClose],
  );

  const signOutItem: MenuItem = useMemo(
    () => ({
      id: "signout",
      icon: <LogOut className={iconClass} strokeWidth={1.5} />,
      label: "Sign out",
      destructive: true,
      action: handleSignOut,
    }),
    [handleSignOut],
  );

  const allItems = useMemo(
    () => [...menuItems, signOutItem],
    [menuItems, signOutItem],
  );

  // Position popover above the trigger
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
    });
  }, [open, triggerRef]);

  // Click outside: check both trigger and popover
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose, triggerRef]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Keyboard navigation
  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      const enabledIndices = allItems
        .map((item, i) => (item.disabled ? -1 : i))
        .filter((i) => i !== -1);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentPos = enabledIndices.indexOf(activeIdx);
        const next =
          currentPos < enabledIndices.length - 1
            ? enabledIndices[currentPos + 1]
            : enabledIndices[0];
        setActiveIdx(next ?? 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentPos = enabledIndices.indexOf(activeIdx);
        const prev =
          currentPos > 0
            ? enabledIndices[currentPos - 1]
            : enabledIndices[enabledIndices.length - 1];
        setActiveIdx(prev ?? 0);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIdx(enabledIndices[0] ?? 0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIdx(enabledIndices[enabledIndices.length - 1] ?? 0);
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        const item = allItems[activeIdx];
        if (item && !item.disabled) item.action();
      }
    },
    [activeIdx, allItems],
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
      onKeyDown={handleKeyNav}
      className="fixed w-64 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]"
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
              : "rgba(26, 111, 194, 0.18)",
            border: hasImage
              ? "none"
              : "1px solid rgba(26, 111, 194, 0.25)",
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
            <span className="text-xs font-semibold tracking-wide text-[var(--color-brand-300)]">
              {initials}
            </span>
          ) : (
            <User className="h-4 w-4 text-[var(--color-brand-300)]" strokeWidth={1.5} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white/80">
            {user?.fullName ?? "User"}
          </div>
          <div className="truncate text-[11px] text-white/30">
            {user?.primaryEmailAddress?.emailAddress ?? ""}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06]" />

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
                  ? "bg-hover-list-item text-white/75"
                  : "text-white/50 hover:bg-hover-list-item hover:text-white/75"
            }`}
          >
            <span className={item.disabled ? "text-white/25" : "text-white/30"}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.secondaryLabel && (
              <span className="text-[10px] text-white/20">
                {item.secondaryLabel}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06]" />

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
          }`}
        >
          <span>{signOutItem.icon}</span>
          <span>{signOutItem.label}</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
