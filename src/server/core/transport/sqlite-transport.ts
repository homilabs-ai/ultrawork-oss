import type { Repo } from "@/core/db/repo.ts";
import type { InboxRow, TaskRow } from "@/core/db/types.ts";
import type { EventBus } from "./events.ts";
import type { CancelTask, NewInbox, NewTask, Transport } from "./types.ts";

export class SqliteTransport implements Transport {
  constructor(
    private repo: Repo,
    private bus: EventBus,
  ) {}

  enqueueTask(t: NewTask): TaskRow {
    const task = this.repo.enqueueTask({
      runId: t.runId,
      requesterAgentId: t.requesterAgentId,
      title: t.title,
      scopeMd: t.scopeMd,
      depth: t.depth,
      type: t.type,
    });
    this.repo.logEvent({
      runId: t.runId,
      agentId: t.requesterAgentId,
      taskId: task.id,
      type: "task.enqueued",
      payload: { depth: t.depth, title: t.title, taskType: t.type ?? "worker" },
    });
    this.bus.publish({ type: "task.enqueued", runId: t.runId, agentId: t.requesterAgentId, taskId: task.id });
    return task;
  }

  claimTask(runId: string, maxDepth: number): TaskRow | null {
    const task = this.repo.claimNextTask(runId, maxDepth);
    if (task) {
      this.repo.logEvent({ runId, taskId: task.id, type: "task.claimed" });
      this.bus.publish({ type: "task.claimed", runId, taskId: task.id });
    }
    return task;
  }

  cancelTask({ task, agentId, reason }: CancelTask): TaskRow {
    this.repo.setTaskStatus(task.id, "cancelled");
    this.repo.logEvent({
      runId: task.run_id,
      agentId,
      taskId: task.id,
      type: "task.cancelled",
      payload: { msg: `Cancelled by planner: ${reason.slice(0, 500)}`, previousStatus: task.status, title: task.title },
    });
    this.bus.publish({ type: "task.cancelled", runId: task.run_id, agentId, taskId: task.id });
    return this.repo.getTask(task.id) ?? task;
  }

  pushInbox(item: NewInbox): InboxRow {
    const row = this.repo.pushInbox({
      runId: item.runId,
      agentId: item.agentId,
      kind: item.kind,
      refId: item.refId,
      contentMd: item.contentMd,
    });
    this.repo.logEvent({
      runId: item.runId,
      agentId: item.agentId,
      type: "inbox.pushed",
      payload: { kind: item.kind, refId: item.refId },
    });
    this.bus.publish({ type: "inbox.pushed", runId: item.runId, agentId: item.agentId, payload: { kind: item.kind } });
    return row;
  }

  drainInbox(agentId: string): InboxRow[] {
    return this.repo.drainInbox(agentId);
  }
}
