"use client";

import Link from "next/link";
import { Link2, ExternalLink } from "lucide-react";
import type { InvestigationRelatedStory } from "@/lib/investigation-parser";
import { useTicketExists } from "@/hooks/useTicketExists";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getJiraUrl } from "@/lib/jira-url";
import { CollapsibleSection } from "./CollapsibleSection";

function StoryRow({ story }: { story: InvestigationRelatedStory }) {
  const { exists, status } = useTicketExists(story.key);

  return (
    <div className="py-2 border-b border-white/[0.03] last:border-0">
      <div className="flex items-center gap-2">
        <Link
          href={`/tickets/${story.key}`}
          className="text-xs font-semibold text-[var(--color-brand-400)] cursor-pointer hover:text-[var(--color-brand-300)] hover:underline transition-colors duration-150 shrink-0"
        >
          {story.key}
        </Link>
        <a
          href={getJiraUrl(story.key)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/25 cursor-pointer hover:text-white/50 transition-colors duration-150 shrink-0"
          title="Open in Jira"
        >
          <ExternalLink size={11} strokeWidth={1.5} />
        </a>
        {exists && status && <StatusBadge status={status} />}
        <span className="text-xs text-white/50">{story.summary}</span>
      </div>
      {story.relevance && (
        <p className="text-[11px] text-white/25 mt-0.5">
          {story.relevance}
        </p>
      )}
    </div>
  );
}

interface RelatedStoriesSectionProps {
  stories: InvestigationRelatedStory[];
  defaultOpen?: boolean;
}

export function RelatedStoriesSection({ stories, defaultOpen = true }: RelatedStoriesSectionProps) {
  if (stories.length === 0) return null;

  const copyContent = "## Related stories\n\n| Key | Summary | Relevance |\n|-----|---------|-----------|"
    + stories.map((s) => `\n| ${s.key} | ${s.summary} | ${s.relevance} |`).join("");

  return (
    <CollapsibleSection title="Related stories" icon={Link2} defaultOpen={defaultOpen} copyContent={copyContent}>
      <div className="space-y-0">
        {stories.map((story) => (
          <StoryRow key={story.key} story={story} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
