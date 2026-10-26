import type { Repo } from "@/core/db/repo.ts";
import { serializeError } from "@/core/errors.ts";
import type { EventBus } from "@/core/transport/events.ts";

export type TurnKind = "planner" | "worker";

export type ToolCall = {
  toolCallId: string | undefined;
  toolName: string;
  args: unknown;
};

export type ToolResult = {
  toolCallId: string | undefined;
  toolName: string;
  result: unknown;
  isError: boolean;
};

export type TurnRecorderOptions = {
  repo: Repo;
  bus: EventBus;
  kind: TurnKind;
  runId: string;
  agentId?: string;
  taskId?: string;
};

const MAX_ARGS_CHARS = 2_000;
const MAX_RESULT_CHARS = 4_000;
const MAX_TEXT_CHARS = 8_000;
const INLINE_REPLY_TOOL = "reply_inline_message";

export class TurnRecorder {
  private readonly writtenToolIds = new Set<string>();

  private readonly writtenText = new Set<string>();

  constructor(private readonly options: TurnRecorderOptions) {}

  turnStarted(details: Record<string, unknown>): void {
    this.write("turn.start", details);
  }

  turnEnded(details: Record<string, unknown>): void {
    this.write("turn.end", details);
  }

  turnFailed(error: unknown, details: Record<string, unknown>): void {
    this.write("llm.error", { ...serializeError(error), ...details });
  }

  turnRetrying(error: unknown, details: Record<string, unknown>): void {
    this.write("llm.retry", { ...serializeError(error), ...details });
  }

  toolCalled(call: ToolCall): void {
    if (this.isDuplicate("call", call.toolCallId)) return;
    this.write("step", {
      msg: describeToolCall(call.toolName, call.args),
      toolName: call.toolName,
      toolCallId: call.toolCallId,
      args: truncatedJson(call.args, call.toolName === INLINE_REPLY_TOOL ? MAX_TEXT_CHARS : MAX_ARGS_CHARS),
    });
  }

  toolResolved(result: ToolResult): void {
    if (this.isDuplicate("result", result.toolCallId)) return;
    this.write("tool.result", {
      msg: `↳ ${result.toolName}`,
      toolName: result.toolName,
      toolCallId: result.toolCallId,
      result: truncatedJson(result.result, MAX_RESULT_CHARS),
      isError: result.isError,
    });
  }

  assistantSaid(text: string | undefined): void {
    const trimmed = text?.trim();
    if (!trimmed || this.writtenText.has(trimmed)) return;
    this.writtenText.add(trimmed);
    this.write("text", { text: trimmed.slice(0, MAX_TEXT_CHARS) });
  }

  private isDuplicate(prefix: string, toolCallId: string | undefined): boolean {
    if (!toolCallId) return false;
    const key = `${prefix}:${toolCallId}`;
    if (this.writtenToolIds.has(key)) return true;
    this.writtenToolIds.add(key);
    return false;
  }

  private write(suffix: string, payload: Record<string, unknown>): void {
    const { repo, bus, kind, runId, agentId, taskId } = this.options;
    const type = `${kind}.${suffix}`;

    repo.logEvent({ runId, agentId, taskId, type, payload });
    bus.publish({ type, runId, agentId: agentId ?? null, taskId: taskId ?? null });
  }
}

function truncatedJson(value: unknown, limit: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : safeStringify(value);
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit)}\n… truncated` : text;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

function describeToolCall(toolName: string, args: unknown): string {
  const fields = (args ?? {}) as Record<string, unknown>;
  if (typeof fields.path === "string") {
    return `${toolName} ${fields.path}`;
  }
  if (typeof fields.query === "string") {
    return `${toolName} "${condense(fields.query, 50)}"`;
  }
  if (typeof fields.scope === "string") {
    return `${toolName}: ${condense(fields.scope)}`;
  }
  if (typeof fields.description === "string") {
    return `${toolName}: ${condense(fields.description)}`;
  }
  if (typeof fields.message === "string") {
    return `${toolName}: ${condense(fields.message)}`;
  }
  if (typeof fields.channelId === "string") {
    return `${toolName}: ${fields.channelId}`;
  }
  if (typeof fields.threadId === "string") {
    return `${toolName}: ${fields.threadId}`;
  }
  return toolName;
}

function condense(value: string, limit = 70): string {
  return value.replace(/\s+/g, " ").slice(0, limit);
}
