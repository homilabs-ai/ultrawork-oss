import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { VERIFIER_SYSTEM } from "@/core/agents/prompts.ts";
import { THINKING_LEVELS, type ThinkingLevel } from "@/core/config.ts";
import type { RunModels } from "@/core/db/repo.ts";
import type { Harness } from "@/core/index.ts";
import { type Effort, findModel, listModels, PROVIDERS, providerConfigured, toCatalogId } from "@/core/models.ts";
import { RunService } from "./run-service.ts";
import { openRunEventStream, steerRun, stopRun } from "./runs.ts";
import { contentDisposition, listWorkspaceArtifacts, resolveArtifactFile } from "./artifacts.ts";
import { formatAttachmentNote, resolveAttachments } from "./attachments.ts";
import { localOnly } from "./security.ts";

interface InputRequestBody {
  instructions?: string;
  message?: string;
  runId?: string;
  plannerModel?: string;
  workerModel?: string;
  plannerEffort?: string;
  workerEffort?: string;
  effort?: string;
  verifier?: boolean;
  files?: string[];
}

async function parseInputRequest(req: Request): Promise<(InputRequestBody & { files: string[] }) | null> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) return null;
  const body = (await req.json().catch(() => null)) as InputRequestBody | null;
  if (!body) return null;
  const files = Array.isArray(body.files) ? body.files.filter((f): f is string => typeof f === "string") : [];
  return { ...body, files };
}

function pickModels(body: {
  plannerModel?: string;
  workerModel?: string;
  plannerEffort?: string;
  workerEffort?: string;
  effort?: string;
  verifier?: unknown;
}): { ok: true; value: RunModels } | { ok: false; error: string } {
  const value: RunModels = {};
  for (const [role, id, effort, effortKey] of [
    ["planner", body.plannerModel, body.plannerEffort ?? body.effort, "plannerEffort"],
    ["worker", body.workerModel, body.workerEffort ?? body.effort, "workerEffort"],
  ] as const) {
    const model = id ? findModel(id) : undefined;
    if (id) {
      if (!model) return { ok: false, error: `unknown ${role} model: ${id}` };
      if (!providerConfigured(model.provider)) {
        return { ok: false, error: `${PROVIDERS[model.provider].name} API key is not set` };
      }
      value[role] = id;
    }
    if (!effort) continue;
    if (!THINKING_LEVELS.includes(effort as ThinkingLevel)) {
      return { ok: false, error: `unknown ${role} effort: ${effort}` };
    }
    if (model && effort !== "off" && !model.efforts.includes(effort as Effort)) {
      return { ok: false, error: `${model.name} doesn't support effort "${effort}"` };
    }
    value[effortKey] = effort as ThinkingLevel;
  }
  if (body.verifier !== undefined) {
    if (typeof body.verifier !== "boolean") return { ok: false, error: "verifier must be a boolean" };
    value.verifier = body.verifier;
  }
  return { ok: true, value };
}

export function createApp(h: Harness) {
  const app = new Hono();
  const runService = new RunService(h.repo);

  app.use("*", localOnly);

  app.get("/api/state", (c) => {
    const runId = c.req.query("runId");
    if (!runId) return c.json({ error: "runId required" }, 400);
    const state = runService.getState(runId);
    return state ? c.json(state) : c.json({ error: "run not found" }, 404);
  });

  app.get("/api/runs", (c) => {
    return c.json(runService.listRuns(50));
  });

  app.get("/api/models", (c) => {
    return c.json({
      models: listModels(),
      defaults: {
        planner: toCatalogId(h.config.plannerModel),
        worker: toCatalogId(h.config.workerModel),
        plannerEffort: h.config.plannerThinkingLevel,
        workerEffort: h.config.workerThinkingLevel,
        verifier: h.config.verifierPlugin,
      },
    });
  });

  app.get("/api/verifier", (c) => c.json({ defaultPrompt: VERIFIER_SYSTEM }));

  app.get("/api/workspace/files", async (c) => {
    const listing = await listWorkspaceArtifacts(h.workspaceRoot);
    return c.json(listing);
  });

  app.get("/api/workspace/content", async (c) => {
    const artifact = await resolveArtifactFile(h.workspaceRoot, c.req.query("path") ?? "");
    if (!artifact.ok) {
      return c.json({ error: artifact.error }, artifact.status);
    }

    return new Response(Bun.file(artifact.absolutePath), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": contentDisposition(artifact.filename, c.req.query("download") === "1"),
        "content-type": artifact.mimeType,
        "x-content-type-options": "nosniff",
      },
    });
  });

  app.post("/api/runs", async (c) => {
    const body = await parseInputRequest(c.req.raw);
    const instructions = body?.instructions?.trim() ?? "";
    if (!body || (!instructions && body.files.length === 0)) {
      return c.json({ error: "instructions or files required" }, 400);
    }

    const models = pickModels(body);
    if (!models.ok) return c.json({ error: models.error }, 400);

    const attached = await resolveAttachments(body.files);
    if (!attached.ok) return c.json({ error: attached.error }, 400);

    const instruction = [instructions || "Review and act on the attached files.", formatAttachmentNote(attached.files)]
      .filter(Boolean)
      .join("\n\n");
    const runId = h.createRun(instruction, models.value);
    void h.start(runId);
    return c.json({ runId, status: "created" });
  });

  app.post("/api/runs/:runId/stop", (c) => {
    const runId = c.req.param("runId");
    if (!h.repo.getRun(runId)) {
      return c.json({ error: "run not found" }, 404);
    }
    const result = stopRun(h, runId);
    return result.ok ? c.json(result) : c.json(result, 409);
  });

  app.get("/api/tasks/:taskId", (c) => {
    const taskId = c.req.param("taskId");
    const runId = c.req.query("runId");
    if (!runId) return c.json({ error: "runId required" }, 400);
    const detail = runService.getTaskDetail(runId, taskId);
    return detail ? c.json(detail) : c.json({ error: "task not found" }, 404);
  });

  app.get("/api/stream", (c) => {
    const runId = c.req.query("runId");
    const stream = openRunEventStream(h, runId, c.req.raw.signal);
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  app.post("/api/steer", async (c) => {
    const body = await parseInputRequest(c.req.raw);
    const runId = body?.runId;
    const message = body?.message?.trim() ?? "";
    if (!runId || !body || (!message && body.files.length === 0)) {
      return c.json({ error: "runId and message or files required" }, 400);
    }
    const run = h.repo.getRun(runId);
    if (!run) {
      return c.json({ error: "run not found" }, 404);
    }
    const attached = await resolveAttachments(body.files);
    if (!attached.ok) return c.json({ error: attached.error }, 400);
    const result = steerRun(h, runId, [message, formatAttachmentNote(attached.files)].filter(Boolean).join("\n\n"));
    return result.ok ? c.json(result) : c.json(result, 400);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  if (h.config.webDist) {
    const root = h.config.webDist;
    app.get("*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  return app;
}
