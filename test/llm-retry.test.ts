import { describe, expect, test } from "bun:test";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { llmRetryProcessor } from "@/core/agents/llm-retry.ts";
import { loadConfig } from "@/core/config.ts";
import { isTransientLlmError } from "@/core/errors.ts";

function apiError(message: string, statusCode?: number): Error {
  const e = new Error(message);
  e.name = "AI_APICallError";
  if (statusCode !== undefined) Object.assign(e, { statusCode });
  return e;
}

function bunTimeout(): Error {
  const e = new Error("The operation timed out.");
  e.name = "TimeoutError";
  e.stack = "";
  return e;
}

describe("isTransientLlmError", () => {
  test("retries timeouts, overload, and 5xx/429, including wrapped causes", () => {
    expect(isTransientLlmError(bunTimeout())).toBe(true);
    expect(isTransientLlmError(apiError("Overloaded", 529))).toBe(true);
    expect(isTransientLlmError(apiError("Rate limited", 429))).toBe(true);
    expect(isTransientLlmError(apiError("<none>"))).toBe(true);
    expect(isTransientLlmError(new Error("agent failed", { cause: bunTimeout() }))).toBe(true);
  });

  test("does not retry failures a re-run would repeat", () => {
    expect(isTransientLlmError(apiError("prompt is too long: 213000 tokens > 200000 maximum", 400))).toBe(false);
    expect(isTransientLlmError(apiError("API key is invalid.", 401))).toBe(false);
    expect(isTransientLlmError(apiError("invalid_request: bad tool schema", 400))).toBe(false);
  });
});

const AGENT_TEST_TIMEOUT_MS = 30_000;

const FAST = loadConfig({ llmMaxAttempts: 3, llmRetryBaseDelayMs: 1, llmRetryMaxDelayMs: 2 });

const TOOL_CALL = {
  content: [{ type: "tool-call", toolCallId: "t1", toolName: "expensive", input: JSON.stringify({ q: "x" }) }],
  finishReason: "tool-calls",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
};

const ANSWER = {
  content: [{ type: "text", text: "done" }],
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
};

function scriptedAgent(script: Array<Error | object>, onRetry: () => void = () => {}) {
  const state = { modelCalls: 0, toolRuns: 0 };

  const respond = async () => {
    const next = script[state.modelCalls];
    state.modelCalls++;
    if (next instanceof Error) throw next;
    return next;
  };

  const agent = new Agent({
    id: "retry-test",
    name: "retry-test",
    instructions: "use the tool",
    model: {
      specificationVersion: "v2",
      provider: "fake",
      modelId: "fake",
      supportedUrls: {},
      doGenerate: respond,
      doStream: respond,
    } as never,
    tools: {
      expensive: createTool({
        id: "expensive",
        description: "stands in for a long sandbox command",
        inputSchema: z.object({ q: z.string() }),
        execute: async () => {
          state.toolRuns++;
          return { ok: true };
        },
      }),
    },
    errorProcessors: [llmRetryProcessor(FAST, onRetry)],
  });

  return { agent, state };
}

describe("llmRetryProcessor", () => {
  test(
    "re-sends the failed request without replaying completed tool calls",
    async () => {
      let retries = 0;
      const { agent, state } = scriptedAgent([TOOL_CALL, bunTimeout(), ANSWER], () => retries++);

      const result = await agent.generate("go", { maxSteps: 10 });

      expect(result.text).toBe("done");
      expect(state.modelCalls).toBe(3);
      expect(state.toolRuns).toBe(1);
      expect(retries).toBe(1);
    },
    AGENT_TEST_TIMEOUT_MS,
  );

  test(
    "gives up after llmMaxAttempts and surfaces the original error",
    async () => {
      const { agent, state } = scriptedAgent([bunTimeout(), bunTimeout(), bunTimeout(), ANSWER]);

      await expect(agent.generate("go", { maxSteps: 10 })).rejects.toThrow("The operation timed out.");
      expect(state.modelCalls).toBe(3);
    },
    AGENT_TEST_TIMEOUT_MS,
  );
});
