"use client";

import { useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import type { ScheduledJob } from "@/db/schema";
import { isValidCron } from "@/lib/cron";

interface CreateFormState {
  name: string;
  cronExpression: string;
  skillName: string;
}

const EMPTY_FORM: CreateFormState = { name: "", cronExpression: "", skillName: "" };

function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return "Never";
  return new Date(lastRunAt).toLocaleString();
}

function JobRow({
  job,
  onToggle,
  onDelete,
}: {
  job: ScheduledJob;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-[var(--font-display)] text-sm font-semibold text-white truncate">
            {job.name}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              job.enabled
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-white/10 text-white/40"
            }`}
          >
            {job.enabled ? "active" : "paused"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-white/40">
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-white/60">
            {job.cronExpression}
          </code>
          <span>{job.skillName}</span>
          <span>Last run: {formatLastRun(job.lastRunAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onToggle(job.id, !job.enabled)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30 ${
            job.enabled
              ? "bg-white/[0.08] text-white/70 hover:bg-white/[0.14] active:bg-white/[0.18]"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 active:bg-emerald-500/40"
          }`}
        >
          {job.enabled ? "Pause" : "Enable"}
        </button>
        <button
          onClick={() => onDelete(job.id)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400 active:bg-red-500/20 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500/30"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

interface CreateFormProps {
  onSubmit: (form: CreateFormState) => Promise<void>;
  onCancel: () => void;
}

function CreateForm({ onSubmit, onCancel }: CreateFormProps) {
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);

  function handleCronChange(value: string) {
    setForm((f) => ({ ...f, cronExpression: value }));
    if (value && !isValidCron(value)) {
      setCronError('Must be a valid 5-field cron expression (e.g. "0 9 * * 1-5")');
    } else {
      setCronError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidCron(form.cronExpression)) {
      setCronError('Must be a valid 5-field cron expression (e.g. "0 9 * * 1-5")');
      return;
    }
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
  }

  const fieldClass =
    "w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[var(--color-brand-500)] focus:bg-white/[0.07]";
  const labelClass = "block text-xs font-medium text-white/50 mb-1";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4"
    >
      <h3 className="font-[var(--font-display)] text-sm font-semibold text-white">New scheduled job</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            required
            placeholder="Daily standup brief"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Skill name</label>
          <input
            type="text"
            required
            placeholder="morning-brief"
            value={form.skillName}
            onChange={(e) => setForm((f) => ({ ...f, skillName: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Cron expression</label>
          <input
            type="text"
            required
            placeholder="0 9 * * 1-5"
            value={form.cronExpression}
            onChange={(e) => handleCronChange(e.target.value)}
            className={`${fieldClass} font-mono ${cronError ? "border-red-500/50" : ""}`}
          />
          {cronError && (
            <p className="mt-1 text-xs text-red-400">{cronError}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80 active:bg-white/[0.10] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || Boolean(cronError)}
          className="rounded-lg bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_8px_0_var(--color-brand-900)] transition-colors hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          {submitting ? "Creating..." : "Create job"}
        </button>
      </div>
    </form>
  );
}

export default function JobsPanel() {
  const { jobs, loading, error, createJob, updateJob, deleteJob } = useJobs();
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(form: CreateFormState) {
    const result = await createJob(form);
    if (result) setShowForm(false);
  }

  async function handleToggle(id: string, enabled: boolean) {
    await updateJob(id, { enabled });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-white/40">
          {loading ? "Loading..." : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_8px_0_var(--color-brand-900)] transition-colors hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            New job
          </button>
        )}
      </div>

      {showForm && (
        <CreateForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {!loading && jobs.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-white/[0.08] px-6 py-12 text-center">
          <p className="text-sm text-white/30">No scheduled jobs yet.</p>
          <p className="mt-1 text-xs text-white/20">Create a job to automate recurring workspace tasks.</p>
        </div>
      )}

      <div className="space-y-2">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            onToggle={handleToggle}
            onDelete={deleteJob}
          />
        ))}
      </div>
    </div>
  );
}
