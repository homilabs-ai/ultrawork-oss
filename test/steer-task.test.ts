import { expect, test } from "bun:test";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { STEER_PREFIX, steeringPrepareStep } from "@/core/agents/tools/steer-task.ts";
import { TaskSteering } from "@/core/runtime/steering.ts";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function scriptedModel(prompts: unknown[]) {
  return {
    specificationVersion: "v2" as const,
    provider: "test",
    modelId: "scripted",
    supportedUrls: {},
    async doGenerate(opts: { prompt: unknown }) {
      prompts.push(opts.prompt);
      const first = prompts.length === 1;
      return {
        content: first
          ? [{ type: "tool-call", toolCallId: "c1", toolName: "work", input: "{}" }]
          : [{ type: "text", text: "done" }],
        finishReason: first ? "tool-calls" : "stop",
        usage,
        warnings: [],
      };
    },
    async doStream(): Promise<never> {
      throw new Error("generate only");
    },
  };
}

test("a steerTask note sent mid-task reaches the worker's next model call", async () => {
  const steering = new TaskSteering();
  const prompts: unknown[] = [];
  const agent = new Agent({
    id: "worker",
    name: "worker",
    instructions: "You are a worker.",
    model: scriptedModel(prompts) as never,
    tools: {
      work: createTool({
        id: "work",
        description: "do work",
        inputSchema: z.object({}),
        execute: async () => {
          steering.push("task-1", "Use supply chain data, not airlines.");
          return { ok: true };
        },
      }),
    },
  });

  await agent.generate("Build the demo.", { maxSteps: 3, prepareStep: steeringPrepareStep(steering, "task-1") });

  expect(prompts).toHaveLength(2);
  expect(JSON.stringify(prompts[0])).not.toContain("supply chain");
  const second = JSON.stringify(prompts[1]);
  expect(second).toContain(STEER_PREFIX);
  expect(second).toContain("Use supply chain data, not airlines.");
  expect(steering.drain("task-1")).toEqual([]);
});
