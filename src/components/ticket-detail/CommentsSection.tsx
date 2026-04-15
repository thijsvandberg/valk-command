"use client";

import { useState, useEffect, useCallback } from "react";
import type { TicketDetail } from "@/types/ticket";
import { Trash2 } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/Button";
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
        const res = await fetch(`/api/tickets/${ticketKey}/comments`);
        if (res.ok) {
          const data = await res.json();
          setPoComments(data.poComments ?? []);
        }
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
      const res = await fetch(`/api/tickets/${ticketKey}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      const created = await res.json();
      setPoComments((prev) =>
        prev.map((c) => (c.id === optimisticId ? created : c))
      );
    } catch {
      setPoComments((prev) => prev.filter((c) => c.id !== optimisticId));
    }
  }, [ticketKey, newComment]);

  const handleDeleteComment = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketKey}/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPoComments((prev) => prev.filter((c) => c.id !== id));
      }
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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-[10px] font-semibold text-white">
              PO
            </div>
            <div className="min-w-0 flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a PO comment..."
                rows={2}
                className="w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
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
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-[10px] font-semibold text-white">
                PO
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/60">{comment.author || "Product Owner"}</span>
                  <span className="text-[10px] text-white/25">{isSending ? "Posting..." : new Date(comment.createdAt).toLocaleString()}</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    iconOnly
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto hidden group-hover:flex !text-white/20 hover:!text-[#e5534b]"
                    title="Delete comment"
                    icon={<Trash2 size={14} strokeWidth={1.2} />}
                  />
                </div>
                <div className="description-content mt-1 text-sm leading-[1.7] text-white/50">{renderMarkdown(comment.content)}</div>
              </div>
            </div>
            );
          })}

          {!loading && poComments.length === 0 && !newComment.trim() && (
            <p className="pl-10 text-xs text-white/20">No comments yet</p>
          )}
        </div>
      </div>

      {/* Jira Comments */}
      {jiraComments.length > 0 && (
        <div>
          <SectionHeader title="Jira Comments" count={jiraComments.length} />
          <div className="mt-3 space-y-4">
            {jiraComments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: comment.authorColor }}
                >
                  {comment.authorInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white/60">{comment.authorName}</span>
                    <span className="text-[10px] text-white/25">{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="description-content mt-1 text-sm leading-[1.7] text-white/50">{renderMarkdown(comment.content)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
