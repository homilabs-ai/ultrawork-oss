import type { ArtifactFile, RunState, RunSummary, TaskDetail } from "@/types/runs";

async function apiFetch<T>(fetchArgs: { url: string; init?: RequestInit }): Promise<T> {
  const { url, init } = fetchArgs;
  const res = await fetch(url, init);

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function steerRun(input: { runId: string; message: string; files: string[] }) {
  return apiFetch<{ ok: boolean }>({ url: "/api/steer", init: json(input) });
}

import type { ThinkingLevel } from "../../server/core/config.ts";
import type { Effort, ProviderId } from "../../server/core/models.ts";

export type { Effort, ProviderId };
export type ModelInfo = {
  id: string;
  name: string;
  provider: ProviderId;
  available: boolean;
  efforts: Effort[];
  defaultEffort?: Effort;
};
export type ModelCatalog = {
  models: ModelInfo[];
  defaults: {
    planner: string;
    worker: string;
    plannerEffort: ThinkingLevel;
    workerEffort: ThinkingLevel;
    verifier: boolean;
  };
};

export function fetchModels() {
  return apiFetch<ModelCatalog>({ url: "/api/models" });
}

export function fetchVerifierDefaults() {
  return apiFetch<{ defaultPrompt: string }>({ url: "/api/verifier" });
}

export function createRun(input: {
  instructions: string;
  files: string[];
  plannerModel: string;
  workerModel: string;
  plannerEffort: Effort;
  workerEffort: Effort;
  verifier: boolean;
}) {
  return apiFetch<{ runId: string; status: string }>({ url: "/api/runs", init: json(input) });
}

export function stopRun(runId: string) {
  return apiFetch<{
    ok: true;
    alreadyStopped: boolean;
    cancelledAgents: number;
    cancelledTasks: number;
  }>({
    url: `/api/runs/${encodeURIComponent(runId)}/stop`,
    init: { method: "POST" },
  });
}

export function listRuns() {
  return apiFetch<RunSummary[]>({ url: "/api/runs" });
}

export function getRunState(runId: string) {
  const params = new URLSearchParams({ runId });
  return apiFetch<RunState>({ url: `/api/state?${params}` });
}

export function getTaskDetail(runId: string, taskId: string) {
  const params = new URLSearchParams({ runId });
  return apiFetch<TaskDetail>({
    url: `/api/tasks/${encodeURIComponent(taskId)}?${params}`,
  });
}

export type WorkspaceListing = {
  artifacts: ArtifactFile[];
  truncated: boolean;
};

export function listArtifacts() {
  return apiFetch<WorkspaceListing>({
    url: "/api/workspace/files",
  });
}

export function artifactContentUrl(path: string, download = false) {
  const params = new URLSearchParams({ path });
  if (download) params.set("download", "1");
  return `/api/workspace/content?${params}`;
}

export async function getArtifactText(path: string) {
  const response = await fetch(artifactContentUrl(path));
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

export function openRunStream(runId: string, onEvent: (event: unknown) => void): () => void {
  const url = runId ? `/api/stream?runId=${encodeURIComponent(runId)}` : "/api/stream";

  const es = new EventSource(url);

  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {}
  };

  es.onerror = () => {};

  return () => es.close();
}
