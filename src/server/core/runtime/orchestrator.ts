import type { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { HarnessConfig } from "@/core/config.ts";
import { openDb } from "@/core/db/db.ts";
import type { DB } from "@/core/db/db.ts";
import { Repo, type RunModels } from "@/core/db/repo.ts";
import { MastraDriver } from "@/core/agents/mastra-driver.ts";
import { createMastraWorkspace } from "@/core/agents/mastra-workspace.ts";
import { EventBus } from "@/core/transport/events.ts";
import { SqliteTransport } from "@/core/transport/sqlite-transport.ts";
import type { AgentDriver } from "./driver.ts";
import { Scheduler, type RunOutcome } from "./scheduler.ts";
import { shutdownSandbox } from "./sandbox.ts";

export class Harness {
  readonly db: DB;
  readonly sqlite: Database;
  readonly repo: Repo;
  readonly bus: EventBus;
  readonly transport: SqliteTransport;

  readonly workspaceRoot: string;
  readonly config: HarnessConfig;
  private driver: AgentDriver;
  scheduler?: Scheduler;
  private schedulerRunning = false;

  private pendingLaunchRunId: string | null = null;

  constructor(config: HarnessConfig, driverFactory?: (h: Harness) => AgentDriver) {
    this.config = config;
    const opened = openDb(config.dbPath);
    this.db = opened.db;
    this.sqlite = opened.sqlite;
    this.repo = new Repo(this.db);
    this.bus = new EventBus();
    this.transport = new SqliteTransport(this.repo, this.bus);
    this.workspaceRoot = resolve(config.workspaceDir);
    this.driver = driverFactory
      ? driverFactory(this)
      : new MastraDriver(this.repo, this.transport, this.workspaceRoot, this.config, this.bus);
  }

  createRun(instruction: string, models: RunModels = {}): string {
    const run = this.repo.createRun(instruction, models);
    const root = this.repo.createAgent({
      runId: run.id,
      role: "root",
      parentAgentId: null,
      scopeMd: instruction,
      depth: 0,
    });
    this.repo.setRootAgent(run.id, root.id);
    this.transport.pushInbox({
      runId: run.id,
      agentId: root.id,
      kind: "scope",
      refId: null,
      contentMd: `You own the entire instruction:\n${instruction}`,
    });
    this.repo.logEvent({
      runId: run.id,
      agentId: root.id,
      type: "run.created",
    });
    return run.id;
  }

  async start(runId: string): Promise<RunOutcome> {
    await createMastraWorkspace(this.workspaceRoot).init();
    return this.launch(runId);
  }

  private launch(runId: string): Promise<RunOutcome> {
    this.repo.setRunStatus(runId, "running");
    const scheduler = new Scheduler(runId, {
      repo: this.repo,
      transport: this.transport,
      driver: this.driver,
      bus: this.bus,
      config: this.config,
    });
    this.scheduler = scheduler;
    this.schedulerRunning = true;
    this.pendingLaunchRunId = null;
    const done = scheduler.run();
    void done.finally(() => {
      this.schedulerRunning = false;
      if (this.scheduler === scheduler) this.scheduler = undefined;
      if (this.pendingLaunchRunId) {
        const next = this.pendingLaunchRunId;
        this.pendingLaunchRunId = null;
        void this.launch(next);
      }
    });
    return done;
  }

  stopRun(runId: string):
    | {
        ok: true;
        alreadyStopped: boolean;
        cancelledAgents: number;
        cancelledTasks: number;
      }
    | { ok: false; error: string } {
    const run = this.repo.getRun(runId);
    if (!run) return { ok: false, error: "Run not found." };
    if (run.status === "idle") {
      return {
        ok: true,
        alreadyStopped: true,
        cancelledAgents: 0,
        cancelledTasks: 0,
      };
    }
    const cancelled = this.repo.interruptRun(runId);
    if (this.pendingLaunchRunId === runId) this.pendingLaunchRunId = null;

    const activeScheduler = this.schedulerRunning && this.scheduler?.ownsRun(runId) ? this.scheduler : undefined;
    this.repo.logEvent({
      runId,
      type: "run.stop.requested",
      payload: cancelled,
    });
    this.bus.publish({ type: "run.stop.requested", runId });

    if (activeScheduler) {
      activeScheduler.stop();
    } else {
      this.repo.logEvent({ runId, type: "run.idle", payload: cancelled });
      this.bus.publish({ type: "run.idle", runId });
    }

    return { ok: true, alreadyStopped: false, ...cancelled };
  }

  private ensureScheduler(runId: string): void {
    if (this.schedulerRunning) {
      this.pendingLaunchRunId = runId;
      return;
    }
    void this.launch(runId);
  }

  wake(runId: string, message: string): { ok: true; agentId: string } | { ok: false; error: string } {
    const trimmed = message.trim();
    if (!trimmed) return { ok: false, error: "Wake message is empty." };
    const run = this.repo.getRun(runId);
    if (!run?.root_agent_id) return { ok: false, error: "Run has no root planner." };
    const root = this.repo.getAgent(run.root_agent_id);
    if (!root) return { ok: false, error: "Root planner not found." };

    this.transport.pushInbox({
      runId,
      agentId: root.id,
      kind: "scope",
      refId: null,
      contentMd: trimmed,
    });
    if (root.status !== "active") this.repo.setAgentStatus(root.id, "idle");
    if (run.status !== "running") this.repo.setRunStatus(runId, "running");
    this.repo.logEvent({
      runId,
      agentId: root.id,
      type: "planner.steer",
      payload: { text: trimmed.slice(0, 1000) },
    });
    this.bus.publish({ type: "planner.steer", runId, agentId: root.id });

    this.ensureScheduler(runId);
    return { ok: true, agentId: root.id };
  }

  steerRoot(runId: string, message: string): { ok: true; agentId: string } | { ok: false; error: string } {
    const trimmed = message.trim();
    if (!trimmed) return { ok: false, error: "Steer message is empty." };
    return this.wake(runId, `Operator steering note:\n${trimmed}`);
  }

  async close(): Promise<void> {
    this.bus.close();
    await shutdownSandbox();
    this.sqlite.close();
  }
}
