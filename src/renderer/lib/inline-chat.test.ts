import { describe, expect, test } from "bun:test";

import { buildInlineChatBubbles, splitAttachments } from "./inline-chat";
import type { PlannerTranscriptItem } from "@/types/runs";

describe("buildInlineChatBubbles", () => {
  test("includes the goal as the first user bubble and only inline replies", () => {
    const transcript: PlannerTranscriptItem[] = [
      {
        id: "1",
        kind: "assistant",
        timestamp: 100,
        text: "thinking out loud — should not appear",
      },
      {
        id: "2",
        kind: "tool",
        timestamp: 200,
        text: "spawnTask: do work",
        toolName: "spawnTask",
        args: JSON.stringify({ title: "do work" }),
      },
      {
        id: "3",
        kind: "tool",
        timestamp: 300,
        text: "reply_inline_message: Checking Slack…",
        toolName: "reply_inline_message",
        args: JSON.stringify({ message: "Checking Slack…" }),
      },
      {
        id: "4",
        kind: "steer",
        timestamp: 400,
        text: "please nudge them",
      },
      {
        id: "5",
        kind: "tool",
        timestamp: 500,
        text: "send_external_message: slack:C1",
        toolName: "send_external_message",
        args: JSON.stringify({ channelId: "slack:C1", message: "hi" }),
      },
      {
        id: "6",
        kind: "tool",
        timestamp: 600,
        text: "reply_inline_message: Sent a Slack ping.",
        toolName: "reply_inline_message",
        args: JSON.stringify({ message: "Sent a Slack ping." }),
      },
    ];

    const bubbles = buildInlineChatBubbles({
      instructionMd: "Reconcile Q3",
      createdAt: 1,
      transcript,
    });

    expect(bubbles).toEqual([
      { id: "goal-brief", role: "user", timestamp: 1, text: "Reconcile Q3" },
      {
        id: "3",
        role: "assistant",
        timestamp: 300,
        text: "Checking Slack…",
      },
      {
        id: "4",
        role: "user",
        timestamp: 400,
        text: "please nudge them",
      },
      {
        id: "6",
        role: "assistant",
        timestamp: 600,
        text: "Sent a Slack ping.",
      },
    ]);
  });
});

describe("splitAttachments", () => {
  test("pulls trailing absolute-path lines out of the message", () => {
    expect(splitAttachments("summarize\n\n/Users/me/a.pdf\n/Users/me/b (1).csv")).toEqual({
      text: "summarize",
      files: ["/Users/me/a.pdf", "/Users/me/b (1).csv"],
    });
  });
  test("leaves ordinary messages alone", () => {
    expect(splitAttachments("look at /etc/hosts please")).toEqual({ text: "look at /etc/hosts please", files: [] });
  });
});
