// @ts-nocheck
// Simulated socket service. Drop-in replace with socket.io-client when backend exists.
type Handler = (payload: unknown) => void;

class MockSocket {
  private handlers = new Map<string, Set<Handler>>();
  private timers: number[] = [];
  connected = false;

  on(event: string, h: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(h);
    return () => this.handlers.get(event)?.delete(h);
  }

  emit(event: string, payload?: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }

  connect() {
    this.connected = true;
    this.emit('connected');
  }

  disconnect() {
    this.connected = false;
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers = [];
    this.handlers.clear();
  }

  scheduleInterval(cb: () => void, ms: number) {
    const id = window.setInterval(cb, ms);
    this.timers.push(id);
    return id;
  }
}

export const socket = new MockSocket();
