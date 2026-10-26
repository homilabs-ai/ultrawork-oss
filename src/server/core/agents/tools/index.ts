import type { ToolsInput } from "@mastra/core/agent";
import { exa } from "@/core/lib/exa.ts";
import { cancelTaskTool } from "./cancel-task.ts";
import type { PlannerToolContext, SearchToolContext, WorkerToolContext } from "./context.ts";
import { declareScopeCompleteTool } from "./declare-scope-complete.ts";
import { webFetchTool, webSearchTool } from "./exa-search.ts";
import { replyInlineMessageTool } from "./reply-inline-message.ts";
import { runCommandTool } from "./run-command.ts";
import { spawnSubplannerTool } from "./spawn-subplanner.ts";
import { spawnTaskTool } from "./spawn-task.ts";
import { steerTaskTool } from "./steer-task.ts";
import { submitHandoffTool } from "./submit-handoff.ts";

export type { PlannerToolContext, WorkerToolContext } from "./context.ts";

function webTools(ctx: SearchToolContext): ToolsInput {
  return exa ? { webSearch: webSearchTool(ctx, exa), webFetch: webFetchTool(ctx, exa) } : {};
}

export function plannerTools(ctx: PlannerToolContext) {
  return {
    spawnTask: spawnTaskTool(ctx),
    cancelTask: cancelTaskTool(ctx),
    steerTask: steerTaskTool(ctx),
    spawnSubplanner: spawnSubplannerTool(ctx),
    ...webTools({ repo: ctx.repo, runId: ctx.agent.run_id, agentId: ctx.agent.id }),
    reply_inline_message: replyInlineMessageTool(),
    ...(ctx.agent.parent_agent_id ? { declareScopeComplete: declareScopeCompleteTool(ctx) } : {}),
  };
}

export function workerTools(ctx: WorkerToolContext) {
  return {
    ...webTools({ repo: ctx.repo, runId: ctx.task.run_id, taskId: ctx.task.id }),
    submitHandoff: submitHandoffTool(ctx),
    runCommand: runCommandTool(ctx),
  };
}
