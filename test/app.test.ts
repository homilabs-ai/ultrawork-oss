import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness } from "@/core/index.ts";
import { createApp } from "@/api/app.ts";
import { listWorkspaceArtifacts } from "@/api/artifacts.ts";

function createFakeHarness(workspaceRoot: string) {
  const calls = {
    instructions: [] as string[],
    starts: [] as string[],
    steers: [] as string[],
    stops: [] as string[],
    models: [] as unknown[],
  };
  const harness = {
    workspaceRoot,
    repo: {
      getRun: (runId: string) => (runId === "run-1" ? { id: runId } : null),
      listEvents: () => [],
    },
    createRun: (instruction: string, models: unknown) => {
      calls.instructions.push(instruction);
      calls.models.push(models);
      return "run-1";
    },
    start: async (runId: string) => {
      calls.starts.push(runId);
      return "idle" as const;
    },
    steerRoot: (_runId: string, message: string) => {
      calls.steers.push(message);
      return { ok: true as const, agentId: "root-1" };
    },
    stopRun: (runId: string) => {
      const alreadyStopped = calls.stops.includes(runId);
      calls.stops.push(runId);
      return {
        ok: true as const,
        alreadyStopped,
        cancelledAgents: alreadyStopped ? 0 : 1,
        cancelledTasks: alreadyStopped ? 0 : 2,
      };
    },
    config: { webDist: "" },
  } as unknown as Harness;
  return { harness, calls };
}

test("attached files are passed to the planner by absolute path", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "app-attach-"));
  const attached = join(workspaceRoot, "input.txt");
  writeFileSync(attached, "goal data");
  const { harness, calls } = createFakeHarness(workspaceRoot);
  const app = createApp(harness);

  const response = await app.request("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [attached] }),
  });

  expect(response.status).toBe(200);
  expect(((await response.json()) as { runId: string }).runId).toBe("run-1");
  expect(calls.instructions[0]).toContain(attached);
  expect(calls.starts).toEqual(["run-1"]);
});

test("missing attachments are rejected before a run is created", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "app-attach-missing-"));
  const { harness, calls } = createFakeHarness(workspaceRoot);
  const app = createApp(harness);

  const response = await app.request("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instructions: "x", files: [join(workspaceRoot, "nope.pdf")] }),
  });

  expect(response.status).toBe(400);
  expect(calls.starts).toEqual([]);
});

test("run effort is validated and passed to the run", async () => {
  const { harness, calls } = createFakeHarness(mkdtempSync(join(tmpdir(), "app-effort-")));
  const app = createApp(harness);
  const post = (effort: string) =>
    app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instructions: "x", effort }),
    });

  expect((await post("extreme")).status).toBe(400);
  expect(calls.starts).toEqual([]);

  expect((await post("low")).status).toBe(200);
  expect(calls.models).toEqual([{ plannerEffort: "low", workerEffort: "low" }]);
});

test("planner and worker can use different models and efforts", async () => {
  const prev = { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };
  process.env.OPENAI_API_KEY = "k";
  process.env.ANTHROPIC_API_KEY = "k";
  try {
    const { harness, calls } = createFakeHarness(mkdtempSync(join(tmpdir(), "app-roles-")));
    const app = createApp(harness);
    const post = (body: Record<string, string>) =>
      app.request("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instructions: "x", ...body }),
      });

    const ok = await post({
      plannerModel: "claude-opus-5-5",
      workerModel: "gpt-6-luna",
      plannerEffort: "xhigh",
      workerEffort: "none",
    });
    expect(ok.status).toBe(200);
    expect(calls.models).toEqual([
      { planner: "claude-opus-5-5", worker: "gpt-6-luna", plannerEffort: "xhigh", workerEffort: "none" },
    ]);

    const rejected = await post({ plannerModel: "claude-opus-5-5", plannerEffort: "none" });
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as { error: string }).error).toContain("Claude Opus 5.5");
    expect((await post({ workerEffort: "extreme" })).status).toBe(400);
  } finally {
    for (const [k, v] of [
      ["OPENAI_API_KEY", prev.openai],
      ["ANTHROPIC_API_KEY", prev.anthropic],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("artifact endpoints list and serve workspace files", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "app-artifacts-"));
  mkdirSync(join(workspaceRoot, "report"));
  writeFileSync(join(workspaceRoot, "report", "summary.md"), "# Summary");
  writeFileSync(join(workspaceRoot, ".machine-notes"), "hidden but visible");
  writeFileSync(join(workspaceRoot, "report", "résumé.txt"), "international");
  const { harness } = createFakeHarness(workspaceRoot);
  const app = createApp(harness);

  const listResponse = await app.request("/api/workspace/files");
  const list = (await listResponse.json()) as {
    artifacts: Array<{ path: string; mimeType: string }>;
  };
  expect(listResponse.status).toBe(200);
  expect(list.artifacts).toContainEqual(
    expect.objectContaining({
      path: "report/summary.md",
      mimeType: "text/markdown",
    }),
  );
  expect(list.artifacts).toContainEqual(expect.objectContaining({ path: ".machine-notes" }));
  expect(list.artifacts).toContainEqual(expect.objectContaining({ path: "report/résumé.txt" }));

  const params = new URLSearchParams({ path: "report/summary.md" });
  const contentResponse = await app.request(`/api/workspace/content?${params}`);
  expect(contentResponse.status).toBe(200);
  expect(contentResponse.headers.get("content-type")).toBe("text/markdown");
  expect(await contentResponse.text()).toBe("# Summary");

  const internationalParams = new URLSearchParams({
    path: "report/résumé.txt",
  });
  const internationalResponse = await app.request(`/api/workspace/content?${internationalParams}`);
  expect(internationalResponse.status).toBe(200);
  expect(internationalResponse.headers.get("content-disposition")).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.txt");
});

test("artifact content rejects traversal and symlink escapes", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "app-artifact-safe-"));
  const outsideRoot = mkdtempSync(join(tmpdir(), "app-artifact-outside-"));
  writeFileSync(join(outsideRoot, "secret.txt"), "secret");
  symlinkSync(join(outsideRoot, "secret.txt"), join(workspaceRoot, "escape.txt"));
  const { harness } = createFakeHarness(workspaceRoot);
  const app = createApp(harness);

  const traversal = new URLSearchParams({ path: "../secret.txt" });
  expect((await app.request(`/api/workspace/content?${traversal}`)).status).toBe(404);

  const symlink = new URLSearchParams({ path: "escape.txt" });
  expect((await app.request(`/api/workspace/content?${symlink}`)).status).toBe(400);
});

test("workspace listing skips dependency and hidden folders and caps the file count", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "app-artifact-skip-"));
  for (const dir of ["app/node_modules/react", ".pnpm-store/v10", ".git/objects", "py/__pycache__", "out"]) {
    mkdirSync(join(workspaceRoot, dir), { recursive: true });
    writeFileSync(join(workspaceRoot, dir, "file.txt"), "x");
  }
  writeFileSync(join(workspaceRoot, "app", "index.ts"), "x");
  writeFileSync(join(workspaceRoot, ".DS_Store"), "x");

  const listing = await listWorkspaceArtifacts(workspaceRoot);
  expect(listing.truncated).toBe(false);
  expect(listing.artifacts.map((a) => a.path)).toEqual(["app/index.ts", "out/file.txt"]);

  for (let i = 0; i < 5; i++) writeFileSync(join(workspaceRoot, "out", `extra-${i}.txt`), "x");
  const capped = await listWorkspaceArtifacts(workspaceRoot, 3);
  expect(capped.truncated).toBe(true);
  expect(capped.artifacts).toHaveLength(3);
});

test("api rejects foreign origins and non-local hosts", async () => {
  const { harness, calls } = createFakeHarness(mkdtempSync(join(tmpdir(), "app-security-")));
  const app = createApp(harness);
  const post = (url: string, headers: Record<string, string> = {}) =>
    app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ instructions: "x" }),
    });

  expect((await post("http://127.0.0.1:4317/api/runs", { origin: "https://evil.example" })).status).toBe(403);
  expect((await post("http://evil.example:4317/api/runs")).status).toBe(403);
  expect(calls.starts).toEqual([]);

  expect((await post("http://127.0.0.1:4317/api/runs", { origin: "http://localhost:5173" })).status).toBe(200);
});

test("run creation requires a JSON content type", async () => {
  const { harness, calls } = createFakeHarness(mkdtempSync(join(tmpdir(), "app-ctype-")));
  const app = createApp(harness);
  const response = await app.request("/api/runs", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ instructions: "x" }),
  });
  expect(response.status).toBe(400);
  expect(calls.starts).toEqual([]);
});
