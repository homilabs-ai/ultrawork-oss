import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PlannerToolContext } from "./context.ts";

const WORKER_DESCRIPTION =
  "Delegate one concrete, independently-completable task. For file-producing work, include explicit output paths under the goal's project folder. Returns the task id; results arrive later as inbox handoffs.";

const VERIFIER_DESCRIPTION =
  'Delegate one concrete, independently-completable task. For file-producing work, include explicit output paths under the goal\'s project folder. Set type: "verifier" to spawn a read-only audit on an independent model. A verifier receives the original goal automatically, so its scope is only an optional focus note. Returns the task id; results arrive later as inbox handoffs.';

export function spawnTaskTool({ transport, agent, config, verifierPlugin: forRun }: PlannerToolContext) {
  const verifierPlugin = forRun ?? config.verifierPlugin;
  return createTool({
    id: "spawnTask",
    description: verifierPlugin ? VERIFIER_DESCRIPTION : WORKER_DESCRIPTION,
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "Short one-line label for this task (shown in Goals). Do not repeat the full goal name; make it specific to this slice.",
        ),
      scope: z
        .string()
        .optional()
        .describe(
          verifierPlugin
            ? "For a worker: a self-contained task description. For a verifier: an optional focus note; omit it to audit the entire goal."
            : "A self-contained task description.",
        ),
      ...(verifierPlugin
        ? {
            type: z
              .enum(["worker", "verifier"])
              .optional()
              .describe('Defaults to "worker". "verifier" audits the finished work.'),
          }
        : {}),
    }),
    execute: async (input) => {
      const type = (input.type as "worker" | "verifier" | undefined) ?? "worker";
      const scope = input.scope?.trim() ?? "";
      if (type === "worker" && !scope) {
        return { ok: false, error: "A worker task needs a scope describing what to do." };
      }
      const task = transport.enqueueTask({
        runId: agent.run_id,
        requesterAgentId: agent.id,
        title: input.title,
        scopeMd: scope,
        depth: agent.depth + 1,
        type,
      });
      return {
        ok: true,
        taskId: task.id,
        note:
          type === "verifier"
            ? "Verifier queued with the original goal and read-only instructions."
            : "Task queued.",
      };
    },
  });
}
