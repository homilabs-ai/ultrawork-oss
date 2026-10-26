import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PlannerToolContext } from "./context.ts";

export function declareScopeCompleteTool({ repo, transport, agent, config, verifierPlugin }: PlannerToolContext) {
  const requireVerifier = verifierPlugin ?? config.verifierPlugin;
  return createTool({
    id: "declareScopeComplete",
    description: requireVerifier
      ? "Declare your sub-planner scope delivered. Refused while work you delegated is unfinished, or before a verifier you spawned has reported."
      : "Declare your sub-planner scope delivered. Refused while work you delegated is unfinished.",
    inputSchema: z.object({ summary: z.string() }),
    execute: async (input: { summary: string }) => {
      if (!agent.parent_agent_id) {
        return {
          ok: false,
          error: "Root planners cannot use declareScopeComplete.",
        };
      }

      const ownTasks = repo.listTasks(agent.run_id).filter((task) => task.requester_agent_id === agent.id);
      const openTasks = ownTasks.filter(
        (task) => task.status === "pending" || task.status === "claimed" || task.status === "running",
      );
      const openSubplanners = repo
        .listAgents(agent.run_id)
        .filter(
          (child) => child.parent_agent_id === agent.id && (child.status === "idle" || child.status === "active"),
        );
      if (openTasks.length > 0 || openSubplanners.length > 0) {
        return {
          ok: false,
          error:
            "You cannot declare complete while delegated work is unfinished: " +
            [...openTasks.map((task) => task.title), ...openSubplanners.map((child) => child.scope_md)].join("; "),
        };
      }

      const verified = ownTasks.some(
        (task) => task.type === "verifier" && (task.status === "done" || task.status === "failed"),
      );
      if (requireVerifier && !verified) {
        return {
          ok: false,
          error:
            'The final-verifier plugin is on for this goal. Spawn a verifier (spawnTask with type: "verifier"), wait for its handoff, and act on it before declaring complete.',
        };
      }

      repo.setAgentStatus(agent.id, "done");
      transport.pushInbox({
        runId: agent.run_id,
        agentId: agent.parent_agent_id,
        kind: "handoff",
        refId: agent.id,
        contentMd: `Sub-planner completed its scope.\nScope: ${agent.scope_md}\nSummary: ${input.summary}`,
      });
      repo.logEvent({
        runId: agent.run_id,
        agentId: agent.id,
        type: "planner.complete",
        payload: { summary: input.summary.slice(0, 500) },
      });
      return { ok: true };
    },
  });
}
