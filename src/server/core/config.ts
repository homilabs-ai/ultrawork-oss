import { DEFAULT_MODELS } from "./models.ts";

export interface HarnessConfig {
  plannerModel: string;
  workerModel: string;
  verifierModel: string;
  plannerThinkingLevel: ThinkingLevel;
  workerThinkingLevel: ThinkingLevel;
  verifierThinkingLevel: ThinkingLevel;
  maxWorkers: number;
  maxPlanners: number;
  maxDepth: number;
  plannerMaxSteps: number;
  workerMaxSteps: number;
  llmMaxAttempts: number;
  llmRetryBaseDelayMs: number;
  llmRetryMaxDelayMs: number;
  budget: {
    maxTurns: number;
    maxWallclockMs: number;
    maxLlmCalls: number;
  };
  dbPath: string;

  sessionDbPath: string;
  plannerSessionLastMessages: number;
  workspaceDir: string;
  serverPort: number;
  webDist: string;

  sandboxTimeoutMs: number;
  sandboxAllowedDomains: string[];
  chromeMcp: boolean;
  chromeProfileDir: string;
  verifierPlugin: boolean;
  verifierPrompt: string;
}

export const THINKING_LEVELS = ["off", "none", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (raw === "none") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const DEFAULT_SANDBOX_DOMAINS = [
  "pypi.org",
  "files.pythonhosted.org",
  "registry.npmjs.org",
  "github.com",
  "*.githubusercontent.com",
  "crates.io",
  "static.crates.io",
];

export function loadConfig(overrides: Partial<HarnessConfig> = {}): HarnessConfig {
  const base: HarnessConfig = {
    plannerModel: str("PLANNER_MODEL", DEFAULT_MODELS.planner),
    workerModel: str("WORKER_MODEL", DEFAULT_MODELS.worker),
    verifierModel: str("VERIFIER_MODEL", DEFAULT_MODELS.verifier),
    plannerThinkingLevel: str("PLANNER_THINKING_LEVEL", "high") as ThinkingLevel,
    workerThinkingLevel: str("WORKER_THINKING_LEVEL", "medium") as ThinkingLevel,
    verifierThinkingLevel: str("VERIFIER_THINKING_LEVEL", "high") as ThinkingLevel,
    maxWorkers: num("MAX_WORKERS", 20),
    maxPlanners: num("MAX_PLANNERS", 3),
    maxDepth: num("MAX_DEPTH", 3),
    plannerMaxSteps: num("PLANNER_MAX_STEPS", 100),
    workerMaxSteps: num("WORKER_MAX_STEPS", 100),
    llmMaxAttempts: num("LLM_MAX_ATTEMPTS", 3),
    llmRetryBaseDelayMs: num("LLM_RETRY_BASE_DELAY_MS", 2_000),
    llmRetryMaxDelayMs: num("LLM_RETRY_MAX_DELAY_MS", 60_000),
    budget: {
      maxTurns: num("MAX_TURNS", 500),
      maxWallclockMs: num("MAX_WALLCLOCK_MS", 6 * 60 * 60 * 1000),
      maxLlmCalls: num("MAX_LLM_CALLS", 2000),
    },
    dbPath: str("DB_PATH", "data/harness.db"),
    sessionDbPath: str("SESSION_DB_PATH", ""),
    plannerSessionLastMessages: num("PLANNER_SESSION_LAST_MESSAGES", 200),
    workspaceDir: str("WORKSPACE_DIR", "workspace"),
    serverPort: num("PORT", 4317),
    webDist: str("WEB_DIST", ""),
    sandboxTimeoutMs: num("SANDBOX_TIMEOUT_MS", 120_000),
    sandboxAllowedDomains: list("SANDBOX_ALLOWED_DOMAINS", DEFAULT_SANDBOX_DOMAINS),
    chromeMcp: str("CHROME_MCP", "on") !== "off",
    chromeProfileDir: str("CHROME_PROFILE_DIR", ""),
    verifierPlugin: str("PLUGIN_VERIFIER_DEFAULT", "off") === "on",
    verifierPrompt: str("VERIFIER_PROMPT", ""),
  };
  const merged = {
    ...base,
    ...overrides,
    budget: { ...base.budget, ...overrides.budget },
  };
  if (!merged.sessionDbPath) {
    merged.sessionDbPath = `${merged.dbPath.replace(/\.db$/, "")}-session.db`;
  }
  if (!merged.chromeProfileDir) {
    merged.chromeProfileDir = `${merged.workspaceDir}-chrome-profiles`;
  }
  return merged;
}
