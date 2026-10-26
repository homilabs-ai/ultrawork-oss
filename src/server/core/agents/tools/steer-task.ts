import type { ProcessInputStepArgs, ProcessInputStepResult } from "@mastra/core/processors";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { TaskSteering } from "@/core/runtime/steering.ts";
import type { PlannerToolContext } from "./context.ts";

export const STEER_PREFIX =
  "Steering note from your planner, sent while you work. Where it conflicts with your task, it wins. Adjust course and mention it in your handoff:";

export function steeringPrepareStep(steering: TaskSteering, taskId: string) {
  return ({ messageList }: ProcessInputStepArgs): ProcessInputStepResult | undefined => {
    const notes = steering.drain(taskId);
    if (notes.length === 0) return;
    for (const note of notes) messageList.addSystem(`${STEER_PREFIX}\n${note}`, "planner-steer");
    return { messageList };
  };
}

const OPEN = new Set(["pending", "claimed", "running"]);

export function steerTaskTool({ repo, agent, steering }: PlannerToolContext) {
  return createTool({
    id: "steerTask",
    description:
      "Send a note to the worker on a task you delegated, without restarting it: a correction, new constraint, or change of direction " +
      "(often because the user steered you). A running worker sees it before its next step; a queued task gets it when it starts. " +
      "Use cancelTask instead if the task should not continue at all.",
    inputSchema: z.object({
      taskId: z.string().describe("Id of a task you delegated."),
      note: z.string().min(1).describe("What should change. Self-contained; the worker cannot see your conversation."),
    }),
    execute: async (input: { taskId: string; note: string }) => {
      const note = input.note.trim();
      if (!note) return { ok: false, error: "Note must not be empty." };
      const task = repo.getTask(input.taskId.trim());
      if (!task || task.run_id !== agent.run_id || task.requester_agent_id !== agent.id) {
        return { ok: false, error: "No task with that id among the tasks you delegated." };
      }
      if (!OPEN.has(task.status)) {
        return { ok: false, error: `Task is already ${task.status}. Spawn a follow-up task instead.` };
      }
      if (!steering) return { ok: false, error: "Steering is not available in this runtime." };
      steering.push(task.id, note);
      repo.logEvent({
        runId: task.run_id,
        agentId: agent.id,
        taskId: task.id,
        type: "task.steered",
        payload: { msg: `Planner steer: ${note.slice(0, 500)}` },
      });
      return {
        ok: true,
        note:
          task.status === "pending"
            ? "Queued; the worker gets it when the task starts."
            : "Delivered before the worker's next step. Its handoff should reflect it.",
      };
    },
  });
}
