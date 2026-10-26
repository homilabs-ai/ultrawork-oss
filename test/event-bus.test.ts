import { expect, test } from "bun:test";
import { type BusEvent, EventBus } from "@/core/index.ts";

test("publish reaches subscribers; unsubscribe and throwing listeners are isolated", () => {
  const bus = new EventBus();
  const dropped: BusEvent[] = [];
  const kept: BusEvent[] = [];
  const off = bus.subscribe((e) => dropped.push(e));
  bus.subscribe((e) => kept.push(e));
  bus.subscribe(() => {
    throw new Error("boom");
  });

  bus.publish({ type: "a", runId: "r" });
  off();
  bus.publish({ type: "b", runId: "r" });

  expect(dropped.map((e) => e.type)).toEqual(["a"]);
  expect(kept.map((e) => e.type)).toEqual(["a", "b"]);
  expect(typeof kept[0]?.ts).toBe("number");
});

test("wait resolves on publish or on timeout", async () => {
  const bus = new EventBus();
  const woke = bus.wait(5000);
  bus.publish({ type: "wake", runId: "r" });
  await woke;

  const t0 = Date.now();
  await bus.wait(50);
  expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
});
