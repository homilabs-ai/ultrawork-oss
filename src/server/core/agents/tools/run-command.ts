import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runInSandbox } from "@/core/runtime/sandbox.ts";
import type { WorkerToolContext } from "./context.ts";

const OUTPUT_CAP = 20_000;
const cap = (s: string) => (s.length > OUTPUT_CAP ? `${s.slice(0, OUTPUT_CAP)}\n…[truncated]` : s);

export function runCommandTool({ repo, workspaceRoot, config, task }: WorkerToolContext) {
  return createTool({
    id: "runCommand",
    description:
      "Run a shell command in an OS-level sandbox with the shared workspace as the working directory. " +
      "Files written to the workspace persist and are visible to your other tools. Each call starts a new shell, " +
      "so `cd`, variables, and background jobs do not carry over. Writes outside the workspace " +
      "and /tmp are denied. Network is limited to package registries (PyPI, npm, GitHub), so you can install what you need " +
      "into the workspace (e.g. `python3 -m venv .venv && .venv/bin/pip install ...`, or `npm install`). " +
      "Uses the tools installed on this machine (python3 and the standard Unix toolchain). " +
      "Prefer scripts that print summaries over dumping whole files.",
    inputSchema: z.object({
      command: z.string().describe("Shell command, e.g. `python make_report.py` or `python -c '...'`."),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Override the default command timeout in milliseconds."),
    }),
    execute: async (input: { command: string; timeoutMs?: number }, context) => {
      try {
        const res = await runInSandbox({
          workspaceRoot,
          allowedDomains: config.sandboxAllowedDomains,
          command: input.command,
          timeoutMs: input.timeoutMs ?? config.sandboxTimeoutMs,
          commandId: `${task.id}:${crypto.randomUUID()}`,
          signal: context?.abortSignal,
        });
        repo.logEvent({
          runId: task.run_id,
          taskId: task.id,
          type: "workspace.exec",
          payload: {
            command: input.command.slice(0, 500),
            exitCode: res.exitCode,
            timedOut: res.timedOut,
          },
        });
        return {
          ok: res.exitCode === 0 && !res.timedOut,
          exitCode: res.exitCode,
          timedOut: res.timedOut,
          stdout: cap(res.stdout),
          stderr: cap(res.stderr),
        };
      } catch (e) {
        return { error: String(e) };
      }
    },
  });
}
