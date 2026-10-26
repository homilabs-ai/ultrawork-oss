import { readdir, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export type ArtifactFile = {
  path: string;
  name: string;
  mimeType: string;
  bytes: number;
  modifiedAt: number;
};

function mimeType(path: string): string {
  return Bun.file(path.toLowerCase()).type;
}

function workspacePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "__pycache__",
  "site-packages",
  "venv",
]);
const SKIPPED_FILES = new Set([".DS_Store", "Thumbs.db"]);

export const MAX_LISTED_FILES = 5000;

export type WorkspaceListing = {
  artifacts: ArtifactFile[];
  truncated: boolean;
};

function skipDirectory(name: string): boolean {
  return name.startsWith(".") || SKIPPED_DIRECTORIES.has(name);
}

export async function listWorkspaceArtifacts(
  workspaceRoot: string,
  maxFiles = MAX_LISTED_FILES,
): Promise<WorkspaceListing> {
  const root = await realpath(resolve(workspaceRoot)).catch(() => null);
  if (!root) return { artifacts: [], truncated: false };

  const queue = [root];
  const files: ArtifactFile[] = [];
  let truncated = false;

  while (queue.length > 0 && !truncated) {
    const directory = queue.shift();
    if (!directory) break;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

    const candidates: string[] = [];
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirectory(entry.name)) queue.push(absolutePath);
      } else if (entry.isFile() && !SKIPPED_FILES.has(entry.name)) {
        candidates.push(absolutePath);
      }
    }

    const room = maxFiles - files.length;
    if (candidates.length > room) {
      candidates.length = room;
      truncated = true;
    }
    const infos = await Promise.all(candidates.map((p) => stat(p).catch(() => null)));
    candidates.forEach((absolutePath, i) => {
      const info = infos[i];
      if (!info?.isFile()) return;
      const path = workspacePath(root, absolutePath);
      files.push({
        path,
        name: path.split("/").at(-1) ?? path,
        mimeType: mimeType(path),
        bytes: info.size,
        modifiedAt: info.mtimeMs,
      });
    });
    if (files.length >= maxFiles && queue.length > 0) truncated = true;
  }

  return { artifacts: files.toSorted((a, b) => a.path.localeCompare(b.path)), truncated };
}

export async function resolveArtifactFile(
  workspaceRoot: string,
  filePath: string,
): Promise<
  | { ok: true; absolutePath: string; filename: string; mimeType: string }
  | { ok: false; error: string; status: 400 | 404 }
> {
  const trimmed = filePath.trim().replace(/^\/workspace\/?/, "");
  if (!trimmed) {
    return { ok: false, error: "Artifact path is required.", status: 400 };
  }

  const root = await realpath(resolve(workspaceRoot)).catch(() => null);
  const candidate = resolve(workspaceRoot, trimmed);
  const absolutePath = await realpath(candidate).catch(() => null);
  if (!root || !absolutePath) {
    return { ok: false, error: "Artifact not found.", status: 404 };
  }

  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!absolutePath.startsWith(rootPrefix)) {
    return { ok: false, error: "Artifact path escapes the workspace.", status: 400 };
  }

  const info = await stat(absolutePath).catch(() => null);
  if (!info?.isFile()) {
    return { ok: false, error: "Artifact not found.", status: 404 };
  }

  const path = workspacePath(root, absolutePath);
  return {
    ok: true,
    absolutePath,
    filename: path.split("/").at(-1) ?? "artifact",
    mimeType: mimeType(path),
  };
}

export function contentDisposition(filename: string, download: boolean): string {
  const safeName = filename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\\r\n]/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
