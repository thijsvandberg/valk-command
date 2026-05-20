"use client";

import { useState, useEffect, useCallback } from "react";
import type { TicketDetail } from "@/types/ticket";
import { Trash2, Flag } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/Button";
import { tickets } from "@/lib/api-client";
import { renderMarkdown } from "./renderMarkdown";

export function CommentsSection({
  ticketKey,
  jiraComments,
}: {
  ticketKey: string;
  jiraComments: TicketDetail["jiraComments"];
}) {
  const [poComments, setPoComments] = useState<Array<{ id: string; author: string; content: string; createdAt: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadComments() {
      try {
        const data = await tickets.getComments(ticketKey) as { poComments?: Array<{ id: string; author: string; content: string; createdAt: string }> };
        setPoComments(data.poComments ?? []);
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setLoading(false);
      }
    }
    loadComments();
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
        <SectionHeader title="PO Comments" count={poComments.length} />
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
                className="w-full resize-none rounded-lg border border-border-default bg-overlay-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
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
                  <span className="text-xs font-medium text-text-secondary">{comment.author || "Product Owner"}</span>
                  <span className="text-caption text-text-muted">{isSending ? "Posting..." : new Date(comment.createdAt).toLocaleString()}</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    iconOnly
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto hidden group-hover:flex !text-text-muted hover:!text-[#e5534b]"
                    title="Delete comment"
                    aria-label="Delete comment"
                    icon={<Trash2 size={14} strokeWidth={1.2} />}
                  />
                </div>
                <div className="description-content mt-1 text-sm leading-[1.7] text-text-secondary">{renderMarkdown(comment.content)}</div>
              </div>
            </div>
            );
          })}

          {!loading && poComments.length === 0 && !newComment.trim() && (
            <p className="pl-10 text-xs text-text-muted">No comments yet</p>
          )}
        </div>
      </div>

      {/* Jira Comments */}
      {jiraComments.length > 0 && (
        <div>
          <SectionHeader title="Jira Comments" count={jiraComments.length} />
          <div className="mt-3 space-y-4">
            {jiraComments.map((comment) => {
              const isFlagComment = /flag_on|Flag added|flag_off|Flag removed/i.test(comment.content);
              return (
                <div
                  key={comment.id}
                  id={`jira-comment-${comment.id}`}
                  className={`flex gap-3 ${isFlagComment ? "rounded-lg border-l-[3px] border-l-[#e5534b] bg-[#e5534b]/[0.04] py-3 pr-3 pl-2.5" : ""}`}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold text-white"
                    style={{ backgroundColor: comment.authorColor }}
                  >
                    {comment.authorInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-secondary">{comment.authorName}</span>
                      <span className="text-caption text-text-muted">{new Date(comment.createdAt).toLocaleString()}</span>
                      {isFlagComment && (
                        <Flag size={11} strokeWidth={1.5} className="text-[#e5534b]" fill="#e5534b" />
                      )}
                    </div>
                    <div className="description-content mt-1 text-sm leading-[1.7] text-text-secondary">
                      {renderMarkdown(
                        isFlagComment
                          ? comment.content.replace(/^:?flag_on:?\s*Flag added\s*/i, "").replace(/^:?flag_off:?\s*Flag removed\s*/i, "").trim()
                          : comment.content
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
