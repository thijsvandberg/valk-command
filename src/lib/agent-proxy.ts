/**
 * Server-side helper for proxying requests to valk-agent.
 * Keeps the agent URL and API key out of the browser.
 */

const AGENT_URL = process.env.VALK_AGENT_URL ?? "http://localhost:3001";

function getAgentKey(): string {
  const key = process.env.VALK_AGENT_KEY;
  if (!key) {
    throw new Error("VALK_AGENT_KEY environment variable is not set");
  }
  return key;
}

export function agentUrl(path: string): string {
  return `${AGENT_URL}${path}`;
}

export function agentHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAgentKey()}`,
    "Content-Type": "application/json",
  };
}
