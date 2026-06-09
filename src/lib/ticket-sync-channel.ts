import type { TicketEditState } from "@/types/ticket";

// Cross-tab sync for ticket edit-state changes. When one tab discards a draft or
// pushes to Jira, the server-side list cache (30s TTL) and the per-tab SWR poll
// (60s refreshInterval) would otherwise leave the "local changes"/"draft" labels
// stuck in other open tabs for up to a minute. Broadcasting the new edit-state
// lets every open tab patch its SWR cache instantly, without waiting for a poll
// or a (dev-unreliable) server cache invalidation.

const CHANNEL_NAME = "bridge-ticket-sync";

export interface TicketSyncMessage {
  key: string;
  editState: TicketEditState;
}

// A long-lived channel for posting. Closing right after postMessage can drop the
// in-flight message before delivery, so the publisher keeps one open channel for
// the lifetime of the context. A BroadcastChannel never delivers to the same
// instance that posted, so the acting tab does not receive its own message
// (it already updates optimistically) while every other tab does.
let publishChannel: BroadcastChannel | null = null;

function getPublishChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!publishChannel) publishChannel = new BroadcastChannel(CHANNEL_NAME);
  return publishChannel;
}

export function publishTicketSync(message: TicketSyncMessage): void {
  getPublishChannel()?.postMessage(message);
}

export function subscribeTicketSync(handler: (message: TicketSyncMessage) => void): () => void {
  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const listener = (event: MessageEvent<TicketSyncMessage>) => {
    if (event.data && typeof event.data.key === "string") {
      handler(event.data);
    }
  };
  channel.addEventListener("message", listener);
  return () => {
    channel.removeEventListener("message", listener);
    channel.close();
  };
}
