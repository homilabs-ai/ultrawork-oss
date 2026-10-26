import type { HarnessConfig } from "@/core/config.ts";
import type { Repo } from "@/core/db/repo.ts";
import type { TaskRow } from "@/core/db/types.ts";
import { serializeError } from "@/core/errors.ts";
import type { EventBus } from "@/core/transport/events.ts";
import type { Transport } from "@/core/transport/types.ts";
import type { AgentDriver } from "./driver.ts";

const POLL_MS = 250;

export interface SchedulerDeps {
  repo: Repo;
  transport: Transport;
  driver: AgentDriver;
  bus: EventBus;
  config: HarnessConfig;
}

export type RunOutcome = "idle";

export class Scheduler {
  private activeWorkers = new Map<string, Promise<void>>();
  private workerAborts = new Map<string, AbortController>();
  private activePlanners = new Map<string, Promise<void>>();
  private abortController = new AbortController();
  private stopped = false;
  private stopReason: RunOutcome | null = null;
  private turns = 0;
  private startedAt = 0;

  constructor(
    private runId: string,
    private d: SchedulerDeps,
  ) {}

  ownsRun(runId: string): boolean {
    return this.runId === runId;
  }

  stop(): void {
    this.stopped = true;
    if (!this.stopReason) this.stopReason = "idle";
    this.d.repo.interruptRun(this.runId);
    this.abortController.abort();
  }

  async run(): Promise<RunOutcome> {
    const { repo } = this.d;
    this.startedAt = Date.now();
    repo.resetInflightTasks(this.runId);

    while (!this.stopped) {
      const run = repo.getRun(this.runId);
      if (!run) break;
      if (this.budgetExceeded()) {
        this.stopReason = "idle";
        this.stop();
        break;
      }

      this.abortCancelledWorkers();
      let dispatched = this.dispatchWorkers();
      dispatched = this.dispatchPlanners() || dispatched;

      if (this.activeWorkers.size > 0 || this.activePlanners.size > 0) {
        await this.d.bus.wait(POLL_MS);
        continue;
      }
      if (dispatched) continue;

      this.stopReason = this.decideQuiescence();
      break;
    }

    await Promise.allSettled([...this.activeWorkers.values(), ...this.activePlanners.values()]);
    const outcome = this.stopReason ?? "idle";
    repo.setRunStatus(this.runId, outcome);
    repo.logEvent({
      runId: this.runId,
      type: `run.${outcome}`,
      payload: { turns: this.turns },
    });
    this.d.bus.publish({ type: `run.${outcome}`, runId: this.runId });
    return outcome;
  }

  private dispatchWorkers(): boolean {
    let dispatched = false;
    while (this.activeWorkers.size < this.d.config.maxWorkers) {
      const task = this.d.transport.claimTask(this.runId, this.d.config.maxDepth);
      if (!task) break;
      dispatched = true;
      this.startWorker(task);
    }
    return dispatched;
  }

  private abortCancelledWorkers(): void {
    for (const [taskId, ctrl] of this.workerAborts) {
      if (ctrl.signal.aborted) continue;
      if (this.d.repo.getTask(taskId)?.status === "cancelled") ctrl.abort();
    }
  }

  private dispatchPlanners(): boolean {
    let dispatched = false;
    const agents = this.d.repo.listAgents(this.runId);
    for (const a of agents) {
      if (this.activePlanners.size >= this.d.config.maxPlanners) break;
      if (this.activePlanners.has(a.id)) continue;
      if (a.status !== "idle") continue;
      if (this.d.repo.countUnread(a.id) === 0) continue;
      dispatched = true;
      this.startPlanner(a.id);
    }
    return dispatched;
  }

  private startWorker(task: TaskRow): void {
    const { repo, transport, driver, bus } = this.d;
    this.turns++;
    repo.setTaskStatus(task.id, "running");
    const startedAt = Date.now();
    const abort = new AbortController();
    this.workerAborts.set(task.id, abort);
    const signal = AbortSignal.any([this.abortController.signal, abort.signal]);
    const p = (async () => {
      try {
        const handoff = await driver.runWorker(task, signal);
        if (this.workWasCancelled(task.id)) return;
        repo.setTaskStatus(task.id, handoff.failed ? "failed" : "done");
        if (task.type === "verifier") {
          repo.setTaskVerdict(task.id, handoff.verdict ?? "NEEDS_WORK");
        }
        const label = handoff.failed ? "FAILED" : "completed";
        const content = [
          task.type === "verifier" ? `VERDICT: ${handoff.verdict === "CLEAN" ? "CLEAN" : "NEEDS WORK"}` : "",
          task.type === "verifier" && handoff.verdict !== "CLEAN"
            ? "Review the required actions, delegate substantive fixes, then spawn a fresh verifier."
            : "",
          `Task ${label}.`,
          `Title: ${task.title}`,
          `Task ID: ${task.id}`,
          `Task: ${task.scope_md}`,
          handoff.requiredActions ? `REQUIRED ACTIONS:\n${handoff.requiredActions}` : "",
          `Summary: ${handoff.summary}`,
          handoff.concerns ? `Concerns: ${handoff.concerns}` : "",
          handoff.findings ? `Findings: ${handoff.findings}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        transport.pushInbox({
          runId: this.runId,
          agentId: task.requester_agent_id,
          kind: "handoff",
          refId: task.id,
          contentMd: content,
        });
        this.reviveIfDone(task.requester_agent_id);
        repo.logEvent({
          runId: this.runId,
          taskId: task.id,
          type: handoff.failed ? "worker.failed" : "worker.done",
        });
      } catch (e) {
        if (this.workWasCancelled(task.id)) return;
        repo.setTaskStatus(task.id, "failed");
        transport.pushInbox({
          runId: this.runId,
          agentId: task.requester_agent_id,
          kind: "handoff",
          refId: task.id,
          contentMd: `Task FAILED with an error.\nTitle: ${task.title}\nTask ID: ${task.id}\nTask: ${task.scope_md}\nError: ${String(e)}`,
        });
        this.reviveIfDone(task.requester_agent_id);
        repo.logEvent({
          runId: this.runId,
          taskId: task.id,
          type: "worker.error",
          payload: {
            error: String(e),
            ...serializeError(e),
            elapsedMs: Date.now() - startedAt,
            title: task.title,
            scope: task.scope_md.slice(0, 1000),
          },
        });
      } finally {
        this.activeWorkers.delete(task.id);
        this.workerAborts.delete(task.id);
        bus.publish({
          type: "worker.finished",
          runId: this.runId,
          taskId: task.id,
        });
      }
    })();
    this.activeWorkers.set(task.id, p);
  }

  private startPlanner(agentId: string): void {
    const { repo, driver, bus } = this.d;
    this.turns++;
    repo.setAgentStatus(agentId, "active");
    const startedAt = Date.now();
    const p = (async () => {
      try {
        await driver.runPlanner(agentId, this.abortController.signal);
        if (this.agentWasCancelled(agentId)) return;
        const after = repo.getAgent(agentId);
        if (after?.parent_agent_id === null && after.status !== "cancelled") {
          repo.setAgentStatus(agentId, "idle");
        } else if (after?.status === "active") {
          repo.setAgentStatus(agentId, "idle");
        }
      } catch (e) {
        if (this.agentWasCancelled(agentId)) return;
        repo.setAgentStatus(agentId, "idle");
        repo.logEvent({
          runId: this.runId,
          agentId,
          type: "planner.error",
          payload: {
            error: String(e),
            ...serializeError(e),
            elapsedMs: Date.now() - startedAt,
          },
        });
      } finally {
        this.activePlanners.delete(agentId);
        bus.publish({ type: "planner.finished", runId: this.runId, agentId });
      }
    })();
    this.activePlanners.set(agentId, p);
  }

  private reviveIfDone(agentId: string): void {
    const a = this.d.repo.getAgent(agentId);
    if (a && a.status === "done") this.d.repo.setAgentStatus(agentId, "idle");
  }

  private workWasCancelled(taskId: string): boolean {
    return this.stopped || this.d.repo.getTask(taskId)?.status === "cancelled";
  }

  private agentWasCancelled(agentId: string): boolean {
    return this.stopped || this.d.repo.getAgent(agentId)?.status === "cancelled";
  }

  private decideQuiescence(): "idle" {
    return "idle";
  }

  private budgetExceeded(): boolean {
    const { config, repo } = this.d;
    if (this.turns >= config.budget.maxTurns) {
      repo.logEvent({
        runId: this.runId,
        type: "budget.turns",
        payload: { turns: this.turns },
      });
      return true;
    }
    if (Date.now() - this.startedAt >= config.budget.maxWallclockMs) {
      repo.logEvent({ runId: this.runId, type: "budget.wallclock" });
      return true;
    }
    const calls = this.d.driver.getLlmCalls?.() ?? 0;
    if (calls >= config.budget.maxLlmCalls) {
      repo.logEvent({
        runId: this.runId,
        type: "budget.llmcalls",
        payload: { calls },
      });
      return true;
    }
    return false;
  }
}
