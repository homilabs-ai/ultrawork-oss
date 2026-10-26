import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PlannerToolContext } from "./context.ts";

export function spawnSubplannerTool({ repo, transport, config, agent }: PlannerToolContext) {
  return createTool({
    id: "spawnSubplanner",
    description:
      "Hand a large, subdividable slice of your scope to a sub-planner that will own it recursively. Include the goal's project folder and any required subfolder/file layout in the scope.",
    inputSchema: z.object({ scope: z.string() }),
    execute: async (input: { scope: string }) => {
      if (agent.depth + 1 > config.maxDepth) {
        return { ok: false, error: "Max planning depth reached. Use spawnTask to delegate to workers instead." };
      }
      const sub = repo.createAgent({
        runId: agent.run_id,
        role: "planner",
        parentAgentId: agent.id,
        scopeMd: input.scope,
        depth: agent.depth + 1,
      });
      transport.pushInbox({
        runId: agent.run_id,
        agentId: sub.id,
        kind: "scope",
        refId: null,
        contentMd: `You now own this scope:\n${input.scope}`,
      });
      repo.logEvent({
        runId: agent.run_id,
        agentId: agent.id,
        type: "subplanner.spawned",
        payload: { subId: sub.id, depth: sub.depth },
      });
      return { ok: true, note: "Sub-planner created and now owns that slice." };
    },
  });
}
