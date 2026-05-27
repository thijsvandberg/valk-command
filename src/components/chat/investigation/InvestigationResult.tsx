"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lightbulb, Layers, AlertTriangle } from "lucide-react";
import type { InvestigationData } from "@/lib/investigation-parser";
import { markdownComponents } from "../markdown-components";
import { CopyActions } from "../CopyActions";
import { CollapsibleSection } from "./CollapsibleSection";
import { RelatedStoriesSection } from "./RelatedStoriesSection";
import { KeyFilesSection } from "./KeyFilesSection";
import { StakeholderSummaryCard } from "./StakeholderSummaryCard";

interface InvestigationResultProps {
  data: InvestigationData;
  rawContent: string;
}

export function InvestigationResult({ data, rawContent }: InvestigationResultProps) {
  const collapseDetails = data.isLong;

  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="border-b border-border-default pb-3">
        <p className="font-[var(--font-display)] text-heading-sm font-semibold tracking-[-0.02em] text-text-primary leading-snug">
          {data.question}
        </p>
      </div>

      {/* Finding - always expanded */}
      <div className="rounded-lg border border-[var(--color-brand-500)]/[0.15] bg-[var(--color-brand-500)]/[0.04] px-4 py-3">
        <div className="flex items-start gap-2 mb-1.5">
          <Lightbulb size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]/60 mt-0.5 shrink-0" />
          <span className="font-[var(--font-display)] text-body-sm font-semibold tracking-[-0.01em] text-[var(--color-brand-400)]/60 uppercase">
            Finding
          </span>
        </div>
        <div className="text-body-lg leading-[1.7] text-text-primary font-[var(--font-body)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {data.finding}
          </ReactMarkdown>
        </div>
        <CopyActions content={`## Finding\n\n${data.finding}`} className="mt-2 pt-1.5 border-t border-[var(--color-brand-500)]/[0.08]" />
      </div>

      {/* How it works - collapsible */}
      {data.howItWorks && (
        <CollapsibleSection
          title="How it works"
          icon={Layers}
          defaultOpen={!collapseDetails}
          copyContent={`## How it works\n\n${data.howItWorks}`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {data.howItWorks}
          </ReactMarkdown>
        </CollapsibleSection>
      )}

      {/* What's missing - collapsible */}
      {data.whatsMissing && (
        <CollapsibleSection
          title="What's missing"
          icon={AlertTriangle}
          defaultOpen={!collapseDetails}
          copyContent={`## What's missing\n\n${data.whatsMissing}`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {data.whatsMissing}
          </ReactMarkdown>
        </CollapsibleSection>
      )}

      {/* What would be needed - collapsible */}
      {data.whatWouldBeNeeded && (
        <CollapsibleSection
          title="What would be needed"
          icon={AlertTriangle}
          defaultOpen={!collapseDetails}
          copyContent={`## What would be needed\n\n${data.whatWouldBeNeeded}`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {data.whatWouldBeNeeded}
          </ReactMarkdown>
        </CollapsibleSection>
      )}

      {/* Related stories */}
      <RelatedStoriesSection stories={data.relatedStories} defaultOpen={!collapseDetails} />

      {/* Key files */}
      <KeyFilesSection files={data.keyFiles} defaultOpen={!collapseDetails} />

      {/* Stakeholder summary (explain mode only) */}
      {data.stakeholderSummary && (
        <StakeholderSummaryCard content={data.stakeholderSummary} />
      )}

      {/* Full result copy actions */}
      <CopyActions content={rawContent} className="pt-3 border-t border-border-default" label="Copy full result" />
    </div>
  );
}
