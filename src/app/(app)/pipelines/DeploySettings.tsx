"use client";

import { useState } from "react";
import { Bell, Rocket, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Pause, OctagonX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useNotification } from "@/hooks/useNotification";
import { useDeploySettings } from "@/hooks/usePipelines";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";

function stateIcon(state: PipelineRunPayload["state"], size = 12) {
  switch (state) {
    case "SUCCESSFUL":
      return <CheckCircle2 size={size} strokeWidth={2} className="text-emerald-400" />;
    case "FAILED":
      return <XCircle size={size} strokeWidth={2} className="text-red-400" />;
    case "IN_PROGRESS":
      return <Loader2 size={size} strokeWidth={2} className="text-[var(--color-brand-400)] animate-spin" />;
    case "PAUSED":
      return <Pause size={size} strokeWidth={2} className="text-amber-400" />;
    case "STOPPED":
      return <OctagonX size={size} strokeWidth={2} className="text-amber-400/70" />;
  }
}

// -- Deployment Timeline --

export function DeploymentTimeline({ runs }: { runs: PipelineRunPayload[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const deployments = runs.filter((r) => r.isDeployment && r.state !== "IN_PROGRESS");
  if (deployments.length === 0) return null;

  // Group by date
  const byDate = new Map<string, PipelineRunPayload[]>();
  for (const d of deployments) {
    const date = new Date(d.completedAt ?? d.createdAt).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(d);
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 cursor-pointer group"
      >
        <Rocket size={14} strokeWidth={1.5} className="text-violet-400/60" />
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider group-hover:text-text-secondary transition-colors duration-150">
          Deployment Timeline
        </span>
        <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-caption font-medium text-violet-400/60 tabular-nums">
          {deployments.length}
        </span>
        {collapsed ? (
          <ChevronDown size={12} strokeWidth={1.5} className="text-text-muted" />
        ) : (
          <ChevronUp size={12} strokeWidth={1.5} className="text-text-muted" />
        )}
      </button>
      {!collapsed && (
        <div className="space-y-4">
          {Array.from(byDate.entries()).map(([date, deploys]) => (
            <div key={date}>
              <span className="text-label font-medium text-text-muted uppercase tracking-wider">{date}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {deploys.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm ${
                      d.state === "SUCCESSFUL"
                        ? "border-emerald-500/15 bg-emerald-500/[0.04]"
                        : d.state === "FAILED"
                        ? "border-red-500/15 bg-red-500/[0.04]"
                        : "border-border-default bg-overlay-subtle"
                    }`}
                  >
                    {stateIcon(d.state, 12)}
                    <span className="font-medium text-text-secondary">{d.environment}</span>
                    {d.ticketKey && (
                      <Link
                        href={`/tickets/${d.ticketKey}`}
                        className="font-mono text-label text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer"
                      >
                        {d.ticketKey}
                      </Link>
                    )}
                    <span className="text-caption text-text-muted">{d.repo}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Deploy Notification Settings --

export function DeploySettingsPanel() {
  const { settings, update } = useDeploySettings();
  const { permission, requestPermission } = useNotification();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  function toggleEnabled() {
    if (!settings) return;
    const next = { ...settings, enabled: !settings.enabled };
    if (next.enabled && permission === "default") requestPermission();
    update(next);
  }

  function toggleEnvironment(env: string) {
    if (!settings) return;
    update({ ...settings, environments: { ...settings.environments, [env]: !settings.environments[env] } });
  }

  const enabledEnvCount = Object.values(settings.environments).filter(Boolean).length;
  const totalEnvCount = Object.keys(settings.environments).length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        icon={<Bell size={13} strokeWidth={1.5} className={settings.enabled ? "text-[var(--color-brand-400)]" : ""} />}
        onClick={() => setOpen(!open)}
        title="Notification settings"
        aria-label="Notification settings"
      />

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-[260px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-3.5 pb-2.5">
              <h3 className="text-body-sm font-semibold text-text-secondary">Deploy notifications</h3>
              <p className="text-label text-text-muted mt-0.5">
                Browser alerts when deployments complete for followed tickets.
              </p>
            </div>

            {permission === "denied" && (
              <div className="mx-3 mb-2 rounded-md bg-red-500/[0.06] border border-red-500/10 px-3 py-1.5">
                <p className="text-label text-red-400/70">Notifications blocked by browser settings.</p>
              </div>
            )}

            {/* Master toggle */}
            <button
              type="button"
              onClick={toggleEnabled}
              className="w-full flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-overlay-subtle transition-colors duration-150"
            >
              <span className="text-body-sm text-text-secondary">
                {settings.enabled ? "Enabled" : "Disabled"}
                {settings.enabled && (
                  <span className="ml-1.5 text-caption text-text-muted">{enabledEnvCount}/{totalEnvCount}</span>
                )}
              </span>
              <span className={`relative inline-flex items-center h-5 w-8 rounded-full transition-colors duration-150 ${
                settings.enabled ? "bg-[var(--color-brand-500)]" : "bg-white/10"
              }`}>
                <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                  settings.enabled ? "translate-x-[14px]" : "translate-x-[3px]"
                }`} />
              </span>
            </button>

            {/* Environment checkboxes */}
            {settings.enabled && (
              <div className="border-t border-border-default py-1">
                {Object.entries(settings.environments).map(([env, on]) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => toggleEnvironment(env)}
                    className="w-full flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-overlay-subtle transition-colors duration-150"
                  >
                    <span className={`flex items-center justify-center h-3.5 w-3.5 rounded border text-caption shrink-0 ${
                      on ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]" : "border-white/15"
                    }`}>
                      {on && "\u2713"}
                    </span>
                    <span className={`text-body-sm ${on ? "text-text-secondary" : "text-text-muted"}`}>{env}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
