export type BusEvent = {
  type: string;
  runId: string;
  agentId?: string | null;
  taskId?: string | null;
  payload?: unknown;
  ts: number;
};

type Listener = (e: BusEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  publish(e: Omit<BusEvent, "ts"> & { ts?: number }): void {
    const full: BusEvent = { ...e, ts: e.ts ?? Date.now() };
    for (const l of [...this.listeners]) {
      try {
        l(full);
      } catch {}
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  wait(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        off();
        clearTimeout(timer);
        resolve();
      };
      const off = this.subscribe(finish);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  close(): void {
    this.listeners.clear();
  }
}
