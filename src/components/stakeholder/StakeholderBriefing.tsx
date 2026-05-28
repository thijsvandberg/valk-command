"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, BookOpen, X } from "lucide-react";
import { AiInsightsPanel } from "./AiInsightsPanel";
import type { AnalysisType, UseStakeholderAnalysisReturn } from "@/hooks/useStakeholderAnalysis";
import { useLocalStorage } from "@/hooks/useLocalStorage";

function GeneratePrompt({
  type,
  disabled,
  onGenerate,
}: {
  type: AnalysisType;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const label = type === "brief" ? "Status Brief" : "Sprint Insights";
  const description =
    type === "brief"
      ? "A concise narrative summarising sprint progress and any risk signals worth noting."
      : "A content-focused analysis: what the sprint is delivering, why it matters, and what to watch.";
  const Icon = type === "brief" ? Sparkles : BookOpen;

  return (
    <div className="rounded-xl border border-border-default bg-overlay-subtle px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]/50 shrink-0" />
        <span className="text-body-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-400)]/50">
          AI {label}
        </span>
      </div>
      <p className="text-body-sm text-text-tertiary leading-relaxed">{description}</p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm bg-overlay-default text-text-secondary cursor-pointer hover:bg-overlay-strong hover:text-text-secondary transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <Icon size={11} strokeWidth={1.5} />
        Generate {label}
      </button>
    </div>
  );
}

export interface StakeholderBriefingProps {
  open: boolean;
  onClose: () => void;
  analysis: UseStakeholderAnalysisReturn;
  currentDonePoints: number;
  currentTodoCount: number;
  anyRunning: boolean;
  onGenerate: (type: AnalysisType) => void;
  dismissed: Record<AnalysisType, boolean>;
  onDismiss: (type: AnalysisType) => void;
  storedBriefRisks: string[];
}

export function StakeholderBriefing({
  open,
  onClose,
  analysis,
  currentDonePoints,
  currentTodoCount,
  anyRunning,
  onGenerate,
  dismissed,
  onDismiss,
  storedBriefRisks,
}: StakeholderBriefingProps) {
  const [drawerWidth, setDrawerWidth] = useLocalStorage<number>("bridge:ai-drawer-width", 520);
  const drawerRef = useRef<HTMLDivElement>(null);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeState.current || !drawerRef.current) return;
      const delta = resizeState.current.startX - e.clientX;
      const newWidth = Math.max(340, Math.min(900, resizeState.current.startWidth + delta));
      drawerRef.current.style.width = `${newWidth}px`;
    }
    function onMouseUp(e: MouseEvent) {
      if (!resizeState.current) return;
      const delta = resizeState.current.startX - e.clientX;
      const newWidth = Math.max(340, Math.min(900, resizeState.current.startWidth + delta));
      setDrawerWidth(newWidth);
      resizeState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [setDrawerWidth]);

  function onResizeHandleMouseDown(e: React.MouseEvent) {
    if (!drawerRef.current) return;
    resizeState.current = {
      startX: e.clientX,
      startWidth: drawerRef.current.offsetWidth,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }

  if (!open) return null;

  const briefLive = analysis.liveState["brief"];
  const deepDiveLive = analysis.liveState["deep-dive"];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 z-[201] flex flex-col border-l border-border-default bg-[var(--color-surface-elevated)]"
        style={{ width: drawerWidth, maxWidth: "90vw", boxShadow: "-8px 0 32px rgba(0,0,0,0.5)" }}
      >
        {/* Resize handle */}
        <div
          onMouseDown={onResizeHandleMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--color-brand-400)]/20 transition-colors duration-150"
          aria-hidden
        />

        {/* Drawer header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-default px-5 py-3.5">
          <span className="text-body-sm font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            AI Analysis
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI analysis"
            className="rounded p-1 text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Brief panel or generate prompt */}
          {!dismissed.brief && (() => {
            const briefVisible = briefLive.status !== "idle" || !!(analysis.brief?.narrative || analysis.brief?.content);
            return briefVisible ? (
              <AiInsightsPanel
                type="brief"
                live={briefLive}
                narrative={analysis.brief?.narrative ?? null}
                risks={storedBriefRisks}
                content={analysis.brief?.content ?? null}
                generatedAt={analysis.brief?.completedAt ?? null}
                isStale={analysis.isStale(analysis.brief, currentDonePoints, currentTodoCount)}
                onDismiss={() => onDismiss("brief")}
                onRetry={() => onGenerate("brief")}
                defaultCollapsed={false}
                inDrawer
              />
            ) : (
              <GeneratePrompt type="brief" disabled={anyRunning} onGenerate={() => onGenerate("brief")} />
            );
          })()}

          {/* Divider between sections when both are visible */}
          {!dismissed.brief && !dismissed["deep-dive"] && (
            <div className="h-px bg-overlay-default" />
          )}

          {/* Deep Dive panel or generate prompt */}
          {!dismissed["deep-dive"] && (() => {
            const deepDiveVisible = deepDiveLive.status !== "idle" || !!analysis.deepDive?.content;
            return deepDiveVisible ? (
              <AiInsightsPanel
                type="deep-dive"
                live={deepDiveLive}
                narrative={null}
                risks={[]}
                content={analysis.deepDive?.content ?? null}
                generatedAt={analysis.deepDive?.completedAt ?? null}
                isStale={analysis.isStale(analysis.deepDive, currentDonePoints, currentTodoCount)}
                onDismiss={() => onDismiss("deep-dive")}
                onRetry={() => onGenerate("deep-dive")}
                defaultCollapsed={false}
                inDrawer
              />
            ) : (
              <GeneratePrompt type="deep-dive" disabled={anyRunning} onGenerate={() => onGenerate("deep-dive")} />
            );
          })()}
        </div>
      </div>
    </>,
    document.body,
  );
}
