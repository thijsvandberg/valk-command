import type { IssueType } from "@/types/ticket";

export function IssueTypeIcon({ type, size = 16 }: { type: IssueType; size?: number }) {
  const style = { width: size, height: size };
  switch (type) {
    case "task":
      return (
        <svg viewBox="0 0 16 16" className="text-[#4a90d9]" style={style}>
          <rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" opacity="0.2" />
          <path d="M4.5 8.5l2 2 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "bug":
      return (
        <svg viewBox="0 0 16 16" className="text-[#e5534b]" style={style}>
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.2" />
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      );
    case "story":
      return (
        <svg viewBox="0 0 16 16" className="text-[#4aaa60]" style={style}>
          <path d="M3 2h7l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="currentColor" opacity="0.2" />
          <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      );
    case "subtask":
      return (
        <svg viewBox="0 0 16 16" className="text-[#4a90d9]" style={style}>
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.4" />
          <path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}
