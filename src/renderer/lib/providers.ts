import type { ProviderId } from "@/api/runs";

export const PROVIDERS: { id: ProviderId; name: string; keyUrl: string; placeholder: string }[] = [
  { id: "fireworks", name: "Fireworks", keyUrl: "fireworks.ai", placeholder: "fw_…" },
  { id: "openai", name: "OpenAI", keyUrl: "platform.openai.com", placeholder: "sk-…" },
  { id: "anthropic", name: "Anthropic", keyUrl: "console.anthropic.com", placeholder: "sk-ant-…" },
];

export const providerName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)?.name ?? id;
