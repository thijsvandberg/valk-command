"use client";

import { useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { SuggestionCard, AppliedBadge } from "@/components/story-writer/SuggestionCard";
import { JIRA_COMMENT_LIMIT } from "@/lib/jira-content-limits";

/**
 * Renders an AI investigation result (BRDG-435) as an editable chat suggestion.
 * The PO can refine the text and post it as a Jira comment in one click. Posting
 * is an external write, so the body stays editable until it succeeds and a failed
 * post keeps the text so nothing is lost.
 */
export function InvestigationSuggestionCard({
  result,
  onPostComment,
}: {
  result: string;
  onPostComment: (text: string) => Promise<void>;
}) {
  const [value, setValue] = useState(result);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const overLimit = value.length > JIRA_COMMENT_LIMIT;
  const canPost = trimmed.length > 0 && !overLimit && !posting && !posted;

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      await onPostComment(trimmed);
      setPosted(true);
    } catch {
      setError("Failed to post comment to Jira");
    } finally {
      setPosting(false);
    }
  };

  return (
    <SuggestionCard
      icon={<Search size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />}
      title="Investigation"
      headerRight={posted ? <AppliedBadge /> : undefined}
    >
      <div className="space-y-2 p-3">
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          disabled={posting || posted}
          rows={10}
          aria-label="Investigation result"
          className="w-full resize-y rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 text-body-lg leading-prose text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none disabled:opacity-60"
        />

        <div className="flex items-center justify-between gap-3">
          <span
            className={`text-caption tabular-nums ${
              overLimit ? "text-[var(--color-status-error)]" : "text-text-muted"
            }`}
          >
            {value.length.toLocaleString("en-US")} / {JIRA_COMMENT_LIMIT.toLocaleString("en-US")}
          </span>

          {posted ? (
            <span className="flex items-center gap-1.5 text-body-sm text-[var(--color-brand-400)]">
              <Check size={13} strokeWidth={2} />
              Comment posted to Jira
            </span>
          ) : (
            <button
              type="button"
              onClick={handlePost}
              disabled={!canPost}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-caption font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] active:scale-[0.97] transition-[background-color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              {posting && <Loader2 size={11} className="animate-spin" />}
              Post as comment
            </button>
          )}
        </div>

        {overLimit && !posted && (
          <p className="text-body-sm text-[var(--color-status-error)]">
            Too long for a Jira comment. Trim it by{" "}
            {(value.length - JIRA_COMMENT_LIMIT).toLocaleString("en-US")} characters before posting.
          </p>
        )}
        {error && <p className="text-body-sm text-[var(--color-status-error)]">{error}</p>}
      </div>
    </SuggestionCard>
  );
}
