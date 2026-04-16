import type { Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import {
  Info, Table, Code2, Minus, ChevronRight,
  CheckSquare, Heading2, Heading3, Heading4,
  FileText, Bug, ClipboardList,
} from "lucide-react";
import Fuse from "fuse.js";
import {
  AC_TEMPLATE_HTML,
  STORY_TEMPLATE_HTML,
  BUG_TEMPLATE_HTML,
  TASK_TEMPLATE_HTML,
} from "./slash-command-templates";

export interface SlashCommand {
  id: string;
  label: string;
  aliases: string[];
  description: string;
  icon: LucideIcon;
  group: "insert" | "template";
  execute: (editor: Editor) => void;
}

const INSERT_OPTS = { parseOptions: { preserveWhitespace: false as const } };

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "callout",
    label: "Callout",
    aliases: ["callout", "note", "info", "warning", "alert"],
    description: "Insert an info callout block",
    icon: Info,
    group: "insert",
    execute: (editor) => editor.chain().focus().setCallout({ type: "info" }).run(),
  },
  {
    id: "table",
    label: "Table",
    aliases: ["table", "grid"],
    description: "Insert a 3x3 table",
    icon: Table,
    group: "insert",
    execute: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "code",
    label: "Code block",
    aliases: ["code", "codeblock", "snippet"],
    description: "Insert a code block",
    icon: Code2,
    group: "insert",
    execute: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    aliases: ["divider", "rule", "hr", "separator", "line"],
    description: "Insert a horizontal divider",
    icon: Minus,
    group: "insert",
    execute: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "expand",
    label: "Expand",
    aliases: ["expand", "details", "collapsible", "toggle"],
    description: "Insert an expandable section",
    icon: ChevronRight,
    group: "insert",
    execute: (editor) => editor.chain().focus().setExpand({ title: "Details" }).run(),
  },
  {
    id: "ac",
    label: "Acceptance Criteria",
    aliases: ["ac", "acceptance", "criteria", "checklist"],
    description: "Insert an acceptance criteria template",
    icon: CheckSquare,
    group: "insert",
    execute: (editor) => editor.commands.insertContent(AC_TEMPLATE_HTML, INSERT_OPTS),
  },
  {
    id: "h2",
    label: "Heading 2",
    aliases: ["h2", "heading2", "heading"],
    description: "Insert a large heading",
    icon: Heading2,
    group: "insert",
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    aliases: ["h3", "heading3"],
    description: "Insert a medium heading",
    icon: Heading3,
    group: "insert",
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "h4",
    label: "Heading 4",
    aliases: ["h4", "heading4"],
    description: "Insert a small heading",
    icon: Heading4,
    group: "insert",
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run(),
  },
  {
    id: "story-template",
    label: "Story template",
    aliases: ["story", "storytemplate", "feature", "userstory"],
    description: "Description, Acceptance Criteria, Technical Notes, Out of Scope",
    icon: FileText,
    group: "template",
    execute: (editor) => editor.commands.insertContent(STORY_TEMPLATE_HTML, INSERT_OPTS),
  },
  {
    id: "bug-template",
    label: "Bug template",
    aliases: ["bug", "bugtemplate", "defect", "issue"],
    description: "Steps to Reproduce, Expected, Actual, Environment",
    icon: Bug,
    group: "template",
    execute: (editor) => editor.commands.insertContent(BUG_TEMPLATE_HTML, INSERT_OPTS),
  },
  {
    id: "task-template",
    label: "Task template",
    aliases: ["task", "tasktemplate", "chore"],
    description: "Objective, Steps, Definition of Done",
    icon: ClipboardList,
    group: "template",
    execute: (editor) => editor.commands.insertContent(TASK_TEMPLATE_HTML, INSERT_OPTS),
  },
];

export const slashCommandFuse = new Fuse(SLASH_COMMANDS, {
  keys: ["label", "aliases"],
  threshold: 0.4,
  includeScore: true,
});
