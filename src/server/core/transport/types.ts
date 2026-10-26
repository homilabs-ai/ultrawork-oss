import type { InboxRow, TaskRow, TaskType } from "@/core/db/types.ts";

export interface NewTask {
  runId: string;
  requesterAgentId: string;
  title: string;
  scopeMd: string;
  depth: number;
  type?: TaskType;
}

export interface NewInbox {
  runId: string;
  agentId: string;
  kind: InboxRow["kind"];
  refId: string | null;
  contentMd: string;
}

export interface CancelTask {
  task: TaskRow;
  agentId: string;
  reason: string;
}

export interface Transport {
  enqueueTask(t: NewTask): TaskRow;
  claimTask(runId: string, maxDepth: number): TaskRow | null;
  cancelTask(c: CancelTask): TaskRow;
  pushInbox(item: NewInbox): InboxRow;
  drainInbox(agentId: string): InboxRow[];
}
