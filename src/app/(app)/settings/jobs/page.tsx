import type { Metadata } from "next";
import JobsPanel from "@/components/jobs/JobsPanel";

export const metadata: Metadata = { title: "Workspace Jobs - Settings" };

export default function WorkspaceJobsPage() {
  return (
    <>
      <h2 className="text-body-sm font-medium text-text-secondary uppercase tracking-label mb-2">
        Workspace Jobs
      </h2>
      <p className="text-body-sm text-text-tertiary mb-6 leading-body">
        Recurring jobs that run on a cron schedule and trigger skills on the remote workspace agent.
      </p>
      <JobsPanel />
    </>
  );
}
