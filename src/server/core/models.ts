import type { ThinkingLevel } from "./config.ts";

export type ProviderId = "fireworks" | "openai" | "anthropic";

export interface Provider {
  id: ProviderId;
  name: string;
  envVar: string;
  mastraPrefix: string;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  fireworks: { id: "fireworks", name: "Fireworks", envVar: "FIREWORKS_API_KEY", mastraPrefix: "fireworks-ai" },
  openai: { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", mastraPrefix: "openai" },
  anthropic: { id: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY", mastraPrefix: "anthropic" },
};

export type Effort = Exclude<ThinkingLevel, "off">;
export const EFFORT_ORDER: readonly Effort[] = ["none", "low", "medium", "high", "xhigh", "max"];

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  path: string;
  efforts: Effort[];
  defaultEffort?: Effort;
}

const CLASSIC: Effort[] = ["low", "medium", "high", "max"];
const GPT6: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const CLAUDE5: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const GLM5: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export const MODELS: ModelInfo[] = [
  {
    id: "kimi-k3",
    name: "Kimi K3",
    provider: "fireworks",
    path: "accounts/fireworks/models/kimi-k3",
    efforts: CLASSIC,
  },
  {
    id: "glm-5.3",
    name: "GLM-5.3",
    provider: "fireworks",
    path: "accounts/fireworks/models/glm-5p3",
    efforts: GLM5,
  },
  {
    id: "glm-5.3-flash",
    name: "GLM-5.3 Flash",
    provider: "fireworks",
    path: "accounts/fireworks/models/glm-5p3-flash",
    efforts: GLM5,
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    provider: "fireworks",
    path: "accounts/fireworks/models/deepseek-v4p1-flash",
    efforts: CLASSIC,
  },
  { id: "gpt-6-astra", name: "GPT-6 Astra", provider: "openai", path: "gpt-6-astra", efforts: GPT6 },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "openai", path: "gpt-6.1-sol", efforts: GPT6 },
  { id: "gpt-6-luna", name: "GPT-6 Luna", provider: "openai", path: "gpt-6-luna", efforts: ["none", ...GPT6] },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai", path: "gpt-5.6-sol", efforts: CLASSIC },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    path: "claude-fable-5-1",
    efforts: CLAUDE5,
    defaultEffort: "high",
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    path: "claude-opus-5-5",
    efforts: CLAUDE5,
    defaultEffort: "medium",
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    provider: "anthropic",
    path: "claude-sonnet-5-5",
    efforts: CLAUDE5,
    defaultEffort: "high",
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    provider: "anthropic",
    path: "claude-haiku-5-5",
    efforts: CLAUDE5,
    defaultEffort: "medium",
  },
];

export const DEFAULT_MODELS = {
  planner: "kimi-k3",
  worker: "kimi-k3",
  verifier: "deepseek-v4.1-flash",
} as const;

const LEGACY_IDS: Record<string, string> = {
  "deepseek-v4-flash": "deepseek-v4.1-flash",
  "fireworks-ai/accounts/fireworks/models/deepseek-v4-flash-0731": "deepseek-v4.1-flash",
};

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === currentModelId(id));
}

export function currentModelId(id: string): string {
  return LEGACY_IDS[id] ?? id;
}

export function toMastraModel(id: string): string {
  const m = findModel(id);
  return m ? `${PROVIDERS[m.provider].mastraPrefix}/${m.path}` : id;
}

export function toCatalogId(model: string): string {
  return MODELS.find((m) => toMastraModel(m.id) === model)?.id ?? model;
}

export function effectiveEffort(model: string, level: ThinkingLevel): ThinkingLevel {
  const m = findModel(toCatalogId(model));
  if (!m || level === "off" || m.efforts.includes(level)) return level;
  const rank = EFFORT_ORDER.indexOf(level);
  const below = m.efforts.filter((e) => EFFORT_ORDER.indexOf(e) <= rank);
  return below.at(-1) ?? m.efforts[0] ?? level;
}

export function providerConfigured(provider: ProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[PROVIDERS[provider].envVar]);
}

export function listModels(env: NodeJS.ProcessEnv = process.env) {
  return MODELS.map((m) => ({ ...m, available: providerConfigured(m.provider, env) }));
}

export function resolveVerifierModel(preferred: string, workerModel: string, env: NodeJS.ProcessEnv = process.env) {
  const pref = findModel(toCatalogId(preferred));
  if (!pref) return preferred;
  const worker = findModel(toCatalogId(workerModel));
  if (providerConfigured(pref.provider, env) && pref.id !== worker?.id) return pref.id;
  const usable = MODELS.filter((m) => m.id !== worker?.id && providerConfigured(m.provider, env));
  return usable.find((m) => m.provider !== worker?.provider)?.id ?? usable[0]?.id ?? workerModel;
}
