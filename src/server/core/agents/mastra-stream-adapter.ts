import type { ToolCall, ToolResult, TurnRecorder } from "./turn-recorder.ts";

type ToolCallPayload = {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
};

type ToolResultPayload = {
  toolCallId?: string;
  toolName?: string;
  result?: unknown;
  isError?: boolean;
};

type StreamChunk = {
  type?: string;
  payload?: unknown;
};

type StepSummary = {
  text?: string;
  toolCalls?: Array<{ payload?: ToolCallPayload }>;
  toolResults?: Array<{ payload?: ToolResultPayload }>;
};

const UNNAMED_TOOL = "tool";

export function mastraCallbacks(recorder: TurnRecorder) {
  return {
    onChunk(chunk: StreamChunk): void {
      if (chunk.type === "tool-call") {
        recorder.toolCalled(toToolCall(chunk.payload as ToolCallPayload));
        return;
      }
      if (chunk.type === "tool-result") {
        recorder.toolResolved(toToolResult(chunk.payload as ToolResultPayload));
      }
    },

    onStepFinish(step: StepSummary): void {
      for (const call of step.toolCalls ?? []) {
        recorder.toolCalled(toToolCall(call.payload));
      }
      for (const result of step.toolResults ?? []) {
        recorder.toolResolved(toToolResult(result.payload));
      }
      recorder.assistantSaid(step.text);
    },
  };
}

function toToolCall(payload: ToolCallPayload = {}): ToolCall {
  return {
    toolCallId: payload.toolCallId,
    toolName: payload.toolName ?? UNNAMED_TOOL,
    args: payload.args,
  };
}

function toToolResult(payload: ToolResultPayload = {}): ToolResult {
  return {
    toolCallId: payload.toolCallId,
    toolName: payload.toolName ?? UNNAMED_TOOL,
    result: payload.result,
    isError: payload.isError ?? false,
  };
}
