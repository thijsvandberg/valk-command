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
    <div className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0 min-w-0">
      <div className="flex items-center gap-1.5 shrink-0">
        {exists ? (
          <Link
            href={`/tickets/${story.key}`}
            className="text-xs font-semibold text-[var(--color-brand-400)] cursor-pointer hover:text-[var(--color-brand-300)] hover:underline transition-colors duration-150"
          >
            {story.key}
          </Link>
        ) : (
          <span className="text-xs font-semibold text-white/60">{story.key}</span>
        )}
        <a
          href={getJiraUrl(story.key)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/25 cursor-pointer hover:text-white/50 transition-colors duration-150"
          title="Open in Jira"
        >
          <ExternalLink size={11} strokeWidth={1.5} />
        </a>
      </div>
      {exists && status && <StatusBadge status={status} />}
      <span className="text-xs text-white/50 flex-1 min-w-0 truncate">{story.summary}</span>
      <span className="text-[11px] text-white/25 shrink-0 hidden sm:block max-w-[35%] truncate text-right">
        {story.relevance}
      </span>
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
