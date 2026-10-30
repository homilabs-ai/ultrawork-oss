import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Settings } from "./settings.ts";

export interface ToolStatus {
  found: boolean;
  path?: string;
}

export interface SetupStatus {
  tools: {
    commandLineTools: ToolStatus;
    homebrew: ToolStatus;
    python3: ToolStatus;
    node: ToolStatus;
    ripgrep: ToolStatus;
  };
  chrome: ToolStatus & { enabled: boolean };
  exa: { configured: boolean };
}

const FALLBACK_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  path.join(os.homedir(), ".local", "bin"),
];

const MARK = "__ULTRAWORK_PATH__";

function run(cmd: string, args: string[], timeout: number): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, encoding: "utf8" }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? "" }));
  });
}

async function loginShellPath(): Promise<string | null> {
  if (process.platform === "win32") return null;
  const shell = process.env.SHELL || "/bin/zsh";
  const { stdout } = await run(shell, ["-ilc", `printf '${MARK}%s${MARK}' "$PATH"`], 4000);
  const match = stdout.match(new RegExp(`${MARK}(.*)${MARK}`));
  return match?.[1] || null;
}

export async function refreshPath(): Promise<string> {
  const shellPath = await loginShellPath();
  const dirs = [
    ...(shellPath?.split(path.delimiter) ?? []),
    ...(process.env.PATH?.split(path.delimiter) ?? []),
    ...FALLBACK_PATH_DIRS,
  ].filter(Boolean);
  process.env.PATH = [...new Set(dirs)].join(path.delimiter);
  return process.env.PATH;
}

function which(bin: string): string | undefined {
  for (const dir of process.env.PATH?.split(path.delimiter) ?? []) {
    const candidate = path.join(dir, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return undefined;
}

function tool(bin: string): ToolStatus {
  const p = which(bin);
  return { found: Boolean(p), path: p };
}

function findChrome(): string | undefined {
  const app = "Google Chrome.app";
  return [path.join("/Applications", app), path.join(os.homedir(), "Applications", app)].find((p) => fs.existsSync(p));
}

export async function checkSetup(settings: Settings): Promise<SetupStatus> {
  await refreshPath();
  const isMac = process.platform === "darwin";

  const clt = isMac ? await run("xcode-select", ["-p"], 3000) : { ok: true, stdout: "" };
  const commandLineTools: ToolStatus = { found: clt.ok, path: clt.stdout.trim() || undefined };

  const python3 = tool("python3");
  if (isMac && python3.path === "/usr/bin/python3" && !commandLineTools.found) python3.found = false;

  const chromePath = isMac ? findChrome() : (which("google-chrome") ?? which("google-chrome-stable"));

  return {
    tools: {
      commandLineTools,
      homebrew: tool("brew"),
      python3,
      node: tool("npm"),
      ripgrep: tool("rg"),
    },
    chrome: { found: Boolean(chromePath), path: chromePath, enabled: settings.chromeMcp },
    exa: { configured: Boolean(settings.exaApiKey.trim()) },
  };
}
