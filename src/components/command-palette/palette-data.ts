"use client";

import React from "react";
import Fuse from "fuse.js";
import {
  MessageCircle,
  KanbanSquare,
  Gem,
  Layers,
  Users,
  Settings,
  NotebookPen,
  Activity,
} from "lucide-react";

import type { PageResult, ResultCategory } from "./types";

export const PAGES: PageResult[] = [
  { category: "page", id: "page-sprint-board", label: "Sprint Board", href: "/sprint-board", icon: React.createElement(KanbanSquare, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["board", "kanban", "tickets", "sprint", "backlog", "home"] },
  { category: "page", id: "page-epics", label: "Epics", href: "/epics", icon: React.createElement(Layers, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["epic", "progress", "features", "roadmap"] },
  { category: "page", id: "page-chat", label: "Chat", href: "/chat", icon: React.createElement(MessageCircle, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["conversations", "messages", "talk"] },
  { category: "page", id: "page-story-writer", label: "Story Writer", href: "/story-writer", icon: React.createElement(NotebookPen, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["write", "stories", "editor"] },
  { category: "page", id: "page-refinement", label: "Refinement", href: "/refinement", icon: React.createElement(Gem, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["refine", "prep"] },
  { category: "page", id: "page-activity-log", label: "Activity Log", href: "/activity-log", icon: React.createElement(Activity, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["activity", "log", "history"] },
  { category: "page", id: "page-stakeholder", label: "Stakeholder", href: "/stakeholder", icon: React.createElement(Users, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["external", "readonly", "share"] },
  { category: "page", id: "page-settings", label: "Settings", href: "/settings", icon: React.createElement(Settings, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["preferences", "config", "configuration"] },
];

export const pageFuse = new Fuse(PAGES, {
  keys: [
    { name: "label", weight: 1.0 },
    { name: "aliases", weight: 0.7 },
  ],
  threshold: 0.4,
  includeScore: true,
});

export const CATEGORY_LABELS: Record<ResultCategory, string> = {
  page: "Pages",
  action: "Actions",
  ticket: "Tickets",
  epic: "Epics",
  conversation: "Conversations",
  "direct-ticket": "Direct",
  "story-writer": "Story Writer",
};

export const MAX_PER_CATEGORY = 5;
export const MAX_TOTAL = 15;
export const TICKET_DEBOUNCE_MS = 300;

// The Tickets section only surfaces work items the PO acts on directly.
// Epics get their own section; subtasks are an implementation detail.
const TICKET_ISSUE_TYPES = new Set(["story", "task", "spike", "bug"]);

export function isTicketIssueType(issueType: string | null | undefined): boolean {
  return !!issueType && TICKET_ISSUE_TYPES.has(issueType.toLowerCase());
}

export function extractTicketKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Plain ticket key: VPL-12345
  const plainMatch = trimmed.match(/^([A-Z]{2,10}-\d+)$/i);
  if (plainMatch) return plainMatch[1].toUpperCase();

  // Jira browse URL: https://...atlassian.net/browse/VPL-12345
  const browseMatch = trimmed.match(/atlassian\.net\/browse\/([A-Z]{2,10}-\d+)/i);
  if (browseMatch) return browseMatch[1].toUpperCase();

  // Jira board URL with selectedIssue param
  const selectedMatch = trimmed.match(/selectedIssue=([A-Z]{2,10}-\d+)/i);
  if (selectedMatch) return selectedMatch[1].toUpperCase();

  return null;
}

export function statusColor(status: string): { bg: string; text: string } {
  const s = status?.toUpperCase() ?? "";
  if (s === "DONE") return { bg: "var(--sp-done-bg)", text: "var(--sp-done-text)" };
  if (s.includes("PROGRESS")) return { bg: "var(--sp-prog-bg)", text: "var(--sp-prog-text)" };
  if (s.includes("TEST") || s.includes("REVIEW")) return { bg: "var(--sp-test-bg)", text: "var(--sp-test-text)" };
  if (s === "DEPRECATED") return { bg: "var(--color-status-deprecated-subtle)", text: "var(--color-status-deprecated)" };
  return { bg: "var(--sp-todo-bg)", text: "var(--sp-todo-text)" };
}
