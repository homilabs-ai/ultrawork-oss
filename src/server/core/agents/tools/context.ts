import type { HarnessConfig } from "@/core/config.ts";
import type { Repo } from "@/core/db/repo.ts";
import type { AgentRow, TaskRow } from "@/core/db/types.ts";
import type { Transport } from "@/core/transport/types.ts";
import type { Handoff } from "@/core/runtime/driver.ts";
import type { TaskSteering } from "@/core/runtime/steering.ts";

export interface PlannerToolContext {
  repo: Repo;
  transport: Transport;
  config: HarnessConfig;
  agent: AgentRow;

  workspaceRoot: string;
  verifierPlugin?: boolean;
  steering?: TaskSteering;
}

export interface SearchToolContext {
  repo: Repo;
  runId: string;
  agentId?: string;
  taskId?: string;
}

export interface WorkerToolContext {
  repo: Repo;
  workspaceRoot: string;
  config: HarnessConfig;
  task: TaskRow;

  setHandoff: (h: Handoff) => void;
}
