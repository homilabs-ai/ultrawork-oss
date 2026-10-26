import { FileIcon } from "lucide-react";
import { desktop } from "@/lib/desktop";
import { MessageSquareIcon } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ArtifactMarkdown } from "@/components/artifacts/artifact-reference";
import { formatChatTimestamp } from "@/lib/format";
import { buildInlineChatBubbles } from "@/lib/inline-chat";
import type { PlannerTranscriptItem, Run } from "@/types/runs";

const TIMESTAMP_GAP_MS = 5 * 60 * 1000;

export function InlineChat({
  run,
  transcript,
  isAgentWorking = false,
}: {
  run: Run;
  transcript: PlannerTranscriptItem[];
  isAgentWorking?: boolean;
}) {
  const messages = buildInlineChatBubbles({
    instructionMd: run.instruction_md,
    createdAt: run.created_at,
    transcript,
  });

  return (
    <Conversation className="chat-conversation mt-1 min-h-0" initial="instant">
      <ConversationContent
        className="mx-auto min-h-full w-full max-w-[44rem] justify-end gap-6 px-2"
        scrollClassName="chat-conversation-scroll"
      >
        {messages.length === 0 && !isAgentWorking ? (
          <ConversationEmptyState
            icon={<MessageSquareIcon className="size-10" />}
            title="No messages yet"
            description={
              <>
                Steer below — assistant replies arrive via{" "}
                <code className="font-mono text-xs">reply_inline_message</code>.
              </>
            }
          />
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const showTimestamp = !previous || message.timestamp - previous.timestamp >= TIMESTAMP_GAP_MS;
            return (
              <div className="flex flex-col gap-2" key={message.id}>
                {showTimestamp && <div className="chat-timestamp">{formatChatTimestamp(message.timestamp)}</div>}
                <Message from={message.role}>
                  <MessageContent>
                    {message.files && message.files.length > 0 && <AttachmentChips paths={message.files} />}
                    {message.text && (
                      <MessageResponse>
                        <ArtifactMarkdown>
                          {message.text}
                        </ArtifactMarkdown>
                      </MessageResponse>
                    )}
                  </MessageContent>
                </Message>
              </div>
            );
          })
        )}
        {isAgentWorking && (
          <Message aria-live="polite" from="assistant" role="status">
            <MessageContent>
              <Shimmer className="text-[15px] leading-relaxed">Planning next moves</Shimmer>
            </MessageContent>
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton className="bottom-3 shadow-raised" />
    </Conversation>
  );
}

function AttachmentChips({ paths }: { paths: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {paths.map((path) => (
        <button
          key={path}
          type="button"
          title={path}
          onClick={() => desktop?.revealPath(path)}
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border bg-background/60 px-2 py-1 text-xs hover:bg-background"
        >
          <FileIcon className="size-3.5 shrink-0" />
          <span className="truncate">{path.split("/").pop()}</span>
        </button>
      ))}
    </div>
  );
}
