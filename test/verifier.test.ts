import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declareScopeCompleteTool } from "@/core/agents/tools/declare-scope-complete.ts";
import { EventBus, loadConfig, openDb, Repo, SqliteTransport } from "@/core/index.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "verifier-"));
  const config = loadConfig({
    dbPath: join(dir, "h.db"),
    workspaceDir: join(dir, "workspace"),
  });
  const { db, sqlite } = openDb(config.dbPath);
  const repo = new Repo(db);
  const run = repo.createRun("mission");
  const root = repo.createAgent({
    runId: run.id,
    role: "root",
    parentAgentId: null,
    scopeMd: "mission",
    depth: 0,
  });
  return { config, repo, root, run, close: () => sqlite.close() };
}

describe("verifier tasks", () => {
  test("subplanner cannot complete while delegated work is unfinished", async () => {
    const { config, repo, root, run, close } = setup();
    const bus = new EventBus();
    const transport = new SqliteTransport(repo, bus);
    const subplanner = repo.createAgent({
      runId: run.id,
      role: "planner",
      parentAgentId: root.id,
      scopeMd: "research",
      depth: 1,
    });
    const task = repo.enqueueTask({
      runId: run.id,
      requesterAgentId: subplanner.id,
      title: "unfinished research",
      scopeMd: "research",
      depth: 2,
    });
    const tool = declareScopeCompleteTool({
      repo,
      transport,
      config,
      agent: subplanner,
      workspaceRoot: config.workspaceDir,
    });

    expect(await tool.execute!({ summary: "complete" }, {} as never)).toMatchObject({
      ok: false,
      error: expect.stringContaining("unfinished"),
    });

    repo.setTaskStatus(task.id, "done");
    expect(await tool.execute!({ summary: "complete" }, {} as never)).toEqual({
      ok: true,
    });
    expect(repo.getAgent(subplanner.id)?.status).toBe("done");
    expect(repo.countUnread(root.id)).toBe(1);
    bus.close();
    close();
  });

  test("with the plugin on for the run, a subplanner must get a verifier report before completing", async () => {
    const { config, repo, root, run, close } = setup();
    const bus = new EventBus();
    const transport = new SqliteTransport(repo, bus);
    const subplanner = repo.createAgent({
      runId: run.id,
      role: "planner",
      parentAgentId: root.id,
      scopeMd: "research",
      depth: 1,
    });
    const tool = declareScopeCompleteTool({
      repo,
      transport,
      config: { ...config, verifierPlugin: false },
      agent: subplanner,
      workspaceRoot: config.workspaceDir,
      verifierPlugin: true,
    });

    expect(await tool.execute!({ summary: "complete" }, {} as never)).toMatchObject({
      ok: false,
      error: expect.stringContaining("verifier"),
    });

    const audit = repo.enqueueTask({
      runId: run.id,
      requesterAgentId: subplanner.id,
      title: "Audit",
      scopeMd: "",
      depth: 2,
      type: "verifier",
    });
    repo.setTaskStatus(audit.id, "done");
    repo.setTaskVerdict(audit.id, "NEEDS_WORK");

    expect(await tool.execute!({ summary: "complete" }, {} as never)).toEqual({ ok: true });
    bus.close();
    close();
  });

  test("root planner cannot call the subplanner completion tool", async () => {
    const { config, repo, root, close } = setup();
    const tool = declareScopeCompleteTool({
      repo,
      transport: null as never,
      config,
      agent: root,
      workspaceRoot: config.workspaceDir,
    });

    expect(await tool.execute!({ summary: "complete" }, {} as never)).toEqual({
      ok: false,
      error: "Root planners cannot use declareScopeComplete.",
    });
    expect(repo.getAgent(root.id)?.status).toBe("idle");
    close();
  });
});
