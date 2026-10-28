import { spawn } from "node:child_process";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";

export interface SandboxOptions {
  workspaceRoot: string;
  allowedDomains: string[];
  command: string;
  timeoutMs: number;
  commandId: string;
  signal?: AbortSignal;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DENY_READ = ["~/.ssh", "~/.aws", "~/.gnupg", "~/.kube"];

let init: Promise<void> | undefined;

function ensureInitialized(allowedDomains: string[]): Promise<void> {
  init ??= (async () => {
    const deps = await SandboxManager.checkDependenciesAsync();
    if (deps.errors.length > 0) {
      const hint =
        process.platform === "linux"
          ? "Install bubblewrap and socat (apt install bubblewrap socat)."
          : "Install ripgrep (brew install ripgrep).";
      throw new Error(`sandbox-runtime unavailable: ${deps.errors.join("; ")}. ${hint}`);
    }
    for (const w of deps.warnings) console.warn(`[sandbox] ${w}`);
    await SandboxManager.initialize({
      network: {
        allowedDomains,
        deniedDomains: [],
        allowMachLookup: ["com.apple.trustd.agent"],
      },
      filesystem: { denyRead: DENY_READ, allowWrite: [], denyWrite: [] },
    });
  })();
  return init.catch((err) => {
    init = undefined;
    throw err;
  });
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const PIN_PROXY_TO_IPV4 =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash parameter expansion, not a JS template
  'for v in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do [ -n "${!v}" ] && export "$v=${!v//localhost/127.0.0.1}"; done;';

const EXTRA_WRITE = ["/tmp", "~/.cache", "~/.npm", "~/Library/Caches"];

export async function runInSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  await ensureInitialized(opts.allowedDomains);

  const { argv, env } = await SandboxManager.wrapWithSandboxArgv(
    `${PIN_PROXY_TO_IPV4} cd ${quote(opts.workspaceRoot)} && ${opts.command}`,
    undefined,
    {
      filesystem: {
        denyRead: DENY_READ,
        allowWrite: [opts.workspaceRoot, ...EXTRA_WRITE],
        denyWrite: [],
      },
    },
    undefined,
    opts.workspaceRoot,
    { commandId: opts.commandId, commandText: opts.command },
  );

  const [command, ...args] = argv;
  if (!command) throw new Error("Sandbox returned an empty command");
  const child = spawn(command, args, {
    cwd: opts.workspaceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));

  const killTree = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {}
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree();
  }, opts.timeoutMs);
  if (opts.signal?.aborted) killTree();
  opts.signal?.addEventListener("abort", killTree, { once: true });

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    });
    return {
      exitCode,
      stdout,
      stderr: SandboxManager.annotateStderrWithSandboxFailures(opts.commandId, stderr),
      timedOut,
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", killTree);
    SandboxManager.cleanupAfterCommand();
  }
}

export async function checkSandbox(allowedDomains: string[]): Promise<{ ok: boolean; message: string }> {
  try {
    await ensureInitialized(allowedDomains);
    const net = allowedDomains.length ? `network: ${allowedDomains.join(", ")}` : "network: off";
    return { ok: true, message: `sandbox-runtime ready (${net})` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function shutdownSandbox(): Promise<void> {
  if (!init) return;
  await init.catch(() => {});
  init = undefined;
  await SandboxManager.reset().catch(() => {});
}
