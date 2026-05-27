"use client";

import React from "react";
import Fuse from "fuse.js";
import {
  MessageCircle,
  KanbanSquare,
  Gem,
  Users,
  Settings,
  NotebookPen,
  Activity,
} from "lucide-react";

import type { PageResult, ResultCategory } from "./types";

export const PAGES: PageResult[] = [
  { category: "page", id: "page-sprint-board", label: "Sprint Board", href: "/sprint-board", icon: React.createElement(KanbanSquare, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["board", "kanban", "tickets", "sprint", "backlog", "home"] },
  { category: "page", id: "page-chat", label: "Chat", href: "/chat", icon: React.createElement(MessageCircle, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["conversations", "messages", "talk"] },
  { category: "page", id: "page-story-writer", label: "Story Writer", href: "/story-writer", icon: React.createElement(NotebookPen, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["write", "stories", "editor"] },
  { category: "page", id: "page-refinement", label: "Refinement", href: "/refinement", icon: React.createElement(Gem, { className: "h-4 w-4", strokeWidth: 1.5 }), aliases: ["refine", "groom", "grooming", "prep"] },
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
  if (s === "DONE") return { bg: "rgba(34,197,94,0.12)", text: "#4ade80" };
  if (s.includes("PROGRESS")) return { bg: "rgba(56,152,210,0.12)", text: "#58b4e6" };
  if (s.includes("TEST") || s.includes("REVIEW")) return { bg: "rgba(120,90,220,0.12)", text: "#9b7ee8" };
  if (s === "DEPRECATED") return { bg: "rgba(239,68,68,0.12)", text: "#f87171" };
  return { bg: "rgba(100,116,139,0.14)", text: "#94a3b8" };
}
