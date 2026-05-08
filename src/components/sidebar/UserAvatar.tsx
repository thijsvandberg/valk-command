"use client";

import { useUser } from "@clerk/nextjs";
import { forwardRef } from "react";
import { User } from "lucide-react";

interface UserAvatarProps {
  collapsed: boolean;
  onClick: () => void;
  open: boolean;
}

export const UserAvatar = forwardRef<HTMLButtonElement, UserAvatarProps>(
  function UserAvatar({ collapsed, onClick, open }, ref) {
    const { user } = useUser();

    const initials = user
      ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}`
      : "";

    const hasImage = !!user?.imageUrl;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="User menu"
        className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"} rounded-lg ${collapsed ? "px-0 py-1.5" : "px-2 py-1.5"} text-xs cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-overlay-default text-text-secondary"
            : "text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary active:bg-overlay-default"
        }`}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden"
          style={{
            backgroundColor: hasImage ? "transparent" : "rgba(14, 142, 136, 0.18)",
            border: hasImage ? "none" : "1px solid rgba(14, 142, 136, 0.25)",
          }}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : initials ? (
            <span className="text-[10px] font-semibold tracking-wide text-[var(--color-brand-300)]">
              {initials}
            </span>
          ) : (
            <User className="h-3.5 w-3.5 text-[var(--color-brand-300)]" strokeWidth={1.5} />
          )}
        </span>
        {!collapsed && user?.firstName && (
          <span className="truncate font-[var(--font-body)] text-inherit">
            {user.firstName}
          </span>
        )}
      </button>
    );
  },
);
