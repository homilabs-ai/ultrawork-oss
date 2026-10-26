import { describe, expect, test } from "bun:test";
import { plannerSystemInstructions } from "@/core/agents/prompts.ts";
import type { PlannerToolContext } from "@/core/agents/tools/context.ts";
import { plannerTools } from "@/core/agents/tools/index.ts";
import { spawnTaskTool } from "@/core/agents/tools/spawn-task.ts";
import { loadConfig } from "@/core/config.ts";
import type { AgentRow } from "@/core/db/types.ts";
import type { NewTask, Transport } from "@/core/transport/types.ts";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

function stubAgent(): AgentRow {
  return {
    id: "agent-1",
    run_id: "run-1",
    role: "root",
    parent_agent_id: null,
    scope_md: "mission",
    depth: 0,
    status: "active",
    created_at: 0,
    updated_at: 0,
  };
}

function spawnCtx(verifierPlugin: boolean, parentAgentId: string | null = null) {
  const queued: NewTask[] = [];
  const transport = {
    enqueueTask(task: NewTask) {
      queued.push(task);
      return { id: "task-1" };
    },
  } as Transport;
  const ctx: PlannerToolContext = {
    repo: null as never,
    transport,
    config: loadConfig({ verifierPlugin }),
    agent: { ...stubAgent(), parent_agent_id: parentAgentId },
    workspaceRoot: "/tmp",
  };
  return { ctx, queued };
}

describe("verifier plugin default", () => {
  test("is off unless PLUGIN_VERIFIER_DEFAULT=on", () => {
    withEnv("PLUGIN_VERIFIER_DEFAULT", undefined, () => {
      expect(loadConfig().verifierPlugin).toBe(false);
    });
    withEnv("PLUGIN_VERIFIER_DEFAULT", "off", () => {
      expect(loadConfig().verifierPlugin).toBe(false);
    });
    withEnv("PLUGIN_VERIFIER_DEFAULT", "on", () => {
      expect(loadConfig().verifierPlugin).toBe(true);
    });
  });

  test("planner instructions omit the verifier plugin unless enabled", () => {
    const off = plannerSystemInstructions({ verifierPlugin: false });
    expect(off).not.toContain('type: "verifier"');
    expect(off).not.toContain("ALWAYS spawn a verification task");
    expect(off).not.toContain("Worker plugin — final verifier");

    const on = plannerSystemInstructions({ verifierPlugin: true });
    expect(on).toContain('type: "verifier"');
    expect(on).toContain("ALWAYS spawn a verification task");
    expect(on).toContain("Worker plugin — final verifier");
  });

  test("only subplanners have the manual completion tool", () => {
    const rootInstructions = plannerSystemInstructions({
      verifierPlugin: false,
    });
    const subplannerInstructions = plannerSystemInstructions({
      verifierPlugin: false,
      isRoot: false,
    });
    expect(rootInstructions).toContain("You do not have declareScopeComplete");
    expect(subplannerInstructions).toContain("call declareScopeComplete with a concise summary");
    expect(plannerTools(spawnCtx(false).ctx)).not.toHaveProperty("declareScopeComplete");
    expect(plannerTools(spawnCtx(false, "parent-1").ctx)).toHaveProperty("declareScopeComplete");
  });

  test("spawnTask does not advertise or queue verifiers when the plugin is off", async () => {
    const { ctx, queued } = spawnCtx(false);
    const tool = spawnTaskTool(ctx);

    expect(tool.description).not.toContain("verifier");

    const spoofed = await tool.execute!({ title: "Audit", scope: "Check the work", type: "verifier" }, {} as never);
    expect(spoofed).toMatchObject({ ok: true });
    expect(queued).toEqual([expect.objectContaining({ title: "Audit", type: "worker" })]);

    const worker = await tool.execute!({ title: "Write report", scope: "Write the report." }, {} as never);
    expect(worker).toMatchObject({ ok: true });
    expect(queued[1]).toMatchObject({ title: "Write report", type: "worker" });
  });

  test("the run's verifier setting overrides the config default", () => {
    const on = spawnCtx(false);
    expect(spawnTaskTool({ ...on.ctx, verifierPlugin: true }).description).toContain('type: "verifier"');
    const off = spawnCtx(true);
    expect(spawnTaskTool({ ...off.ctx, verifierPlugin: false }).description).not.toContain("verifier");
  });

  test("spawnTask queues a verifier when the plugin is on", async () => {
    const { ctx, queued } = spawnCtx(true);
    const tool = spawnTaskTool(ctx);

    expect(tool.description).toContain('type: "verifier"');

    const result = await tool.execute!({ title: "Audit the goal", type: "verifier" }, {} as never);
    expect(result).toMatchObject({ ok: true });
    expect(queued).toEqual([
      expect.objectContaining({
        title: "Audit the goal",
        type: "verifier",
        scopeMd: "",
      }),
    ]);
  });
});
