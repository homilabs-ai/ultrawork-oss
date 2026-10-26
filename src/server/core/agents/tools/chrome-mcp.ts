import { resolve } from "node:path";
import { MCPClient } from "@mastra/mcp";
import type { HarnessConfig } from "@/core/config.ts";
import type { Repo } from "@/core/db/repo.ts";

export interface ChromeBrowserSession {
  toolsets: Awaited<ReturnType<MCPClient["listToolsets"]>>;
  close: () => Promise<void>;
}

export async function openChromeSession(opts: {
  config: HarnessConfig;
  repo: Repo;
  runId: string;
  taskId: string;
}): Promise<ChromeBrowserSession | null> {
  const { config, repo, runId, taskId } = opts;
  if (!config.chromeMcp) return null;

  const entry = process.env.CHROME_MCP_ENTRY;
  const launch = entry
    ? { args: [entry], env: { BUN_BE_BUN: "1" } }
    : { args: ["x", "chrome-devtools-mcp"], env: undefined };

  const client = new MCPClient({
    id: `chrome-${taskId}`,
    timeout: 120_000,
    servers: {
      chrome: {
        command: process.execPath,
        ...(launch.env && { env: launch.env }),
        args: [
          ...launch.args,
          "--headless",
          "--viewport",
          "1280x720",
          "--screenshotFormat",
          "jpeg",
          "--allow-unrestricted-paths",
          "--no-usage-statistics",
          "--no-performance-crux",
          "--userDataDir",
          resolve(config.chromeProfileDir, taskId),
        ],
      },
    },
  });

  try {
    const toolsets = await client.listToolsets();
    repo.logEvent({ runId, taskId, type: "browser.mcp.started", payload: {} });
    return { toolsets, close: () => client.disconnect() };
  } catch (error) {
    repo.logEvent({
      runId,
      taskId,
      type: "browser.mcp.unavailable",
      payload: { error: String(error) },
    });
    await client.disconnect().catch(() => {});
    return null;
  }
}
