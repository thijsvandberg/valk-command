# valk-command

PO Command Center for Valk Platform.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Dev server: `npm run dev` (port 3100)

## Agent Mode

This project is managed by Agent Orchestrator (ao). Agents run autonomously.

- Do NOT ask for confirmation. Start working immediately.
- Do NOT discuss or propose plans. Implement directly.
- When done: commit, push, and create a PR.
- If something is unclear in the issue, make a reasonable decision and document it in the PR description.

## Containment Rules

CRITICAL: This is an isolated agent environment. The following are strictly forbidden:

- Do NOT use Slack tools (slack_send_message, slack_read_channel, etc.)
- Do NOT use Gmail tools (gmail_create_draft, gmail_search_messages, etc.)
- Do NOT use Google Calendar tools (gcal_*)
- Do NOT use Atlassian/Jira tools (mcp__claude_ai_Atlassian__*)
- Do NOT send messages to any external service
- Do NOT create drafts, emails, calendar events, or chat messages
- ONLY interact with: the local filesystem, git, gh CLI, and npm

## Code Standards

- All code, comments, and UI strings in English
- Only write comments that explain WHY, not WHAT
- Use conventional commits (feat:, fix:, chore:)
- Run `npm run build` before committing to verify the build passes
