import type { ThinkingLevel } from "@/core/config.ts";

const REASONING_EFFORT_PROVIDERS = new Set(["fireworks-ai", "openai", "openrouter", "groq", "together-ai", "deepseek"]);

function providerOf(model: string): string {
  const separator = model.indexOf("/");
  return separator === -1 ? model : model.slice(0, separator);
}

export function thinkingProviderOptions(model: string, level: ThinkingLevel) {
  if (level === "off") return undefined;

  const provider = providerOf(model);

  if (provider === "anthropic") {
    if (level === "none") return undefined;
    return {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "adaptive" as const },
        effort: level,
      },
    };
  }

  if (REASONING_EFFORT_PROVIDERS.has(provider)) {
    return { [provider]: { reasoningEffort: level } };
  }

  return undefined;
}
