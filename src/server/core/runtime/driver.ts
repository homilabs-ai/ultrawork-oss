import type { TaskRow } from "@/core/db/types.ts";

export interface Handoff {
  summary: string;
  concerns?: string;
  findings?: string;
  failed?: boolean;
  verdict?: "CLEAN" | "NEEDS_WORK";
  requiredActions?: string;
}

export interface AgentDriver {
  runPlanner(agentId: string, abortSignal?: AbortSignal): Promise<void>;

  runWorker(task: TaskRow, abortSignal?: AbortSignal): Promise<Handoff>;

  getLlmCalls?(): number;
}
