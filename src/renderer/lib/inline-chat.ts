import type { PlannerTranscriptItem } from "@/types/runs";

export const INLINE_REPLY_TOOL = "reply_inline_message";

export type InlineChatBubble = {
  id: string;
  role: "user" | "assistant";
  timestamp: number;
  text: string;
  files?: string[];
};

export function splitAttachments(message: string): { text: string; files: string[] } {
  const lines = message.trimEnd().split("\n");
  const files: string[] = [];
  while (lines.length > 0) {
    const line = lines[lines.length - 1]!.trim();
    if (line.startsWith("/")) {
      files.unshift(line);
      lines.pop();
    } else if (line === "" && files.length > 0) {
      lines.pop();
    } else {
      break;
    }
  }
  return { text: lines.join("\n").trimEnd(), files };
}

function messageFromToolArgs(args: string | undefined): string | null {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : null;
  } catch {
    return null;
  }
}

const withFiles = (files: string[]) => (files.length > 0 ? { files } : {});

export function buildInlineChatBubbles(args: {
  instructionMd: string;
  createdAt: number;
  transcript: PlannerTranscriptItem[];
}): InlineChatBubble[] {
  const bubbles: InlineChatBubble[] = [];
  const goal = splitAttachments(args.instructionMd);
  if (goal.text || goal.files.length > 0) {
    bubbles.push({
      id: "goal-brief",
      role: "user",
      timestamp: args.createdAt,
      text: goal.text,
      ...withFiles(goal.files),
    });
  }

  for (const item of args.transcript) {
    if (item.kind === "steer") {
      const steer = splitAttachments(item.text);
      bubbles.push({
        id: item.id,
        role: "user",
        timestamp: item.timestamp,
        text: steer.text,
        ...withFiles(steer.files),
      });
      continue;
    }
    if (item.kind !== "tool" || item.toolName !== INLINE_REPLY_TOOL) continue;
    const text =
      messageFromToolArgs(item.args)?.trim() || item.text.replace(new RegExp(`^${INLINE_REPLY_TOOL}:\\s*`), "").trim();
    if (!text) continue;
    bubbles.push({
      id: item.id,
      role: "assistant",
      timestamp: item.timestamp,
      text,
    });
  }

  return bubbles;
}
