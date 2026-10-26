export type RunStatus = "running" | "idle";
export type TaskStatus =
  | "pending"
  | "claimed"
  | "running"
  | "done"
  | "failed"
  | "cancelled";
export type AgentStatus =
  | "idle"
  | "active"
  | "done"
  | "failed"
  | "cancelled";
export type AgentRole = "root" | "planner";

export type Run = {
  id: string;
  instruction_md: string;
  status: RunStatus;
  root_agent_id: string | null;
  created_at: number;
  stopped_at: number | null;
};

export type RunAgent = {
  id: string;
  role: AgentRole;
  parent: string | null;
  depth: number;
  status: AgentStatus;
  scope: string;
  unread: number;
};

export type RunTask = {
  id: string;
  requesterAgentId: string;
  title: string;
  scope: string;
  status: TaskStatus;
  type: "worker" | "verifier";
  verdict: "CLEAN" | "NEEDS_WORK" | null;
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
  payload: Record<string, unknown>;
};

export type RunTaskCounts = {
  pending: number;
  claimed: number;
  running: number;
  done: number;
  failed: number;
  cancelled: number;
};

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

export type RootPlannerState = {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
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
  status: RunStatus;
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
  run: Run;
  agents: RunAgent[];
  tasks: RunTask[];
  tasksByStatus: RunTaskCounts;
  events: RunEvent[];
  rootPlanner: RootPlannerState | null;
  stats: RunStats;
};

export type ArtifactFile = {
  path: string;
  name: string;
  mimeType: string;
  bytes: number;
  modifiedAt: number;
};
