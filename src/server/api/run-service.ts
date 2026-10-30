import type { AgentRow, EventRow, Repo, RunRow, TaskRow } from "@/core/index.ts";

const PROGRESS_EVENT_LIMIT = 200;

const PLANNER_EVENT_LIMIT = 400;
const TASK_EVENT_LIMIT = 200;

export type PlannerTranscriptItem = {
  id: string;
  kind: "assistant" | "tool" | "steer";
  timestamp: number;
  text: string;
  toolName?: string;
  toolCallId?: string;
  args?: string;
  result?: string;
  isError?: boolean;
  unresolved?: boolean;
};

export type RunAgent = {
  id: string;
  role: AgentRow["role"];
  parent: string | null;
  depth: number;
  status: AgentRow["status"];
  scope: string;
  unread: number;
};

export type RunTask = {
  id: string;
  requesterAgentId: string;
  title: string;
  scope: string;
  status: TaskRow["status"];
  type: TaskRow["type"];
  verdict: TaskRow["verdict"];
  depth: number;
  createdAt: number;
  claimedAt: number | null;
  finishedAt: number | null;
};

export type RunEvent = {
  id: string;
  type: string;
  agentId: string | null;
  taskId: string | null;
  timestamp: number;
  payload: unknown;
};

export type RunTaskCounts = {
  pending: number;
  claimed: number;
  running: number;
  done: number;
  failed: number;
  cancelled: number;
};

export type RootPlannerState = {
  agentId: string;
  role: AgentRow["role"];
  status: AgentRow["status"];
  scope: string;
  unread: number;
  turnCount: number;
  currentActivity: string | null;

  transcript: PlannerTranscriptItem[];
  lastOutput: string | null;
  lastError: string | null;
  turnStartedAt: number | null;
  updatedAt: number;
};

export type TaskTranscriptLine = {
  id: string;
  type: string;
  timestamp: number;
  message: string;
};

export type TaskDetail = {
  task: RunTask;
  transcript: TaskTranscriptLine[];
  handoff: string | null;
};

export type RunSummary = {
  id: string;
  title: string;
  status: RunRow["status"];
  createdAt: number;
  stoppedAt: number | null;
  taskCounts: RunTaskCounts;
};

export type RunStats = {
  turnCount: number;
  agentCount: number;
  elapsedMs: number;
  taskCounts: RunTaskCounts;
};

export type RunState = {
  run: RunRow;
  agents: RunAgent[];
  tasks: RunTask[];
  tasksByStatus: RunTaskCounts;
  events: RunEvent[];
  rootPlanner: RootPlannerState | null;
  stats: RunStats;
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const TASK_EVENT_LABELS: Record<string, string> = {
  "worker.turn.start": "Worker turn started",
  "worker.turn.end": "Worker turn ended",
  "worker.done": "Worker completed",
  "worker.failed": "Worker failed",
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function payloadMsg(payload: Record<string, unknown>): string | null {
  if (typeof payload.msg === "string") return payload.msg;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

function firstLine(md: string): string {
  const line = md.split("\n").find((l) => l.trim().length > 0) ?? md;
  return (
    line
      .replace(/^#+\s*/, "")
      .trim()
      .slice(0, 80) || "Untitled run"
  );
}

function describeActivity(item: PlannerTranscriptItem): string {
  if (item.kind !== "tool" || !item.toolName) return item.text;
  return item.text ? `${item.toolName}: ${item.text}` : item.toolName;
}

const STEER_NOTE_PREFIX = "Operator steering note:\n";

function displaySteerText(raw: string): string {
  return raw.startsWith(STEER_NOTE_PREFIX) ? raw.slice(STEER_NOTE_PREFIX.length) : raw;
}

function countTasksByStatus(tasks: RunTask[]): RunTaskCounts {
  return {
    pending: tasks.filter((t) => t.status === "pending").length,
    claimed: tasks.filter((t) => t.status === "claimed").length,
    running: tasks.filter((t) => t.status === "running").length,
    done: tasks.filter((t) => t.status === "done").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
  };
}

export class RunService {
  constructor(private readonly repo: Repo) {}

  getRun(runId: string): RunRow | null {
    return this.repo.getRun(runId);
  }

  listAgents(runId: string): RunAgent[] {
    return this.repo.listAgents(runId).map((a) => ({
      id: a.id,
      role: a.role,
      parent: a.parent_agent_id,
      depth: a.depth,
      status: a.status,
      scope: a.scope_md,
      unread: this.repo.countUnread(a.id),
    }));
  }

  listTasks(runId: string): RunTask[] {
    return this.repo.listTasks(runId).map((t) => this.serializeTask(t));
  }

  listProgressEvents(runId: string, limit = PROGRESS_EVENT_LIMIT): RunEvent[] {
    return this.repo.listEvents(runId, limit).map((e) => this.serializeEvent(e));
  }

  listRuns(limit = 50): RunSummary[] {
    return this.repo.listRuns(limit).map((run) => {
      const tasks = this.listTasks(run.id);
      return {
        id: run.id,
        title: firstLine(run.instruction_md),
        status: run.status,
        createdAt: run.created_at,
        stoppedAt: run.stopped_at,
        taskCounts: countTasksByStatus(tasks),
      };
    });
  }

  getRootPlannerState(runId: string): RootPlannerState | null {
    const run = this.getRun(runId);
    if (!run?.root_agent_id) return null;
    const agent = this.repo.getAgent(run.root_agent_id);
    if (!agent) return null;

    const events = this.repo.listAgentEvents(runId, agent.id, PLANNER_EVENT_LIMIT);

    const chronological = [...events].reverse();

    let turnStartedAt: number | null = null;
    let lastError: string | null = null;
    const transcript: PlannerTranscriptItem[] = [];

    const byToolCallId = new Map<string, PlannerTranscriptItem>();

    for (const event of chronological) {
      const payload = parsePayload(event.payload_json);
      switch (event.type) {
        case "planner.turn.start":
          turnStartedAt = event.ts;
          break;

        case "planner.turn.end":
          for (const item of transcript) {
            if (item.kind === "tool" && item.result === undefined) item.unresolved = true;
          }
          break;

        case "planner.step": {
          const label = payloadMsg(payload);
          if (!label) break;
          const toolCallId = asString(payload.toolCallId);
          const item: PlannerTranscriptItem = {
            id: `ev:${event.id}`,
            kind: "tool",
            timestamp: event.ts,
            text: label,
            toolName: asString(payload.toolName),
            toolCallId,
            args: asString(payload.args),
          };
          transcript.push(item);
          if (toolCallId) byToolCallId.set(toolCallId, item);
          break;
        }

        case "planner.tool.result": {
          const toolCallId = asString(payload.toolCallId);
          const call = toolCallId ? byToolCallId.get(toolCallId) : undefined;

          if (!call) break;

          call.result = asString(payload.result) ?? "";
          call.isError = payload.isError === true;
          break;
        }

        case "planner.text": {
          const text = asString(payload.text)?.trim();
          if (!text) break;
          transcript.push({
            id: `ev:${event.id}`,
            kind: "assistant",
            timestamp: event.ts,
            text,
          });
          break;
        }

        case "planner.steer": {
          const raw = asString(payload.text)?.trim();
          if (!raw) break;
          const text = displaySteerText(raw).trim();
          if (!text) break;
          transcript.push({
            id: `ev:${event.id}`,
            kind: "steer",
            timestamp: event.ts,
            text,
          });
          break;
        }

        case "planner.llm.error":
        case "planner.error": {
          lastError = payloadMsg(payload) ?? lastError;
          break;
        }
      }
    }

    const turnCount = this.repo.countEventsByType(runId, ["planner.turn.start"], {
      agentId: agent.id,
    });

    const lastOutput = transcript.findLast((item) => item.kind === "assistant")?.text ?? null;

    const tip = transcript.at(-1);
    let currentActivity: string | null = null;
    if (tip) {
      currentActivity = describeActivity(tip);
    } else if (agent.status === "idle") {
      currentActivity = lastOutput;
    }

    return {
      agentId: agent.id,
      role: agent.role,
      status: agent.status,
      scope: agent.scope_md,
      unread: this.repo.countUnread(agent.id),
      turnCount,
      currentActivity,
      transcript,
      lastOutput,
      lastError,
      turnStartedAt,
      updatedAt: agent.updated_at,
    };
  }

  getTaskDetail(runId: string, taskId: string): TaskDetail | null {
    const task = this.repo.getTask(taskId);
    if (!task || task.run_id !== runId) return null;

    const events = this.repo.listTaskEvents(runId, taskId, TASK_EVENT_LIMIT);
    const chronological = [...events].reverse();

    const transcript: TaskTranscriptLine[] = chronological.map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: event.ts,

      message: payloadMsg(parsePayload(event.payload_json)) ?? TASK_EVENT_LABELS[event.type] ?? event.type,
    }));

    const handoffRow = this.repo.getInboxByRef(runId, taskId);
    const handoff = handoffRow?.content_md ?? null;

    return {
      task: this.serializeTask(task),
      transcript,
      handoff,
    };
  }

  getState(runId: string): RunState | null {
    const run = this.getRun(runId);
    if (!run) return null;

    const agents = this.listAgents(runId);
    const tasks = this.listTasks(runId);
    const events = this.listProgressEvents(runId);
    const tasksByStatus = countTasksByStatus(tasks);
    const turnCount = this.repo.countEventsByType(runId, ["planner.turn.start", "worker.turn.start"]);
    const endTs = run.stopped_at ?? Date.now();

    return {
      run,
      agents,
      tasks,
      tasksByStatus,
      events,
      rootPlanner: this.getRootPlannerState(runId),
      stats: {
        turnCount,
        agentCount: agents.length,
        elapsedMs: Math.max(0, endTs - run.created_at),
        taskCounts: tasksByStatus,
      },
    };
  }

  private serializeTask(t: TaskRow): RunTask {
    return {
      id: t.id,
      requesterAgentId: t.requester_agent_id,
      title: t.title,
      scope: t.scope_md,
      status: t.status,
      type: t.type,
      verdict: t.verdict,
      depth: t.depth,
      createdAt: t.created_at,
      claimedAt: t.claimed_at,
      finishedAt: t.finished_at,
    };
  }

  private serializeEvent(e: EventRow): RunEvent {
    return {
      id: e.id,
      type: e.type,
      agentId: e.agent_id,
      taskId: e.task_id,
      timestamp: e.ts,
      payload: parsePayload(e.payload_json),
    };
  }
}
