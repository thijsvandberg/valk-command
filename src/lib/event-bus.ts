"use client";

import { type BridgeEventEnvelope, isBridgeEventEnvelope } from "@/lib/event-envelope";

const STREAM_URL = "/api/events";
const CHANNEL_NAME = "bridge-events";
const LEADER_LOCK_NAME = "bridge-events-leader";
const RECONNECT_DELAY_MS = 3_000;
// Cap the exponential backoff so a long outage settles at a steady retry cadence
// rather than hammering the server every 3s indefinitely.
const RECONNECT_MAX_DELAY_MS = 30_000;

type EnvelopeHandler = (envelope: BridgeEventEnvelope) => void;

/**
 * Per-browser SSE transport (BRDG-342). All live-update hooks subscribe here
 * instead of opening their own EventSource, so a tab spends at most one of the
 * ~6 HTTP/1.1 connections the browser allows per origin — and with Web Locks
 * available, the whole browser spends exactly one: the tab holding the
 * `bridge-events-leader` lock owns the single EventSource and republishes
 * every envelope on a BroadcastChannel for the other tabs. When the leader
 * closes, the lock moves to a waiting tab, which then connects. Without Web
 * Locks/BroadcastChannel (e.g. test environments) each tab connects directly,
 * which is the one-connection-per-tab fallback.
 */
const handlers = new Set<EnvelopeHandler>();

let started = false;
let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let channel: BroadcastChannel | null = null;
let lockAbort: AbortController | null = null;
let releaseLeadership: (() => void) | null = null;
// Only the Web Locks leader rebroadcasts onto the channel. In the no-Web-Locks
// fallback every tab connects its own EventSource, so rebroadcasting there would
// make each tab re-dispatch its peers' copies on top of its own delivery.
let isLeader = false;

function dispatch(envelope: BridgeEventEnvelope) {
  for (const handler of Array.from(handlers)) handler(envelope);
}

function connect() {
  if (es || !started || typeof EventSource === "undefined") return;
  const source = new EventSource(STREAM_URL);
  es = source;

  // A clean (re)connection resets the backoff so a recovered link retries
  // promptly the next time it drops, instead of inheriting a long delay.
  source.onopen = () => {
    reconnectAttempts = 0;
  };

  source.addEventListener("message", (e: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!isBridgeEventEnvelope(parsed)) return;
    dispatch(parsed);
    // Rebroadcast only when this tab is the elected leader (the sole tab with an
    // EventSource). The spec excludes the posting channel from delivery, so the
    // leader never double-dispatches to itself; gating on `isLeader` also stops
    // the no-Web-Locks fallback — where every tab has its own EventSource — from
    // dispatching each event once per peer.
    if (isLeader) channel?.postMessage(parsed);
  });

  source.onerror = () => {
    source.close();
    if (es === source) es = null;
    if (started && !reconnectTimer) {
      const delay = Math.min(RECONNECT_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }
  };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e: MessageEvent) => {
      if (!isBridgeEventEnvelope(e.data)) return;
      dispatch(e.data);
    };
  }

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && channel) {
    lockAbort = new AbortController();
    locks
      .request(LEADER_LOCK_NAME, { signal: lockAbort.signal }, () => {
        // The grant can race a teardown: returning immediately releases the
        // lock to the next waiting tab instead of holding it forever.
        if (!started) return;
        isLeader = true;
        connect();
        // Hold the lock (= leadership) until this tab stops; resolving hands
        // the connection to the next waiting tab.
        return new Promise<void>((resolve) => {
          releaseLeadership = resolve;
        });
      })
      .catch(() => {
        // Aborted while still waiting for leadership: normal teardown.
      });
  } else {
    connect();
  }
}

function stop() {
  started = false;
  isLeader = false;
  reconnectAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  es?.close();
  es = null;
  lockAbort?.abort();
  lockAbort = null;
  releaseLeadership?.();
  releaseLeadership = null;
  if (channel) {
    channel.onmessage = null;
    channel.close();
    channel = null;
  }
}

/**
 * Subscribe to all live server events (ticket + refinement). The first
 * subscriber starts the shared transport, the last one tears it down.
 * Subscribers filter by channel/key themselves.
 */
export function subscribeEvents(handler: EnvelopeHandler): () => void {
  handlers.add(handler);
  if (handlers.size === 1) start();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    handlers.delete(handler);
    if (handlers.size === 0) stop();
  };
}
