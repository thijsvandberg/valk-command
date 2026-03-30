/**
 * Server-side helper for proxying requests to valk-agent.
 * Keeps the agent URL and API key out of the browser.
 */

const AGENT_URL = process.env.VALK_AGENT_URL ?? "http://localhost:3001";
const AGENT_KEY = process.env.VALK_AGENT_KEY ?? "dev-key";

export function agentUrl(path: string): string {
  return `${AGENT_URL}${path}`;
}

export function agentHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${AGENT_KEY}`,
    "Content-Type": "application/json",
  };
}
