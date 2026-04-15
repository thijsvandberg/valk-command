import type { StoryVersion } from "@/types/ticket";
import type { VersionOption } from "@/components/shared/VersionPicker";

/**
 * Converts raw API version rows (metaOnly=true response) into StoryVersion entries
 * with sequential version numbers and sorted by date ascending.
 * Content is left empty; it is lazy-loaded when the diff view is opened.
 */
export function parseRawVersionData(versionData: Record<string, unknown>[]): StoryVersion[] {
  const versions: StoryVersion[] = [];
  const count = versionData.length;
  versionData.forEach((v, idx) => {
    versions.push({
      id: (v.id as string) || undefined,
      versionNumber: 0,
      date: (v.createdAt as string) || new Date().toISOString(),
      contentHash: (v.contentHash as string) || "",
      content: "",
      updatedBy: (v.updatedBy as string) ?? null,
      updatedByAvatar: (v.updatedByAvatar as string) ?? null,
      label: idx === count - 1 ? "current" : undefined,
    });
  });
  versions.sort((a, b) => parseVersionDate(a.date) - parseVersionDate(b.date));
  versions.forEach((v, idx) => { v.versionNumber = idx + 1; });
  return versions;
}

export function parseVersionDate(iso: string): number {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(raw).getTime();
}

export function formatVersionDate(iso: string): string {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  const d = new Date(raw);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatVersionDateShort(iso: string): string {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  const d = new Date(raw);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function storyVersionToOption(v: StoryVersion): VersionOption {
  const tag: VersionOption["tag"] =
    v.label === "draft" ? "draft" :
    v.label === "ai-draft" ? "ai-draft" :
    v.label === "current" ? "current" : "jira";

  const title =
    v.label === "draft" ? "Local draft" :
    v.label === "ai-draft" ? `AI Draft` :
    `Version ${v.versionNumber}`;

  return {
    id: String(v.versionNumber),
    label: `v${v.versionNumber}`,
    versionNum: v.versionNumber,
    title,
    author: v.updatedBy,
    avatarUrl: v.updatedByAvatar,
    isoDate: v.date,
    tag,
  };
}
