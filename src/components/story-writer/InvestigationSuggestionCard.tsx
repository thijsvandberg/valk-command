"use client";

import { useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { SuggestionCard, AppliedBadge } from "@/components/story-writer/SuggestionCard";
import { JIRA_COMMENT_LIMIT } from "@/lib/jira-content-limits";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";

/**
 * Renders an AI investigation result (BRDG-435) inside the chat. The body shows
 * the finding as nicely rendered markdown (matching the ticket description and
 * the rest of the chat) and the PO can click it to refine in the same rich-text
 * editor used for the description, then post it as a Jira comment in one click.
 * Posting is an external write, so the body stays editable until it succeeds and
 * a failed post keeps the text so nothing is lost.
 */
export function InvestigationSuggestionCard({
  result,
  onPostComment,
}: {
  result: string;
  onPostComment: (text: string) => Promise<void>;
}) {
  const [value, setValue] = useState(result);
  const [editing, setEditing] = useState(false);
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
      setEditing(false);
    } catch {
      setError("Failed to post comment to Jira");
    } finally {
      setPosting(false);
    }
  };

  // Click the rendered finding to refine it, mirroring the description editor.
  // Ignore clicks that carry a text selection or land on an interactive child
  // (ticket-ref pills are anchors, expand blocks are <summary>) so reading and
  // following links never accidentally drops into edit mode.
  const handleContentClick = (e: React.MouseEvent) => {
    if (posted) return;
    if (window.getSelection()?.toString()) return;
    if ((e.target as HTMLElement).closest("a, button, summary")) return;
    setEditing(true);
  };

  return (
    <SuggestionCard
      icon={<Search size={11} strokeWidth={1.5} className="shrink-0 text-text-muted" />}
      title="Investigation"
      headerRight={posted ? <AppliedBadge /> : undefined}
    >
      <div className="space-y-2 p-3">
        {editing && !posted ? (
          <RichEditor
            value={value}
            onChange={(markdown) => {
              setValue(markdown);
              setError(null);
            }}
            onSave={() => setEditing(false)}
            placeholder="Refine the investigation before posting..."
            minHeight={180}
            actions={
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="cursor-pointer shrink-0 flex items-center rounded h-7 px-2.5 text-body-sm font-medium text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary active:scale-[0.97] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Done
              </button>
            }
          />
        ) : (
          <div
            onClick={handleContentClick}
            className={`description-content chat-markdown text-body-lg leading-prose ${posted ? "" : "cursor-pointer"}`}
            title={posted ? undefined : "Click to edit"}
          >
            {renderMarkdown(value, { linkifyRefs: true })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {posted ? (
            <span />
          ) : (
            <span
              className={`text-caption tabular-nums ${
                overLimit ? "text-[var(--color-status-error)]" : "text-text-muted"
              }`}
            >
              {value.length.toLocaleString("en-US")} / {JIRA_COMMENT_LIMIT.toLocaleString("en-US")}
            </span>
          )}

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
