import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, openDb, Repo } from "@/core/index.ts";
import { RunService } from "@/api/run-service.ts";

function tmpRepo(): { repo: Repo; close: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "run-service-"));
  const cfg = loadConfig({
    dbPath: join(dir, "h.db"),
    workspaceDir: join(dir, "ws"),
  });
  const { db, sqlite } = openDb(cfg.dbPath);
  return { repo: new Repo(db), close: () => sqlite.close() };
}

test("getState serializes agents, tasks, counts, and parsed events", () => {
  const { repo, close } = tmpRepo();
  const svc = new RunService(repo);

  const run = repo.createRun("build the dashboard");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "full goal scope with plenty of detail",
    depth: 0,
  });
  repo.setRootAgent(run.id, root.id);
  repo.pushInbox({
    runId: run.id,
    agentId: root.id,
    kind: "scope",
    refId: null,
    contentMd: "seed",
  });

  const pending = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "pending task",
    scopeMd: "pending task",
    depth: 1,
  });
  const claimed = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "claimed task",
    scopeMd: "claimed task",
    depth: 1,
  });
  repo.setTaskStatus(claimed.id, "claimed");
  const running = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "running task",
    scopeMd: "running task",
    depth: 1,
  });
  repo.setTaskStatus(running.id, "running");
  const done = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "done task",
    scopeMd: "done task",
    depth: 1,
  });
  repo.setTaskStatus(done.id, "done");
  const failed = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "failed task",
    scopeMd: "failed task",
    depth: 1,
  });
  repo.setTaskStatus(failed.id, "failed");
  const cancelled = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "cancelled task",
    scopeMd: "cancelled task",
    depth: 1,
  });
  repo.setTaskStatus(cancelled.id, "cancelled");

  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    taskId: done.id,
    type: "worker.step",
    payload: { msg: "wrote files" },
  });

  const state = svc.getState(run.id);
  if (!state) throw new Error("expected state");
  expect(state.run.id).toBe(run.id);
  expect(state.run.instruction_md).toBe("build the dashboard");

  expect(state.agents).toHaveLength(1);
  expect(state.agents[0]).toMatchObject({
    id: root.id,
    role: "root",
    parent: null,
    depth: 0,
    status: "idle",
    scope: "full goal scope with plenty of detail",
    unread: 1,
  });

  expect(state.tasks).toHaveLength(6);
  expect(state.tasks.find((t) => t.id === pending.id)).toMatchObject({
    requesterAgentId: root.id,
    title: "pending task",
    scope: "pending task",
    status: "pending",
    depth: 1,
    claimedAt: null,
    finishedAt: null,
  });
  expect(state.tasks.find((t) => t.id === done.id)?.finishedAt).not.toBeNull();
  expect(state.tasks.find((t) => t.id === cancelled.id)?.finishedAt).not.toBeNull();

  expect(state.tasksByStatus).toEqual({
    pending: 1,
    claimed: 1,
    running: 1,
    done: 1,
    failed: 1,
    cancelled: 1,
  });

  const step = state.events.find((e) => e.type === "worker.step");
  if (!step) throw new Error("expected worker.step event");
  expect(step.id).toBeTruthy();
  expect(step.agentId).toBe(root.id);
  expect(step.taskId).toBe(done.id);
  expect(step.payload).toEqual({ msg: "wrote files" });
  expect(typeof step.timestamp).toBe("number");

  expect(state.rootPlanner).toMatchObject({
    agentId: root.id,
    role: "root",
    status: "idle",
    unread: 1,
    turnCount: 0,
    transcript: [],
  });
  expect(state.stats).toMatchObject({
    turnCount: 0,
    agentCount: 1,
    taskCounts: state.tasksByStatus,
  });
  expect(state.stats.elapsedMs).toBeGreaterThanOrEqual(0);

  close();
});

test("getRootPlannerState derives activity from planner events", () => {
  const { repo, close } = tmpRepo();
  const svc = new RunService(repo);
  const run = repo.createRun("plan something");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "root scope",
    depth: 0,
  });
  repo.setRootAgent(run.id, root.id);

  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.turn.start",
    payload: { firstTurn: true },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.step",
    payload: { msg: "spawnTask: scaffold" },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.text",
    payload: { text: "spawned scaffold task" },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.turn.end",
    payload: { text: "spawned scaffold task" },
  });

  const planner = svc.getRootPlannerState(run.id);
  if (!planner) throw new Error("expected root planner");
  expect(planner.turnCount).toBe(1);
  expect(planner.lastOutput).toBe("spawned scaffold task");
  expect(planner.currentActivity).toContain("spawned scaffold");
  expect(planner.transcript).toHaveLength(2);
  expect(planner.transcript[0]).toMatchObject({
    kind: "tool",
    text: "spawnTask: scaffold",
  });
  expect(planner.transcript[1]).toMatchObject({
    kind: "assistant",
    text: "spawned scaffold task",
  });

  close();
});

test("getRootPlannerState attaches tool results to their call by toolCallId", () => {
  const { repo, close } = tmpRepo();
  const svc = new RunService(repo);
  const run = repo.createRun("tool results");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "root",
    depth: 0,
  });
  repo.setRootAgent(run.id, root.id);

  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.step",
    payload: {
      msg: "spawnTask: Scaffold project",
      toolName: "spawnTask",
      toolCallId: "t1",
    },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.step",
    payload: {
      msg: "readFile src/a.ts",
      toolName: "readFile",
      toolCallId: "t2",
    },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.tool.result",
    payload: {
      msg: "↳ spawnTask",
      toolName: "spawnTask",
      toolCallId: "t1",
      result: '{ "ok": true }',
    },
  });

  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.tool.result",
    payload: {
      msg: "↳ ghost",
      toolName: "ghost",
      toolCallId: "gone",
      result: "x",
    },
  });

  const planner = svc.getRootPlannerState(run.id);
  if (!planner) throw new Error("expected root planner");

  expect(planner.transcript).toHaveLength(2);
  expect(planner.transcript[0]?.result).toContain("ok");

  expect(planner.transcript[1]?.result).toBeUndefined();

  close();
});

test("getRootPlannerState includes steer notes in the transcript", () => {
  const { repo, close } = tmpRepo();
  const svc = new RunService(repo);
  const run = repo.createRun("steer me");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "root",
    depth: 0,
  });
  repo.setRootAgent(run.id, root.id);

  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.text",
    payload: { text: "Working through the catalog." },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.steer",
    payload: { text: "Operator steering note:\nSkip the seasonal tap list." },
  });
  repo.logEvent({
    runId: run.id,
    agentId: root.id,
    type: "planner.steer",
    payload: { text: "External event (slack)\nthreadId: slack:C1:1\n\nplease reply" },
  });

  const planner = svc.getRootPlannerState(run.id);
  if (!planner) throw new Error("expected root planner");
  expect(planner.transcript).toHaveLength(3);
  expect(planner.transcript[1]).toMatchObject({
    kind: "steer",
    text: "Skip the seasonal tap list.",
  });
  expect(planner.transcript[2]).toMatchObject({
    kind: "steer",
    text: "External event (slack)\nthreadId: slack:C1:1\n\nplease reply",
  });

  close();
});

test("getTaskDetail returns transcript and handoff", () => {
  const { repo, close } = tmpRepo();
  const svc = new RunService(repo);
  const run = repo.createRun("do work");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "root",
    depth: 0,
  });
  const task = repo.enqueueTask({
    runId: run.id,
    requesterAgentId: root.id,
    title: "write files",
    scopeMd: "write files",
    depth: 1,
  });
  repo.setTaskStatus(task.id, "done");
  repo.logEvent({
    runId: run.id,
    taskId: task.id,
    type: "worker.turn.start",
    payload: {},
  });
  repo.logEvent({
    runId: run.id,
    taskId: task.id,
    type: "worker.step",
    payload: { msg: "wrote src/a.ts" },
  });
  repo.logEvent({
    runId: run.id,
    taskId: task.id,
    type: "worker.done",
    payload: {},
  });
  repo.pushInbox({
    runId: run.id,
    agentId: root.id,
    kind: "handoff",
    refId: task.id,
    contentMd: "Task completed.\nSummary: wrote a.ts",
  });

  const detail = svc.getTaskDetail(run.id, task.id);
  if (!detail) throw new Error("expected task detail");
  expect(detail.task.status).toBe("done");
  expect(detail.transcript.some((l) => l.message === "wrote src/a.ts")).toBe(true);
  expect(detail.handoff).toContain("wrote a.ts");

  close();
});

test("listRuns returns summaries with titles and task counts", () => {
  const { repo, close } = tmpRepo();
  const svc = new RunService(repo);
  const first = repo.createRun("# First goal\nDetails");
  const second = repo.createRun("Second goal");
  repo.enqueueTask({
    runId: second.id,
    requesterAgentId: "x",
    title: "t",
    scopeMd: "t",
    depth: 1,
  });

  const runs = svc.listRuns();
  expect(runs).toHaveLength(2);
  expect(runs.find((r) => r.id === second.id)).toMatchObject({
    title: "Second goal",
    taskCounts: {
      pending: 1,
      claimed: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    },
  });
  expect(runs.find((r) => r.id === first.id)?.title).toBe("First goal");

  close();
});
