import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export function replyInlineMessageTool() {
  return createTool({
    id: "reply_inline_message",
    description:
      "Send the user a chat message. This is the only thing they see; your freeform text is not shown. " +
      "Sending a message does not end your turn; you end it by replying with plain text and no tool call. " +
      "Write like a sharp colleague texting: short, plain, specific. No emoji, no greetings, " +
      "no menus of options, no sign-offs. Use it for acknowledgements, milestone progress (what finished, what's next), " +
      "changes of plan, questions, and the final result; not for empty \"still working\" chatter.",
    inputSchema: z.object({
      message: z.string().min(1).describe("Markdown. Links and workspace file paths are fine."),
    }),
    execute: async ({ message }: { message: string }) => {
      const text = message.trim();
      if (!text) return { error: "Message must not be empty." };
      return { ok: true, delivered: true };
    },
  });
}
