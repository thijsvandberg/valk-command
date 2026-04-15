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

  if (exists && status) {
    return (
      <div className="flex items-start gap-3 py-1.5 border-b border-white/[0.03] last:border-0">
        <Link
          href={`/tickets/${story.key}`}
          className="text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:text-[var(--color-brand-300)] hover:underline transition-colors duration-150 shrink-0"
        >
          {story.key}
        </Link>
        <StatusBadge status={status} />
        <span className="text-xs text-white/50 flex-1 min-w-0 truncate">{story.summary}</span>
        <span className="text-[11px] text-white/30 shrink-0 hidden sm:block">{story.relevance}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-white/[0.03] last:border-0">
      <a
        href={getJiraUrl(story.key)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs font-medium text-white/50 cursor-pointer hover:text-white/70 transition-colors duration-150 shrink-0"
      >
        {story.key}
        <ExternalLink size={10} strokeWidth={1.5} />
      </a>
      <span className="text-xs text-white/50 flex-1 min-w-0 truncate">{story.summary}</span>
      <span className="text-[11px] text-white/30 shrink-0 hidden sm:block">{story.relevance}</span>
    </div>
  );
}

interface RelatedStoriesSectionProps {
  stories: InvestigationRelatedStory[];
  defaultOpen?: boolean;
}

export function RelatedStoriesSection({ stories, defaultOpen = true }: RelatedStoriesSectionProps) {
  if (stories.length === 0) return null;

  return (
    <CollapsibleSection title="Related stories" icon={Link2} defaultOpen={defaultOpen}>
      <div className="space-y-0">
        {stories.map((story) => (
          <StoryRow key={story.key} story={story} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
