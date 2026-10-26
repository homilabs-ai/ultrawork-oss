import { expect, test } from "bun:test";
import { thinkingProviderOptions } from "@/core/agents/thinking-options.ts";
import {
  currentModelId,
  EFFORT_ORDER,
  effectiveEffort,
  MODELS,
  resolveVerifierModel,
  toMastraModel,
} from "@/core/models.ts";

const keys = (...vars: string[]) => Object.fromEntries(vars.map((v) => [v, "k"])) as NodeJS.ProcessEnv;

test("resolveVerifierModel prefers the configured model, then a keyed model from another provider", () => {
  expect(resolveVerifierModel("deepseek-v4.1-flash", "kimi-k3", keys("FIREWORKS_API_KEY"))).toBe("deepseek-v4.1-flash");
  expect(resolveVerifierModel("deepseek-v4.1-flash", "gpt-5.6-sol", keys("OPENAI_API_KEY"))).toBe("gpt-6-astra");
  expect(
    resolveVerifierModel("deepseek-v4.1-flash", "deepseek-v4.1-flash", keys("FIREWORKS_API_KEY", "OPENAI_API_KEY")),
  ).toBe("gpt-6-astra");
  expect(resolveVerifierModel("deepseek-v4.1-flash", "gpt-6.1-sol", keys("OPENAI_API_KEY", "ANTHROPIC_API_KEY"))).toBe(
    "claude-fable-5-1",
  );
  expect(resolveVerifierModel("gpt-6-astra", "kimi-k3", keys())).toBe("kimi-k3");
});

test("retired DeepSeek V4 Flash ids resolve to V4.1 Flash", () => {
  const v41 = "fireworks-ai/accounts/fireworks/models/deepseek-v4p1-flash";
  expect(toMastraModel("deepseek-v4-flash")).toBe(v41);
  expect(toMastraModel("fireworks-ai/accounts/fireworks/models/deepseek-v4-flash-0731")).toBe(v41);
  expect(currentModelId("deepseek-v4-flash")).toBe("deepseek-v4.1-flash");
  expect(resolveVerifierModel("deepseek-v4-flash", "kimi-k3", keys("FIREWORKS_API_KEY"))).toBe("deepseek-v4.1-flash");
});

test("catalog ids are unique and effort lists are ordered and include any default", () => {
  expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  for (const m of MODELS) {
    const ranks = m.efforts.map((e) => EFFORT_ORDER.indexOf(e));
    expect(ranks.every((r, i) => r >= 0 && (i === 0 || r > (ranks[i - 1] ?? -1)))).toBe(true);
    if (m.defaultEffort) expect(m.efforts).toContain(m.defaultEffort);
  }
});

test("effectiveEffort lowers unsupported levels and passes through unknown models", () => {
  expect(effectiveEffort("kimi-k3", "xhigh")).toBe("high");
  expect(effectiveEffort("gpt-6-astra", "none")).toBe("low");
  expect(effectiveEffort("gpt-6-luna", "none")).toBe("none");
  expect(effectiveEffort("gpt-6-astra", "off")).toBe("off");
  expect(effectiveEffort("openrouter/some-model", "xhigh")).toBe("xhigh");
});

test("thinkingProviderOptions maps effort to each provider's option shape", () => {
  expect(thinkingProviderOptions("anthropic/claude-opus-5-5", "max")).toEqual({
    anthropic: { sendReasoning: true, thinking: { type: "adaptive" }, effort: "max" },
  });
  expect(thinkingProviderOptions("openai/gpt-6-luna", "none")).toEqual({ openai: { reasoningEffort: "none" } });
  expect(thinkingProviderOptions("openai/gpt-6-astra", "off")).toBeUndefined();
});
