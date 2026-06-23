import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BridgeEventEnvelope } from "./event-envelope";

type Listener = (event: MessageEvent | Event) => void;

class MockEventSource {
  url: string;
  listeners: Record<string, Listener[]> = {};
  closed = false;
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  close() {
    this.closed = true;
  }

  emit(data: string) {
    (this.listeners["message"] ?? []).forEach((h) => h(new MessageEvent("message", { data })));
  }

  triggerError() {
    this.onerror?.(new Event("error"));
  }

  static instances: MockEventSource[] = [];
  static clear() {
    MockEventSource.instances = [];
  }
  static open(): MockEventSource[] {
    return MockEventSource.instances.filter((es) => !es.closed);
  }
  static latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

class MockBroadcastChannel {
  name: string;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.channels.push(this);
  }

  postMessage(data: unknown) {
    for (const ch of MockBroadcastChannel.channels) {
      if (ch !== this && !ch.closed && ch.name === this.name) {
        ch.onmessage?.({ data });
      }
    }
  }

  close() {
    this.closed = true;
  }

  static channels: MockBroadcastChannel[] = [];
  static clear() {
    MockBroadcastChannel.channels = [];
  }
}

interface LockEntry {
  callback: () => unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
}

class MockLockManager {
  queue: LockEntry[] = [];
  holding = false;

  request(
    _name: string,
    options: { signal?: AbortSignal },
    callback: () => unknown,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const entry: LockEntry = { callback, resolve, reject, signal: options.signal };
      options.signal?.addEventListener("abort", () => {
        const idx = this.queue.indexOf(entry);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          reject(new DOMException("aborted", "AbortError"));
        }
      });
      this.queue.push(entry);
      this.pump();
    });
  }

  pump() {
    if (this.holding) return;
    const entry = this.queue.shift();
    if (!entry) return;
    this.holding = true;
    Promise.resolve(entry.callback()).then(
      (value) => {
        this.holding = false;
        entry.resolve(value);
        this.pump();
      },
      (reason) => {
        this.holding = false;
        entry.reject(reason);
        this.pump();
      },
    );
  }
}

let lockManager: MockLockManager;

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Each "tab" is a fresh module instance sharing the mocked browser globals. */
async function openTab() {
  vi.resetModules();
  return await import("./event-bus");
}

function envelope(ticketKey: string): BridgeEventEnvelope {
  return {
    channel: "ticket",
    event: { type: "ticket:changed", ticketKey, kinds: ["status"], origin: "tab-1" },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockEventSource.clear();
  MockBroadcastChannel.clear();
  lockManager = new MockLockManager();
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  vi.stubGlobal("navigator", { locks: lockManager });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("subscribeEvents (single tab)", () => {
  it("opens one EventSource to /api/events no matter how many hooks subscribe", async () => {
    const bus = await openTab();
    bus.subscribeEvents(vi.fn());
    bus.subscribeEvents(vi.fn());
    bus.subscribeEvents(vi.fn());
    await flushMicrotasks();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest().url).toBe("/api/events");
  });

  it("dispatches parsed envelopes to every subscriber", async () => {
    const bus = await openTab();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribeEvents(first);
    bus.subscribeEvents(second);
    await flushMicrotasks();

    MockEventSource.latest().emit(JSON.stringify(envelope("VPL-1")));

    expect(first).toHaveBeenCalledWith(envelope("VPL-1"));
    expect(second).toHaveBeenCalledWith(envelope("VPL-1"));
  });

  it("ignores malformed JSON and non-envelope payloads", async () => {
    const bus = await openTab();
    const handler = vi.fn();
    bus.subscribeEvents(handler);
    await flushMicrotasks();

    MockEventSource.latest().emit("not-json");
    MockEventSource.latest().emit(JSON.stringify({ channel: "bogus", event: {} }));
    MockEventSource.latest().emit(JSON.stringify({ channel: "ticket" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("closes the EventSource when the last subscriber unsubscribes", async () => {
    const bus = await openTab();
    const unsubA = bus.subscribeEvents(vi.fn());
    const unsubB = bus.subscribeEvents(vi.fn());
    await flushMicrotasks();
    const es = MockEventSource.latest();

    unsubA();
    expect(es.closed).toBe(false);
    unsubB();
    expect(es.closed).toBe(true);
  });

  it("reconnects 3 seconds after a connection error", async () => {
    const bus = await openTab();
    bus.subscribeEvents(vi.fn());
    await flushMicrotasks();
    expect(MockEventSource.instances).toHaveLength(1);

    MockEventSource.latest().triggerError();
    await vi.advanceTimersByTimeAsync(3000);

    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.open()).toHaveLength(1);
  });

  it("backs off exponentially across repeated connection errors", async () => {
    const bus = await openTab();
    bus.subscribeEvents(vi.fn());
    await flushMicrotasks();
    expect(MockEventSource.instances).toHaveLength(1);

    // First error: reconnect after the base 3s delay.
    MockEventSource.latest().triggerError();
    await vi.advanceTimersByTimeAsync(3000);
    expect(MockEventSource.instances).toHaveLength(2);

    // Second error: the delay doubles to 6s, so 3s is not enough yet.
    MockEventSource.latest().triggerError();
    await vi.advanceTimersByTimeAsync(3000);
    expect(MockEventSource.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("connects directly when Web Locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const bus = await openTab();
    bus.subscribeEvents(vi.fn());
    await flushMicrotasks();

    expect(MockEventSource.instances).toHaveLength(1);
  });
});

describe("subscribeEvents (cross-tab leadership)", () => {
  it("only the lock-holding tab opens an EventSource", async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    tabA.subscribeEvents(vi.fn());
    tabB.subscribeEvents(vi.fn());
    await flushMicrotasks();

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("follower tabs receive events via the BroadcastChannel", async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    const leaderHandler = vi.fn();
    const followerHandler = vi.fn();
    tabA.subscribeEvents(leaderHandler);
    tabB.subscribeEvents(followerHandler);
    await flushMicrotasks();

    MockEventSource.latest().emit(JSON.stringify(envelope("VPL-9")));

    expect(leaderHandler).toHaveBeenCalledWith(envelope("VPL-9"));
    expect(followerHandler).toHaveBeenCalledWith(envelope("VPL-9"));
    expect(followerHandler).toHaveBeenCalledTimes(1);
  });

  it("hands the connection to a waiting tab when the leader stops", async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    const unsubA = tabA.subscribeEvents(vi.fn());
    const followerHandler = vi.fn();
    tabB.subscribeEvents(followerHandler);
    await flushMicrotasks();
    expect(MockEventSource.instances).toHaveLength(1);
    const leaderEs = MockEventSource.latest();

    unsubA();
    await flushMicrotasks();

    expect(leaderEs.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.open()).toHaveLength(1);

    MockEventSource.latest().emit(JSON.stringify(envelope("VPL-3")));
    expect(followerHandler).toHaveBeenCalledWith(envelope("VPL-3"));
  });

  it("keeps a single connection with 8 simulated tabs and stays at one after churn", async () => {
    const tabs = [];
    for (let i = 0; i < 8; i++) tabs.push(await openTab());
    const unsubs = tabs.map((tab) => tab.subscribeEvents(vi.fn()));
    await flushMicrotasks();

    expect(MockEventSource.open()).toHaveLength(1);

    // Close the leader and two followers; exactly one connection must remain.
    unsubs[0]();
    unsubs[3]();
    unsubs[5]();
    await flushMicrotasks();

    expect(MockEventSource.open()).toHaveLength(1);
  });

  it("skips a waiter that left before the lock reached it", async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    const tabC = await openTab();
    const unsubA = tabA.subscribeEvents(vi.fn());
    const unsubB = tabB.subscribeEvents(vi.fn());
    const followerHandler = vi.fn();
    tabC.subscribeEvents(followerHandler);
    await flushMicrotasks();

    // B leaves while still waiting for the lock, then the leader leaves: the
    // lock must skip B and land on C.
    unsubB();
    unsubA();
    await flushMicrotasks();

    expect(MockEventSource.open()).toHaveLength(1);
    MockEventSource.latest().emit(JSON.stringify(envelope("VPL-7")));
    expect(followerHandler).toHaveBeenCalledWith(envelope("VPL-7"));
  });
});
