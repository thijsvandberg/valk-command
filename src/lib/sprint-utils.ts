export const TEAMS = ["BO", "BM", "BT", "GXP", "HT"] as const;
export type Team = (typeof TEAMS)[number];

export function extractTeamPrefix(sprintName: string): string | null {
  const match = sprintName.match(/^([A-Z]+)[: ]/);
  return match ? match[1] : null;
}
