import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SANDBOX_DOMAINS, type ThinkingLevel } from "../server/core/config.ts";
import { currentModelId, type ProviderId } from "../server/core/models.ts";

export type { ProviderId };

export interface Settings {
  apiKeys: Record<ProviderId, string>;
  exaApiKey: string;
  workspaceDir: string;
  sandbox: {
    networkEnabled: boolean;
    allowedDomains: string[];
    timeoutMs: number;
  };
  chromeMcp: boolean;
  verifier: {
    model: string;
    effort: Exclude<ThinkingLevel, "off">;
    prompt: string;
  };
  setupDone: boolean;
}

export function defaultSettings(): Settings {
  return {
    apiKeys: { fireworks: "", openai: "", anthropic: "" },
    exaApiKey: "",
    workspaceDir: path.join(os.homedir(), "Documents", "Ultrawork"),
    sandbox: { networkEnabled: true, allowedDomains: [...DEFAULT_SANDBOX_DOMAINS], timeoutMs: 120_000 },
    chromeMcp: true,
    verifier: { model: "", effort: "high", prompt: "" },
    setupDone: false,
  };
}

export class SettingsStore {
  readonly file: string;

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, "settings.json");
  }

  load(): Settings {
    const base = defaultSettings();
    if (!fs.existsSync(this.file)) return base;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Settings> & { anthropicApiKey?: string };
      if (saved.anthropicApiKey && !saved.apiKeys?.anthropic) {
        saved.apiKeys = { ...base.apiKeys, ...saved.apiKeys, anthropic: saved.anthropicApiKey };
      }
      const apiKeys = { ...base.apiKeys, ...saved.apiKeys };
      return {
        ...base,
        ...saved,
        apiKeys,
        setupDone: saved.setupDone ?? Object.values(apiKeys).some(Boolean),
        sandbox: { ...base.sandbox, ...saved.sandbox },
        verifier: {
          model: currentModelId(saved.verifier?.model ?? base.verifier.model),
          effort: saved.verifier?.effort ?? base.verifier.effort,
          prompt: saved.verifier?.prompt ?? base.verifier.prompt,
        },
      };
    } catch {
      return base;
    }
  }

  save(settings: Settings): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(settings, null, 2)}\n`);
  }
}

export function settingsToEnv(s: Settings): Record<string, string> {
  fs.mkdirSync(s.workspaceDir, { recursive: true });
  const domains = s.sandbox.networkEnabled ? s.sandbox.allowedDomains.join(",") : "";
  return {
    FIREWORKS_API_KEY: s.apiKeys.fireworks,
    OPENAI_API_KEY: s.apiKeys.openai,
    ANTHROPIC_API_KEY: s.apiKeys.anthropic,
    EXA_API_KEY: s.exaApiKey,
    WORKSPACE_DIR: s.workspaceDir,
    SANDBOX_ALLOWED_DOMAINS: domains || "none",
    SANDBOX_TIMEOUT_MS: String(s.sandbox.timeoutMs),
    CHROME_MCP: s.chromeMcp ? "on" : "off",
    VERIFIER_MODEL: s.verifier.model,
    VERIFIER_THINKING_LEVEL: s.verifier.effort,
    VERIFIER_PROMPT: s.verifier.prompt,
  };
}
