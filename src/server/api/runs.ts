import type { Harness } from "@/core/index.ts";

export function steerRun(h: Harness, runId: string, message: string) {
  return h.steerRoot(runId, message);
}

export function stopRun(h: Harness, runId: string) {
  return h.stopRun(runId);
}

export function openRunEventStream(h: Harness, runId: string | undefined, signal: AbortSignal): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      send({ type: "hello", runId });
      const off = h.bus.subscribe((e) => {
        if (!runId || e.runId === runId) send(e);
      });
      const ping = setInterval(() => controller.enqueue(": ping\n\n"), 15_000);
      signal.addEventListener("abort", () => {
        off();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      });
    },
  });
}
