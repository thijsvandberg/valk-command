"use client";

import { useNotification } from "@/hooks/useNotification";
import { Bell, BellOff, ShieldCheck, ShieldX } from "lucide-react";

export default function NotificationsPage() {
  const { enabled, setEnabled, permission, requestPermission } = useNotification();

  const permissionGranted = permission === "granted";
  const permissionDenied = permission === "denied";

  const handleToggle = async () => {
    if (!enabled) {
      if (permission === "default") {
        const result = await requestPermission();
        if (result !== "granted") return;
      }
      setEnabled(true);
    } else {
      setEnabled(false);
    }
  };

  return (
    <>
      <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.06em] text-white/50">
        Browser Notifications
      </h2>

      <div className="flex flex-col gap-4">
        {/* Main toggle */}
        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            {enabled ? (
              <Bell size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            ) : (
              <BellOff size={16} strokeWidth={1.5} className="text-white/30" />
            )}
            <div>
              <p className="text-sm font-medium text-white/80">Desktop notifications</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/40">
                Get notified when a chat or story writer response completes while you are in another tab.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={permissionDenied}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40 ${
              enabled
                ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/30"
                : "border-white/[0.10] bg-white/[0.06]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                enabled ? "translate-x-[1.375rem]" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Permission status */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-3">
          {permissionGranted ? (
            <>
              <ShieldCheck size={14} strokeWidth={1.5} className="text-emerald-400/70" />
              <span className="text-xs text-white/40">Browser permission granted</span>
            </>
          ) : permissionDenied ? (
            <>
              <ShieldX size={14} strokeWidth={1.5} className="text-red-400/70" />
              <span className="text-xs text-white/40">
                Browser permission denied. Reset it in your browser&apos;s site settings.
              </span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} strokeWidth={1.5} className="text-white/20" />
              <span className="text-xs text-white/40">
                Browser permission will be requested when you enable notifications.
              </span>
            </>
          )}
        </div>

        {/* Info */}
        <p className="text-[11px] leading-relaxed text-white/25">
          Notifications are only sent when the Bridge tab is not in focus.
          Chat responses and story writer completions will trigger a desktop notification
          so you can multitask without watching the tab.
        </p>
      </div>
    </>
  );
}
