"use client";

import { CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { useJiraHealth } from "@/hooks/useSprintBoard";
import { useConfluenceHealth } from "@/hooks/useSprintBoard";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type StatusState = "ok" | "error" | "unconfigured" | "loading";

function StatusIcon({ state }: { state: StatusState }) {
  if (state === "loading") {
    return <RefreshCw size={14} strokeWidth={1.5} className="animate-spin text-white/20" />;
  }
  if (state === "ok") {
    return <CheckCircle2 size={14} strokeWidth={1.5} className="text-[#4aaa60]" />;
  }
  if (state === "unconfigured") {
    return <AlertCircle size={14} strokeWidth={1.5} className="text-white/25" />;
  }
  return <XCircle size={14} strokeWidth={1.5} className="text-[#e5534b]" />;
}

function StatusLabel({ state, errorMsg }: { state: StatusState; errorMsg?: string }) {
  if (state === "loading") return <span className="text-xs text-white/30">Checking...</span>;
  if (state === "ok") return <span className="text-xs text-[#4aaa60]/80">Connected</span>;
  if (state === "unconfigured") return <span className="text-xs text-white/25">Not configured</span>;
  return <span className="text-xs text-[#e5534b]/80" title={errorMsg}>Error</span>;
}

function IntegrationRow({
  name,
  description,
  state,
  errorMsg,
  onRetest,
  docsUrl,
}: {
  name: string;
  description: string;
  state: StatusState;
  errorMsg?: string;
  onRetest: () => void;
  docsUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <StatusIcon state={state} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white/70">{name}</p>
            {docsUrl && (
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/15 cursor-pointer hover:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{ transition: "color 0.15s ease" }}
                title="Documentation"
              >
                <ExternalLink size={11} strokeWidth={1.5} />
              </a>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-white/35">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        <StatusLabel state={state} errorMsg={errorMsg} />
        <button
          type="button"
          onClick={onRetest}
          disabled={state === "unconfigured" || state === "loading"}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-white/40 cursor-pointer hover:bg-white/[0.06] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        >
          Test
        </button>
      </div>
    </div>
  );
}

function deriveState(
  isLoading: boolean,
  data: { ok: boolean; live: boolean; error?: string } | undefined,
): { state: StatusState; errorMsg?: string } {
  if (isLoading && !data) return { state: "loading" };
  if (!data) return { state: "unconfigured" };
  if (!data.live && data.error === "Jira credentials not configured") return { state: "unconfigured" };
  if (!data.live && data.error === "Confluence credentials not configured") return { state: "unconfigured" };
  if (data.ok) return { state: "ok" };
  return { state: "error", errorMsg: data.error };
}

export default function IntegrationsPage() {
  const { data: jiraData, isLoading: jiraLoading, mutate: jiraMutate } = useJiraHealth();
  const { data: confluenceData, isLoading: confluenceLoading, mutate: confluenceMutate } = useConfluenceHealth();
  const { data: bbData, isLoading: bbLoading, mutate: bbMutate } = useSWR<{ ok: boolean; live: boolean; error?: string }>(
    "/api/workspace-tasks/health",
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const jira = deriveState(jiraLoading, jiraData);
  const confluence = deriveState(confluenceLoading, confluenceData);
  // Bitbucket: use workspace-tasks health as a proxy for connectivity
  const bitbucketState: StatusState = bbLoading && !bbData ? "loading" : bbData?.ok ? "ok" : "unconfigured";

  return (
    <>
      <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.06em] text-white/50">
        Integrations
      </h2>

      <p className="mb-6 text-xs leading-relaxed text-white/30">
        Credentials are configured via environment variables in{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/50">.env.local</code>.
        Use the test buttons to verify connectivity.
      </p>

      <div className="flex flex-col divide-y divide-white/[0.04] rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <IntegrationRow
          name="Jira"
          description="Ticket sync, sprint data, and issue management."
          state={jira.state}
          errorMsg={jira.errorMsg}
          onRetest={() => jiraMutate()}
        />
        <IntegrationRow
          name="Confluence"
          description="Page linking, search, and inline previews in ticket details."
          state={confluence.state}
          errorMsg={confluence.errorMsg}
          onRetest={() => confluenceMutate()}
        />
        <IntegrationRow
          name="Bitbucket"
          description="Branches, pull requests, and pipeline status per ticket."
          state={bitbucketState}
          onRetest={() => bbMutate()}
        />
      </div>

      <div className="mt-6 rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-3">
        <p className="text-[11px] leading-relaxed text-white/25">
          To update credentials, edit{" "}
          <code className="font-mono text-white/40">.env.local</code> and restart the dev server.
          All tokens are server-side only and are never exposed to the browser.
        </p>
      </div>
    </>
  );
}
