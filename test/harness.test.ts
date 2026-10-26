import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { cancelTaskTool } from "@/core/agents/tools/cancel-task.ts";
import { steerTaskTool } from "@/core/agents/tools/steer-task.ts";
import { TaskSteering } from "@/core/runtime/steering.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentDriver,
  EventBus,
  type Handoff,
  Harness,
  type HarnessConfig,
  loadConfig,
  openDb,
  Repo,
  SqliteTransport,
  type TaskRow,
} from "@/core/index.ts";

function tmpConfig(overrides: Partial<HarnessConfig> = {}): HarnessConfig {
  const dir = mkdtempSync(join(tmpdir(), "harness-"));
  return loadConfig({
    dbPath: join(dir, "h.db"),
    workspaceDir: join(dir, "ws"),
    ...overrides,
  });
}

interface PlannerCtx {
  repo: Repo;
  transport: SqliteTransport;
  agentId: string;
  turn: number;
  inboxKinds: string[];
}

class ScriptedDriver implements AgentDriver {
  private calls = 0;
  private turnByAgent = new Map<string, number>();

  constructor(
    private repo: Repo,
    private transport: SqliteTransport,
    private onPlanner: (ctx: PlannerCtx) => void,
    private onWorker?: (task: TaskRow) => Handoff,
  ) {}

  getLlmCalls(): number {
    return this.calls;
  }

  async runPlanner(agentId: string): Promise<void> {
    this.calls++;
    const turn = (this.turnByAgent.get(agentId) ?? 0) + 1;
    this.turnByAgent.set(agentId, turn);
    const inbox = this.transport.drainInbox(agentId);
    this.onPlanner({
      repo: this.repo,
      transport: this.transport,
      agentId,
      turn,
      inboxKinds: inbox.map((i) => i.kind),
    });
  }

  async runWorker(task: TaskRow): Promise<Handoff> {
    this.calls++;
    return this.onWorker ? this.onWorker(task) : { summary: `did ${task.id}` };
  }
}

test("claimNextTask claims each task exactly once and respects the depth cap", () => {
  const cfg = tmpConfig();
  const { db, sqlite } = openDb(cfg.dbPath);
  const repo = new Repo(db);
  const run = repo.createRun("x");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "x",
    depth: 0,
  });
  for (let i = 0; i < 10; i++)
    repo.enqueueTask({
      runId: run.id,
      requesterAgentId: root.id,
      title: `t${i}`,
      scopeMd: `t${i}`,
      depth: 1,
    });
  repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "deep",
    scopeMd: "deep",
    depth: 6,
  });

  const claimed = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const t = repo.claimNextTask(run.id, 5);
    expect(t).not.toBeNull();
    expect(claimed.has(t!.id)).toBe(false);
    claimed.add(t!.id);
  }
  expect(repo.claimNextTask(run.id, 5)).toBeNull();
  expect(claimed.size).toBe(10);
  sqlite.close();
});

test("resetInflightTasks returns claimed/running tasks to pending", async () => {
  const cfg = tmpConfig();
  const { db, sqlite } = openDb(cfg.dbPath);
  const repo = new Repo(db);
  const bus = new EventBus();
  const transport = new SqliteTransport(repo, bus);
  const run = repo.createRun("x");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "x",
    depth: 0,
  });
  transport.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "t",
    scopeMd: "t",
    depth: 1,
  });
  const t = transport.claimTask(run.id, 3)!;
  repo.setTaskStatus(t.id, "running");
  expect(repo.countTasks(run.id, ["pending"])).toBe(0);
  const reset = repo.resetInflightTasks(run.id);
  expect(reset).toBe(1);
  expect(repo.countTasks(run.id, ["pending"])).toBe(1);
  bus.close();
  sqlite.close();
});

test("end-to-end work: fan out, handoffs bubble up, root returns idle", async () => {
  const cfg = tmpConfig({ maxWorkers: 3 });
  const writes: string[] = [];
  const harness = new Harness(
    cfg,
    (h) =>
      new ScriptedDriver(
        h.repo,
        h.transport,
        (ctx) => {
          const runId = ctx.repo.getAgent(ctx.agentId)!.run_id;
          if (ctx.turn === 1) {
            for (let i = 0; i < 3; i++)
              ctx.transport.enqueueTask({
                runId,
                requesterAgentId: ctx.agentId,
                title: `section ${i}`,
                scopeMd: `section ${i}`,
                depth: 1,
              });
          }
        },
        (task) => {
          writes.push(task.scope_md);
          return { summary: `wrote ${task.scope_md}` };
        },
      ),
  );
  const runId = harness.createRun("build a 3-section brief");
  const outcome = await harness.start(runId);
  expect(outcome).toBe("idle");
  expect(writes.sort()).toEqual(["section 0", "section 1", "section 2"]);
  expect(harness.repo.countTasks(runId, ["done"])).toBe(3);
  await harness.close();
});

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await Bun.sleep(10);
  }
}

test("an idle run can be woken by a later external message", async () => {
  const inboxes: string[][] = [];
  const cfg = tmpConfig();
  const harness = new Harness(
    cfg,
    (h) =>
      new ScriptedDriver(h.repo, h.transport, (ctx) => {
        inboxes.push(ctx.inboxKinds);
      }),
  );
  const runId = harness.createRun("initial goal");
  const run = harness.repo.getRun(runId);
  if (!run?.root_agent_id) throw new Error("expected root planner");
  const rootId = run.root_agent_id;

  const first = await harness.start(runId);
  expect(first).toBe("idle");
  expect(harness.repo.getRun(runId)?.status).toBe("idle");
  expect(inboxes).toHaveLength(1);

  const result = harness.steerRoot(runId, "Focus on the shorter draft first.");
  expect(result).toEqual({ ok: true, agentId: rootId });

  await waitFor(
    () => inboxes.length >= 2 && harness.repo.listEvents(runId, 50).filter((e) => e.type === "run.idle").length >= 2,
  );
  expect(inboxes[1]).toContain("scope");

  const steer = harness.repo.listEvents(runId, 50).find((e) => e.type === "planner.steer");
  expect(steer).toBeTruthy();
  expect(JSON.parse(steer!.payload_json).text).toContain("shorter draft");
  await harness.close();
});

test("budget stop: maxTurns halts a never-completing run", async () => {
  const cfg = tmpConfig({
    budget: {
      maxTurns: 5,
      maxWallclockMs: 1e9,
      maxLlmCalls: 1e9,
    } as HarnessConfig["budget"],
  });
  const harness = new Harness(
    cfg,
    (h) =>
      new ScriptedDriver(
        h.repo,
        h.transport,
        (ctx) => {
          const runId = ctx.repo.getAgent(ctx.agentId)!.run_id;
          ctx.transport.enqueueTask({
            runId,
            requesterAgentId: ctx.agentId,
            title: "more",
            scopeMd: "more",
            depth: 1,
          });
        },
        () => ({ summary: "ok" }),
      ),
  );
  const runId = harness.createRun("infinite");
  const outcome = await harness.start(runId);
  expect(outcome).toBe("idle");
  await harness.close();
});

test("stopRun cancels unfinished work and leaves the run resumable", async () => {
  const cfg = tmpConfig();
  const harness = new Harness(cfg, (h) => new ScriptedDriver(h.repo, h.transport, () => {}));
  const runId = harness.createRun("cancel this");
  const rootId = harness.repo.getRun(runId)?.root_agent_id;
  if (!rootId) throw new Error("expected root planner");
  const child = harness.repo.createAgent({
    runId,
    role: "planner",
    parentAgentId: rootId,
    scopeMd: "unfinished child scope",
    depth: 1,
  });
  const task = harness.repo.enqueueTask({
    runId,
    requesterAgentId: rootId,
    title: "pending",
    scopeMd: "pending work",
    depth: 1,
  });

  expect(harness.stopRun(runId)).toEqual({
    ok: true,
    alreadyStopped: false,
    cancelledAgents: 1,
    cancelledTasks: 1,
  });
  expect(harness.repo.getRun(runId)?.status).toBe("idle");
  expect(harness.repo.getAgent(rootId)?.status).toBe("idle");
  expect(harness.repo.getAgent(child.id)?.status).toBe("cancelled");
  expect(harness.repo.getTask(task.id)?.status).toBe("cancelled");
  expect(harness.wake(runId, "try again")).toEqual({
    ok: true,
    agentId: rootId,
  });
  await waitFor(() => harness.repo.getRun(runId)?.status === "idle");
  await harness.close();
});

test("stopRun aborts an active worker and preserves cancelled task state", async () => {
  let workerAborted = false;
  const cfg = tmpConfig({ maxWorkers: 1 });
  const harness = new Harness(cfg, (h) => ({
    getLlmCalls: () => 1,
    runPlanner: async (agentId: string) => {
      const agent = h.repo.getAgent(agentId);
      if (!agent) throw new Error("expected planner");
      const runId = agent.run_id;
      h.transport.drainInbox(agentId);
      if (h.repo.listTasks(runId).length > 0) return;
      h.transport.enqueueTask({
        runId,
        requesterAgentId: agentId,
        title: "long worker",
        scopeMd: "wait until stopped",
        depth: 1,
      });
    },
    runWorker: async (_task: TaskRow, signal?: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            workerAborted = true;
            reject(new DOMException("Stopped", "AbortError"));
          },
          { once: true },
        );
      });
      return { summary: "unreachable" };
    },
  }));
  const runId = harness.createRun("start a long worker");
  const outcome = harness.start(runId);
  await waitFor(() => harness.repo.listTasks(runId)[0]?.status === "running");
  const task = harness.repo.listTasks(runId)[0];
  if (!task) throw new Error("expected worker task");
  const taskId = task.id;

  expect(harness.stopRun(runId)).toMatchObject({
    ok: true,
    cancelledTasks: 1,
  });

  expect(await outcome).toBe("idle");
  expect(workerAborted).toBe(true);
  expect(harness.repo.getTask(taskId)?.status).toBe("cancelled");
  expect(harness.repo.listEvents(runId, 50).some((event) => event.type === "worker.error")).toBe(false);
  await harness.close();
});

function cancelCtx(h: Harness, agentId: string) {
  return {
    repo: h.repo,
    transport: h.transport,
    config: h.config,
    agent: h.repo.getAgent(agentId)!,
    workspaceRoot: "/tmp",
  };
}

test("cancelTask stops a running worker; no handoff, planner not re-woken", async () => {
  const cfg = tmpConfig({ maxWorkers: 2 });
  let plannerTurns = 0;
  let workerAborted = false;
  let rootId = "";
  const harness = new Harness(cfg, (h) => ({
    async runPlanner(agentId: string): Promise<void> {
      plannerTurns++;
      rootId = agentId;
      const agent = h.repo.getAgent(agentId)!;
      h.transport.drainInbox(agentId);
      if (h.repo.listTasks(agent.run_id).length === 0) {
        h.transport.enqueueTask({ runId: agent.run_id, requesterAgentId: agentId, title: "slow", scopeMd: "slow", depth: 1 });
      }
    },
    runWorker(_task: TaskRow, signal?: AbortSignal): Promise<Handoff> {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          workerAborted = true;
          reject(new Error("aborted"));
        });
      });
    },
  }));
  const runId = harness.createRun("cancel me");
  const runPromise = harness.start(runId);

  await waitFor(() => harness.repo.listTasks(runId)[0]?.status === "running");
  const task = harness.repo.listTasks(runId)[0]!;
  const tool = cancelTaskTool(cancelCtx(harness, rootId));
  expect(await tool.execute!({ taskId: task.id, reason: "superseded" }, {} as never)).toMatchObject({ ok: true });

  expect(await runPromise).toBe("idle");
  expect(workerAborted).toBe(true);
  expect(harness.repo.getTask(task.id)?.status).toBe("cancelled");
  expect(harness.repo.getInboxByRef(runId, task.id)).toBeNull();
  expect(plannerTurns).toBe(1);
  await harness.close();
});

test("cancelTask drops a queued task and refuses others' or finished tasks", async () => {
  const cfg = tmpConfig();
  const harness = new Harness(cfg, (h) => new ScriptedDriver(h.repo, h.transport, () => {}));
  const runId = harness.createRun("x");
  const rootId = harness.repo.getRun(runId)!.root_agent_id!;
  const other = harness.repo.createAgent({ runId, role: "planner", parentAgentId: rootId, scopeMd: "s", depth: 1 });
  const enqueue = (requesterAgentId: string) =>
    harness.transport.enqueueTask({ runId, requesterAgentId, title: "t", scopeMd: "t", depth: 1 });
  const mine = enqueue(rootId);
  const theirs = enqueue(other.id);
  const done = enqueue(rootId);
  harness.repo.setTaskStatus(done.id, "done");

  const tool = cancelTaskTool(cancelCtx(harness, rootId));
  const cancel = (taskId: string) => tool.execute!({ taskId, reason: "r" }, {} as never);

  expect(await cancel(mine.id)).toMatchObject({ ok: true });
  expect(harness.repo.getTask(mine.id)?.status).toBe("cancelled");
  expect(await cancel(mine.id)).toMatchObject({ ok: false });
  expect(await cancel(theirs.id)).toMatchObject({ ok: false });
  expect(harness.repo.getTask(theirs.id)?.status).toBe("pending");
  expect(await cancel(done.id)).toMatchObject({ ok: false });
  expect(await cancel("nope")).toMatchObject({ ok: false });
  await harness.close();
});

test("steerTask queues a note for open tasks it owns and refuses others", async () => {
  const cfg = tmpConfig();
  const harness = new Harness(cfg, (h) => new ScriptedDriver(h.repo, h.transport, () => {}));
  const runId = harness.createRun("x");
  const rootId = harness.repo.getRun(runId)!.root_agent_id!;
  const other = harness.repo.createAgent({ runId, role: "planner", parentAgentId: rootId, scopeMd: "s", depth: 1 });
  const enqueue = (requesterAgentId: string) =>
    harness.transport.enqueueTask({ runId, requesterAgentId, title: "t", scopeMd: "t", depth: 1 });
  const mine = enqueue(rootId);
  const theirs = enqueue(other.id);
  const done = enqueue(rootId);
  harness.repo.setTaskStatus(done.id, "done");

  const steering = new TaskSteering();
  const tool = steerTaskTool({ ...cancelCtx(harness, rootId), steering });
  const steer = (taskId: string) => tool.execute!({ taskId, note: "Use CSV output." }, {} as never);

  expect(await steer(mine.id)).toMatchObject({ ok: true });
  expect(await steer(theirs.id)).toMatchObject({ ok: false });
  expect(await steer(done.id)).toMatchObject({ ok: false });
  expect(steering.drain(mine.id)).toEqual(["Use CSV output."]);
  expect(steering.drain(theirs.id)).toEqual([]);
  await harness.close();
});
