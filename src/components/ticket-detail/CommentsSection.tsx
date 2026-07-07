"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import type { TicketDetail, JiraComment } from "@/types/ticket";
import { Trash2, Flag, Send, Check, User } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Tooltip } from "@/components/shared/Tooltip";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { SECTION_KEYS } from "@/lib/section-collapse-store";
import { Button } from "@/components/ui/Button";
import { tickets } from "@/lib/api-client";
import { renderMarkdown } from "./renderMarkdown";
import { usePrismLanguages } from "@/hooks/usePrismLanguages";

export function CommentsSection({
  ticketKey,
  jiraComments,
  onMutate,
  liveHighlight = false,
}: {
  ticketKey: string;
  jiraComments: TicketDetail["jiraComments"];
  onMutate?: () => void;
  /** A comment just arrived via a live update: pulse the newest one (BRDG-338). */
  liveHighlight?: boolean;
}) {
  const [poComments, setPoComments] = useState<Array<{ id: string; author: string; content: string; createdAt: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  const allCommentText = useMemo(() => jiraComments.map((c) => c.content).join("\n"), [jiraComments]);
  usePrismLanguages(allCommentText);

  useEffect(() => {
    // The container (TicketTabContent) is not keyed by ticket.key, so ticketKey changes in
    // place: guard against an in-flight response for the previous ticket overwriting the panel.
    let cancelled = false;
    setLoading(true);
    async function loadComments() {
      try {
        const data = await tickets.getComments(ticketKey) as { poComments?: Array<{ id: string; author: string; content: string; createdAt: string }> };
        if (!cancelled) setPoComments(data.poComments ?? []);
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadComments();
    return () => { cancelled = true; };
  }, [ticketKey]);

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim()) return;
    const content = newComment.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      author: "Product Owner",
      content,
      createdAt: new Date().toISOString(),
    };
    setPoComments((prev) => [...prev, optimistic]);
    setNewComment("");

    try {
      const created = await tickets.addComment(ticketKey, { content }) as { id: string; author: string; content: string; createdAt: string };
      setPoComments((prev) =>
        prev.map((c) => (c.id === optimisticId ? created : c))
      );
    } catch {
      setPoComments((prev) => prev.filter((c) => c.id !== optimisticId));
    }
  }, [ticketKey, newComment]);

  const handleDeleteComment = useCallback(async (id: string) => {
    try {
      await tickets.deleteComment(ticketKey, id);
      setPoComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticketKey]);

  return (
    <div className="mt-8 space-y-8">
      {/* PO Comments */}
      <div>
        <SectionHeader title="PO Comments" count={poComments.length} sectionKey={SECTION_KEYS.poComments}>
        <div className="mt-3 space-y-3">
          {/* Add comment */}
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-caption font-semibold text-white">
              PO
            </div>
            <div className="min-w-0 flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a PO comment..."
                rows={2}
                className="w-full resize-none rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 text-body-lg text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleAddComment();
                  }
                }}
              />
              {newComment.trim() && (
                <div className="mt-1.5 flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddComment}
                  >
                    Comment
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Existing PO comments */}
          {poComments.map((comment) => {
            const isSending = comment.id.startsWith("optimistic-");
            return (
            <div key={comment.id} className={`group flex gap-3 ${isSending ? "opacity-50" : ""}`}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-caption font-semibold text-white">
                PO
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-medium text-text-secondary">{comment.author || "Product Owner"}</span>
                  <span className="text-caption text-text-muted">{isSending ? "Posting..." : new Date(comment.createdAt).toLocaleString()}</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    iconOnly
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto hidden group-hover:flex !text-text-muted hover:!text-[var(--color-status-error)]"
                    title="Delete comment"
                    aria-label="Delete comment"
                    icon={<Trash2 size={14} strokeWidth={1.2} />}
                  />
                </div>
                <div className="description-content mt-1 text-body-lg leading-prose text-text-secondary">{renderMarkdown(comment.content, { linkifyRefs: true })}</div>
              </div>
            </div>
            );
          })}

          {!loading && poComments.length === 0 && !newComment.trim() && (
            <p className="pl-10 text-body-sm text-text-muted">No comments yet</p>
          )}
        </div>
        </SectionHeader>
      </div>

      {/* Jira Comments */}
      <JiraCommentsSection
        ticketKey={ticketKey}
        jiraComments={jiraComments}
        onMutate={onMutate}
        liveHighlight={liveHighlight}
      />
    </div>
  );
}

function JiraCommentsSection({
  ticketKey,
  jiraComments,
  onMutate,
  liveHighlight = false,
}: {
  ticketKey: string;
  jiraComments: TicketDetail["jiraComments"];
  onMutate?: () => void;
  liveHighlight?: boolean;
}) {
  const [newJiraComment, setNewJiraComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticJiraComments, setOptimisticJiraComments] = useState<JiraComment[]>([]);
  const postedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { user } = useUser();
  const userInitials = user
    ? `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}`
    : "";
  const hasUserImage = !!user?.imageUrl;

  // Drop optimistic entries once the sync confirms them via the prop
  useEffect(() => {
    setOptimisticJiraComments(prev =>
      prev.filter(opt => !jiraComments.some(real => real.id === opt.id))
    );
  }, [jiraComments]);

  const allJiraComments = useMemo(
    () => [
      ...jiraComments,
      ...optimisticJiraComments.filter(opt => !jiraComments.some(real => real.id === opt.id)),
    ],
    [jiraComments, optimisticJiraComments]
  );

  const handlePostJiraComment = useCallback(async () => {
    if (!newJiraComment.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const created = await tickets.addJiraComment(ticketKey, { content: newJiraComment.trim() });
      setNewJiraComment("");
      setOptimisticJiraComments(prev => [...prev, created]);
      setPosted(true);
      onMutate?.();
      clearTimeout(postedTimerRef.current);
      postedTimerRef.current = setTimeout(() => setPosted(false), 2500);
    } catch {
      setError("Failed to post comment to Jira");
    } finally {
      setPosting(false);
    }
  }, [ticketKey, newJiraComment, posting, onMutate]);

  return (
    <div>
      <SectionHeader title="Jira Comments" count={allJiraComments.length} sectionKey={SECTION_KEYS.jiraComments}>
      <div className="mt-3 space-y-4">
        {[...allJiraComments].reverse().map((comment, idx) => {
          const isFlagComment = /flag_on|Flag added|flag_off|Flag removed/i.test(comment.content);
          // Newest first after the reverse: a live-arrived comment pulses once.
          const pulse = liveHighlight && idx === 0;
          return (
            <div
              key={comment.id}
              id={`jira-comment-${comment.id}`}
              className={`flex gap-3 ${pulse ? "live-pulse rounded-lg" : ""} ${isFlagComment ? "rounded-lg border-l-[3px] border-l-[var(--color-status-error)] bg-[var(--color-status-error)]/[0.04] py-3 pr-3 pl-2.5" : ""}`}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold text-white"
                style={{ backgroundColor: comment.authorColor }}
              >
                {comment.authorInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-medium text-text-secondary">{comment.authorName}</span>
                  <Tooltip content={formatAbsoluteDate(comment.createdAt)}>
                    <span className="text-caption text-text-muted">{relativeDate(comment.createdAt)}</span>
                  </Tooltip>
                  {isFlagComment && (
                    <Flag size={11} strokeWidth={1.5} className="text-[var(--color-status-error)]" fill="var(--color-status-error)" />
                  )}
                </div>
                <div className="description-content mt-1 text-body-lg leading-prose text-text-secondary">
                  {renderMarkdown(
                    isFlagComment
                      ? comment.content.replace(/^:?flag_on:?\s*Flag added\s*/i, "").replace(/^:?flag_off:?\s*Flag removed\s*/i, "").trim()
                      : comment.content,
                    { linkifyRefs: true }
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Post a Jira comment */}
        <div className="flex gap-3 pt-1">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden"
            style={{
              backgroundColor: hasUserImage ? "transparent" : "var(--color-brand-600)",
            }}
          >
            {hasUserImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : userInitials ? (
              <span className="text-caption font-semibold text-white">
                {userInitials}
              </span>
            ) : (
              <User className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="relative">
              <textarea
                value={newJiraComment}
                onChange={(e) => { setNewJiraComment(e.target.value); setError(null); }}
                placeholder="Post a comment to Jira..."
                rows={2}
                disabled={posting}
                className="w-full resize-none rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 pr-10 text-body-lg text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handlePostJiraComment();
                  }
                }}
              />
              {newJiraComment.trim() && (
                <button
                  type="button"
                  onClick={handlePostJiraComment}
                  disabled={posting}
                  className="absolute right-2 bottom-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                  title="Post to Jira (Cmd+Enter)"
                  aria-label="Post comment to Jira"
                >
                  <Send size={12} strokeWidth={2} />
                </button>
              )}
            </div>
            {posted && (
              <div
                className="mt-1.5 flex items-center gap-1.5 text-body-sm text-[var(--color-brand-400)]"
                style={{ animation: "fadeInUp 0.15s ease" }}
              >
                <Check size={13} strokeWidth={2} />
                <span>Comment posted to Jira</span>
              </div>
            )}
            {error && (
              <p className="mt-1.5 text-body-sm text-[var(--color-status-error)]">{error}</p>
            )}
          </div>
        </div>

        {allJiraComments.length === 0 && !newJiraComment.trim() && !posted && (
          <p className="pl-10 text-body-sm text-text-muted">No Jira comments</p>
        )}
      </div>
      </SectionHeader>
    </div>
  );
}
