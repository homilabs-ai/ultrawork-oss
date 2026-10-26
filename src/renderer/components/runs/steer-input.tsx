import { attachmentPaths } from "@/lib/desktop";
import { useState } from "react";

import {
  PromptInput,
  PromptInputAddAttachmentsButton,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { useSteerRun } from "@/hooks/use-runs";

export function SteerInput({ runId, disabled = false }: Readonly<{ runId: string; disabled?: boolean }>) {
  const [text, setText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const steer = useSteerRun();

  const handleSubmit = async (message: PromptInputMessage) => {
    const note = message.text.trim();
    if (disabled || (!note && message.files.length === 0) || steer.isPending) {
      return;
    }
    setUploadError(null);
    await steer.mutateAsync({ runId, message: note, files: attachmentPaths(message.files) });
    setText("");
  };

  return (
    <div className="chat-composer-inner space-y-2">
      <PromptInput
        className="chat-composer-form"
        multiple
        onError={({ message }) => setUploadError(message)}
        onSubmit={handleSubmit}
      >
        <PromptInputHeader>
          <PromptInputAttachments />
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea
            name="message"
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            placeholder={disabled ? "This session is unavailable." : "Steer this session..."}
            value={text}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputAddAttachmentsButton />
          </PromptInputTools>
          <PromptInputSubmit disabled={disabled || steer.isPending} />
        </PromptInputFooter>
      </PromptInput>
      {(uploadError || steer.error) && (
        <p className="px-1 text-destructive text-sm">
          {uploadError ?? (steer.error instanceof Error ? steer.error.message : "Could not steer this session.")}
        </p>
      )}
    </div>
  );
}
