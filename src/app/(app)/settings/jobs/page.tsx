import type { Metadata } from "next";
import JobsPanel from "@/components/jobs/JobsPanel";

export const metadata: Metadata = { title: "Workspace Jobs - Settings" };

export default function WorkspaceJobsPage() {
  return (
    <>
      <h2 className="text-xs font-medium text-text-secondary uppercase tracking-[0.06em] mb-2">
        Workspace Jobs
      </h2>
      <p className="text-xs text-text-tertiary mb-6 leading-[1.6]">
        Recurring jobs that run on a cron schedule and trigger skills on the remote workspace agent.
      </p>
      <JobsPanel />
    </>
  );
}
