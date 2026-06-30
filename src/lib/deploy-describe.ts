import type { LastDeployedInfo } from "@/hooks/usePipelines";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";

// A plain-language, one-sentence summary of the most recent deploy for a tooltip.
// Single source of truth so the statusline (StatusChangeLine) and the ticket hover
// card (TicketStatusPill) read identically and can't drift apart.
export function describeDeploy(deploy: LastDeployedInfo): string {
  const env = deploy.environment;
  // Absolute date with the relative "xx ago" appended in parentheses for quick orientation.
  const stamp = deploy.completedAt
    ? `${formatAbsoluteDate(deploy.completedAt, { weekday: true })} (${relativeDate(deploy.completedAt)})`
    : null;
  if (deploy.state === "SUCCESSFUL") {
    return `Last deployed to ${env} successfully${stamp ? ` on ${stamp}` : ""}.`;
  }
  if (deploy.state === "FAILED") {
    return `The last deploy to ${env} failed${stamp ? ` on ${stamp}` : ""}.`;
  }
  const status = deploy.state.toLowerCase().replace(/_/g, " ").replace("inprogress", "in progress");
  return `Deploy to ${env} is ${status}${stamp ? `, as of ${stamp}` : ""}.`;
}
