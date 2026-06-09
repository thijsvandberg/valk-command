import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";

// Shared Type filter option renderer. Used by both the Sprint Board FilterBar and the
// dedicated search filter panel so the Type dropdown stays identical across the app (BRDG-324).
export function IssueTypeOption({ value }: { value: string }) {
  const color = ISSUE_TYPE_COLORS[value as keyof typeof ISSUE_TYPE_COLORS];
  return (
    <span className="flex items-center gap-2">
      <span className="flex w-4 justify-center">
        <IssueTypeIcon type={value} size={15} strokeWidth={2} />
      </span>
      <span style={color ? { color } : undefined} className="capitalize">{value}</span>
    </span>
  );
}
