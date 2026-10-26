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

import { useCreateRun, useModels } from "@/hooks/use-runs";
import { Link, useNavigate } from "@tanstack/react-router";
import { ModelPicker } from "@/components/runs/model-picker";
import { PluginSelector } from "@/components/runs/new-run-selectors";
import { useModelChoice } from "@/hooks/use-model-choice";

export function NewRun() {
  const [text, setText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const catalog = useModels();
  const choice = useModelChoice(catalog.data);
  const hasModel = Boolean(choice.planner.model && choice.worker.model);
  const noModels = catalog.isSuccess && !hasModel;
  const createRun = useCreateRun();
  const navigate = useNavigate();

  const handleSubmit = async (message: PromptInputMessage) => {
    const instructions = message.text.trim();
    if ((!instructions && message.files.length === 0) || createRun.isPending || !hasModel) {
      return;
    }
    setUploadError(null);
    const { runId } = await createRun.mutateAsync({
      instructions,
      files: attachmentPaths(message.files),
      plannerModel: choice.planner.model,
      workerModel: choice.worker.model,
      plannerEffort: choice.planner.effort,
      workerEffort: choice.worker.effort,
      verifier: choice.verifier,
    });
    setText("");
    navigate({ to: "/runs/$runId", params: { runId } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-2xl text-brand text-left">Set a goal for agents to work on...</h1>

      <PromptInput
        className="max-w-2xl"
        globalDrop
        multiple
        onError={({ message }) => setUploadError(message)}
        onSubmit={handleSubmit}
      >
        <PromptInputHeader>
          <PromptInputAttachments />
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea
            autoFocus
            name="message"
            onChange={(e) => setText(e.target.value)}
            placeholder="Set a goal for agents to work on..."
            value={text}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputAddAttachmentsButton />
            <div className="mx-0.5 h-4 w-px bg-border" />
            <ModelPicker choice={choice} />
            <PluginSelector verifierEnabled={choice.verifier} onVerifierEnabledChange={choice.setVerifier} />
          </PromptInputTools>
          <PromptInputSubmit disabled={createRun.isPending || !hasModel} />
        </PromptInputFooter>
      </PromptInput>
      {noModels && (
        <p className="max-w-2xl text-sm text-muted-foreground">
          No model available yet.{" "}
          <Link to="/settings/models" className="text-brand underline-offset-4 hover:underline">
            Add an API key in Settings
          </Link>{" "}
          to get started.
        </p>
      )}
      {(uploadError || createRun.error) && (
        <p className="max-w-2xl text-destructive text-sm">
          {uploadError ??
            (createRun.error instanceof Error ? createRun.error.message : "Could not create the session.")}
        </p>
      )}
    </div>
  );
}
