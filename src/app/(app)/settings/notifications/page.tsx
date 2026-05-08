"use client";

import { useNotification } from "@/hooks/useNotification";
import { Bell, BellOff, ShieldCheck, ShieldX, GitBranch, Rocket, GitPullRequest, RefreshCw, BookOpen, Info, Zap, Bot, Timer } from "lucide-react";
import useSWR from "swr";
import { swrFetcher, settings } from "@/lib/api-client";
import type { NotificationCategory, NotificationPreferences } from "@/lib/notification-preferences";

type CategoryMeta = {
  label: string;
  description: string;
  icon: React.ReactNode;
};

const CATEGORY_META: Record<NotificationCategory, CategoryMeta> = {
  "story-writer": {
    label: "Story writer",
    description: "Draft completions, failures, and low quality score alerts.",
    icon: <BookOpen size={14} strokeWidth={1.5} />,
  },
  pipeline: {
    label: "Pipelines",
    description: "Build pipeline failures and unexpected stops.",
    icon: <GitBranch size={14} strokeWidth={1.5} />,
  },
  deployment: {
    label: "Deployments",
    description: "Deployment completions and failures to any environment.",
    icon: <Rocket size={14} strokeWidth={1.5} />,
  },
  pr: {
    label: "Pull requests",
    description: "PR opened or merged for sprint tickets.",
    icon: <GitPullRequest size={14} strokeWidth={1.5} />,
  },
  sync: {
    label: "Jira sync",
    description: "Sync completions and failures. Off by default.",
    icon: <RefreshCw size={14} strokeWidth={1.5} />,
  },
  general: {
    label: "General",
    description: "Miscellaneous system notifications.",
    icon: <Zap size={14} strokeWidth={1.5} />,
  },
  system: {
    label: "System",
    description: "Critical system messages and errors.",
    icon: <Info size={14} strokeWidth={1.5} />,
  },
  agent: {
    label: "Agent tasks",
    description: "Task completions and failures from the remote workspace.",
    icon: <Bot size={14} strokeWidth={1.5} />,
  },
  scheduler: {
    label: "Scheduler",
    description: "Scheduled job failures and completions.",
    icon: <Timer size={14} strokeWidth={1.5} />,
  },
};

const CATEGORY_ORDER: NotificationCategory[] = [
  "agent",
  "story-writer",
  "pipeline",
  "deployment",
  "pr",
  "scheduler",
  "sync",
  "general",
  "system",
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
        enabled
          ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/30"
          : "border-border-strong bg-overlay-default"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          enabled ? "translate-x-[1.375rem]" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function NotificationsPage() {
  const { enabled, setEnabled, permission, requestPermission } = useNotification();

  const { data, mutate } = useSWR<{ preferences: NotificationPreferences }>(
    "/api/settings/notification-preferences",
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const preferences = data?.preferences;

  const permissionGranted = permission === "granted";
  const permissionDenied = permission === "denied";

  const handleBrowserToggle = async () => {
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

  const handleCategoryToggle = async (category: NotificationCategory, value: boolean) => {
    if (!preferences) return;
    const updated = { ...preferences, [category]: value };
    await mutate(
      async () => {
        await settings.saveNotificationPrefs({ preferences: updated });
        return { preferences: updated };
      },
      { optimisticData: { preferences: updated }, rollbackOnError: true },
    );
  };

  return (
    <>
      <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.06em] text-text-secondary">
        Browser Notifications
      </h2>

      <div className="flex flex-col gap-4">
        {/* Main toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border-default bg-overlay-subtle p-4">
          <div className="flex items-center gap-3">
            {enabled ? (
              <Bell size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            ) : (
              <BellOff size={16} strokeWidth={1.5} className="text-text-tertiary" />
            )}
            <div>
              <p className="text-sm font-medium text-text-primary">Desktop notifications</p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
                Get notified when a chat or story writer response completes while you are in another tab.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleBrowserToggle}
            disabled={permissionDenied}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40 ${
              enabled
                ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/30"
                : "border-border-strong bg-overlay-default"
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
        <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-overlay-subtle px-4 py-3">
          {permissionGranted ? (
            <>
              <ShieldCheck size={14} strokeWidth={1.5} className="text-emerald-400/70" />
              <span className="text-xs text-text-tertiary">Browser permission granted</span>
            </>
          ) : permissionDenied ? (
            <>
              <ShieldX size={14} strokeWidth={1.5} className="text-red-400/70" />
              <span className="text-xs text-text-tertiary">
                Browser permission denied. Reset it in your browser&apos;s site settings.
              </span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} strokeWidth={1.5} className="text-text-muted" />
              <span className="text-xs text-text-tertiary">
                Browser permission will be requested when you enable notifications.
              </span>
            </>
          )}
        </div>

        {/* Info */}
        <p className="text-label leading-relaxed text-text-muted">
          Notifications are only sent when the Bridge tab is not in focus.
          Chat responses and story writer completions will trigger a desktop notification
          so you can multitask without watching the tab.
        </p>
      </div>

      <h2 className="mb-5 mt-10 text-xs font-medium uppercase tracking-[0.06em] text-text-secondary">
        Notification Categories
      </h2>

      <div className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border-default bg-overlay-subtle overflow-hidden">
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const isEnabled = preferences ? (preferences[category] ?? true) : true;

          return (
            <div key={category} className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className={isEnabled ? "text-[var(--color-brand-400)]" : "text-text-muted"}>
                  {meta.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-text-secondary">{meta.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{meta.description}</p>
                </div>
              </div>
              <Toggle
                enabled={isEnabled}
                onChange={(v) => handleCategoryToggle(category, v)}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-label leading-relaxed text-text-muted">
        Disabled categories are silently ignored. They will not appear in the notification bell even if triggered.
      </p>
    </>
  );
}
