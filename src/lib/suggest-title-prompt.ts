import type { Message } from "@/types/chat";

// Matches the two ways a title suggestion can render in the chat: the structured
// <title-suggestions> tag and the legacy "Here are N title options:" fallback.
// Kept in sync with the parsing in ChatMessageParts.
const TITLE_TAG = /<title-suggestions>([\s\S]*?)<\/title-suggestions>/;
const LEGACY_TITLES =
  /here are \d+ title (?:options|suggestions|ideas)[:\s]*\n((?:\d+\.\s+\*\*.+\*\*[^\n]*\n?)+)/i;

// True when the assistant has already proposed titles earlier in this chat, so
// the title's "Suggest titles" affordance can hide itself.
export function hasTitleSuggestion(messages: Pick<Message, "role" | "content">[]): boolean {
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const tag = m.content.match(TITLE_TAG);
    if (
      tag &&
      tag[1].split(/\n/).some((line) => line.replace(/^\s*[-*]\s*/, "").trim().length > 0)
    ) {
      return true;
    }
    return LEGACY_TITLES.test(m.content);
  });
}

// Mirrors the default "Suggest title" quick prompts (see
// src/app/api/settings/quick-prompts/route.ts) so the title hover action sends
// the same type-aware instruction without depending on the chat pane's state.
export function buildSuggestTitlePrompt(type?: string | null): string {
  switch ((type ?? "story").toLowerCase()) {
    case "bug":
      return "Suggest 3 clear, specific bug report titles for this issue. Each title should describe the broken behavior and its context in under 12 words, without using the word 'bug'.";
    case "task":
      return "Suggest 3 concise titles for this task. Each title should start with a verb, be under 12 words, and clearly state what needs to be done.";
    case "subtask":
    case "sub-task":
      return "Suggest 3 short, specific titles for this subtask. Each title should start with a verb, be under 12 words, and describe one concrete piece of work.";
    case "spike":
      return "Suggest 3 titles for this spike. Each title should start with 'Investigate' or 'Research', be under 8 words, and clearly state the open question being explored.";
    default:
      return "Suggest 3 concise, action-oriented titles for this user story. Each title should start with a verb, be under 12 words, and clearly describe the user value.";
  }
}
