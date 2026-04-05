export interface ChangelogEntry {
  hash: string;
  shortHash: string;
  date: string;
  category: string;
  description: string;
  longDescription?: string;
  author: string;
  commitUrl: string;
}

export interface ChangelogGroup {
  date: string;
  entries: ChangelogEntry[];
}
