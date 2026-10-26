import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PlannerToolContext } from "./context.ts";

const OPEN = new Set(["pending", "claimed", "running"]);

export function cancelTaskTool({ repo, transport, agent }: PlannerToolContext) {
  return createTool({
    id: "cancelTask",
    description:
      "Cancel a task you delegated that is no longer needed: superseded by a new plan, a duplicate, heading the wrong way, or stuck. " +
      "A queued task is dropped; a running worker is stopped mid-work. No handoff arrives for a cancelled task. " +
      "Files it already wrote stay in the workspace. Use the task id from spawnTask or your delegated-task list.",
    inputSchema: z.object({
      taskId: z.string().describe("Id of a task you delegated."),
      reason: z.string().describe("Short reason, recorded in the run log."),
    }),
    execute: async (input: { taskId: string; reason: string }) => {
      const task = repo.getTask(input.taskId.trim());
      if (!task || task.run_id !== agent.run_id || task.requester_agent_id !== agent.id) {
        return { ok: false, error: "No task with that id among the tasks you delegated." };
      }
      if (!OPEN.has(task.status)) {
        return { ok: false, error: `Task is already ${task.status}; nothing to cancel.` };
      }
      const wasRunning = task.status !== "pending";
      transport.cancelTask({ task, agentId: agent.id, reason: input.reason });
      return {
        ok: true,
        note: wasRunning
          ? "Worker is being stopped. No handoff will arrive; check the workspace for anything it already wrote."
          : "Removed from the queue before it started.",
      };
    },
  });
}
