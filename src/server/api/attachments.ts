import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

export interface Attachment {
  path: string;
}

export async function resolveAttachments(
  paths: string[],
): Promise<{ ok: true; files: Attachment[] } | { ok: false; error: string }> {
  const files: Attachment[] = [];
  for (const path of paths) {
    if (!isAbsolute(path)) return { ok: false, error: `attachment path must be absolute: ${path}` };
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return { ok: false, error: `attachment not found: ${path}` };
    files.push({ path });
  }
  return { ok: true, files };
}

export function formatAttachmentNote(files: Attachment[]): string | null {
  if (files.length === 0) return null;
  return files.map((f) => f.path).join("\n");
}
