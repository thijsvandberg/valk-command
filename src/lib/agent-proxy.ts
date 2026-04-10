/**
 * Server-side helper for proxying requests to valk-agent.
 * Keeps the agent URL and API key out of the browser.
 */
import { env } from "@/lib/env";

export function agentUrl(path: string): string {
  return `${env.VALK_AGENT_URL}${path}`;
}

export function agentHeaders(): Record<string, string> {
  if (!env.VALK_AGENT_KEY) {
    throw new Error("VALK_AGENT_KEY environment variable is not set");
  }
  return {
    Authorization: `Bearer ${env.VALK_AGENT_KEY}`,
    "Content-Type": "application/json",
  };
}
