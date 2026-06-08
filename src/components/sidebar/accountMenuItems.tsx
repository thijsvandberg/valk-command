"use client";

import { useMemo, useCallback } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Moon, Sun, Bell, Command, Settings, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useTheme } from "@/contexts/ThemeContext";

export interface AccountMenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  secondaryLabel?: string;
  disabled?: boolean;
  destructive?: boolean;
  action: () => void;
}

interface UseAccountMenuItemsOptions {
  /** Called after a destination is chosen (e.g. to close the surrounding panel). */
  onClose?: () => void;
  /** Called when navigating away (e.g. to also dismiss a mobile drawer). */
  onNavigate?: () => void;
  /** Tailwind class for the leading icons; lets each surface size them to taste. */
  iconClass?: string;
}

/**
 * Single source of truth for the account actions shared by the legacy
 * UserProfilePopover and the bento launcher's account view. Centralising the
 * sign-out flow here keeps the destructive logic from drifting between the two.
 */
export function useAccountMenuItems({
  onClose,
  onNavigate,
  iconClass = "h-3.5 w-3.5 shrink-0",
}: UseAccountMenuItemsOptions = {}): {
  menuItems: AccountMenuItem[];
  signOutItem: AccountMenuItem;
  allItems: AccountMenuItem[];
} {
  const { signOut } = useClerk();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = useCallback(async () => {
    await apiFetch("/api/dev/bypass", { method: "DELETE" }).catch(() => {});
    await signOut();
    globalThis.location.assign("/login");
  }, [signOut]);

  const menuItems = useMemo<AccountMenuItem[]>(
    () => [
      {
        id: "theme",
        icon: theme === "dark"
          ? <Sun className={iconClass} strokeWidth={1.5} />
          : <Moon className={iconClass} strokeWidth={1.5} />,
        label: "Theme",
        secondaryLabel: theme === "dark" ? "Dark" : "Light",
        action: () => {
          toggleTheme();
        },
      },
      {
        id: "notifications",
        icon: <Bell className={iconClass} strokeWidth={1.5} />,
        label: "Notifications",
        action: () => {
          router.push("/settings/notifications");
          onNavigate?.();
          onClose?.();
        },
      },
      {
        id: "shortcuts",
        icon: <Command className={iconClass} strokeWidth={1.5} />,
        label: "Keyboard shortcuts",
        action: () => {
          onClose?.();
          window.dispatchEvent(new Event("valk:openKeyboardShortcuts"));
        },
      },
      {
        id: "settings",
        icon: <Settings className={iconClass} strokeWidth={1.5} />,
        label: "Settings",
        action: () => {
          router.push("/settings");
          onNavigate?.();
          onClose?.();
        },
      },
    ],
    [router, onNavigate, onClose, theme, toggleTheme, iconClass],
  );

  const signOutItem = useMemo<AccountMenuItem>(
    () => ({
      id: "signout",
      icon: <LogOut className={iconClass} strokeWidth={1.5} />,
      label: "Sign out",
      destructive: true,
      action: handleSignOut,
    }),
    [handleSignOut, iconClass],
  );

  const allItems = useMemo(
    () => [...menuItems, signOutItem],
    [menuItems, signOutItem],
  );

  return { menuItems, signOutItem, allItems };
}
