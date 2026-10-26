import { RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import type { Effort } from "@/api/runs";
import { DesktopOnly, Field, SaveBar, Section, SettingsPage } from "@/components/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDesktopSettings } from "@/hooks/use-desktop-settings";
import { closestEffort, effortsFor } from "@/hooks/use-model-choice";
import { useModels, useVerifierDefaults } from "@/hooks/use-runs";
import { desktop, type DesktopSettings } from "@/lib/desktop";
import { providerName } from "@/lib/providers";

type VerifierSettings = DesktopSettings["verifier"];

const AUTO = "auto";

export function WorkerPlugins() {
  return (
    <SettingsPage
      title="Worker plugins"
      eyebrow="Specialized workers"
      icon={Sparkles}
      description="Extra worker types the planner can call on. Changes apply to goals you start after saving."
    >
      {desktop ? <VerifierForm /> : <DesktopOnly />}
    </SettingsPage>
  );
}

function VerifierForm() {
  const { saved, save } = useDesktopSettings();
  const catalog = useModels();
  const defaults = useVerifierDefaults();
  const [draft, setDraft] = useState<VerifierSettings | null>(null);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data.verifier);
  }, [saved.data, draft]);

  if (!draft || !saved.data) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.data.verifier);
  const update = (patch: Partial<VerifierSettings>) => setDraft({ ...draft, ...patch });

  const keyed = catalog.data?.models.filter((m) => m.available || m.id === draft.model) ?? [];
  const modelItems = [
    { value: AUTO, label: "Auto" },
    ...keyed.map((m) => ({
      value: m.id,
      label: m.available ? `${m.name} · ${providerName(m.provider)}` : `${m.name} · needs key`,
    })),
  ];

  const defaultPrompt = defaults.data?.defaultPrompt ?? "";
  const promptText = draft.prompt || defaultPrompt;
  const customPrompt = draft.prompt !== "";

  const modelInfo = (id: string) => catalog.data?.models.find((m) => m.id === id);
  const effortItems = effortsFor(modelInfo(draft.model)).map((e) => ({ value: e.id, label: e.label }));

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ ...saved.data, verifier: draft }, { onSuccess: (s) => setDraft(s.verifier) });
      }}
    >
      <Section title="Final verifier">
        <p className="text-sm leading-6 text-muted-foreground">
          Before a goal is marked done, a separate model checks the work against your original goal and reports what's
          missing. The planner fixes what it finds, for up to two rounds. Verifiers are told not to change anything.
          Turn it on for a goal from the plugin menu next to the model picker.
        </p>
        <Field
          label="Model"
          hint="Auto picks a model you have a key for, from a different provider than the goal's model when it can."
        >
          <Select
            items={modelItems}
            value={draft.model || AUTO}
            onValueChange={(v) => {
              const model = v === AUTO || !v ? "" : String(v);
              update({ model, effort: closestEffort(modelInfo(model), draft.effort) });
            }}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Effort"
          hint="How hard the verifier thinks. Higher is slower and more thorough. With Auto, levels the picked model doesn't support are lowered to the nearest one it does."
        >
          <Select items={effortItems} value={draft.effort} onValueChange={(v) => v && update({ effort: v as Effort })}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {effortItems.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Verifier prompt">
        <div className="-mt-1 flex items-start justify-between gap-4">
          <p className="text-xs leading-5 text-muted-foreground">
            {customPrompt ? "Custom prompt. " : "Built-in prompt. "}
            The verifier reports its verdict as Clean or Needs work; if it doesn't give one, the result counts as Needs
            work.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            disabled={!customPrompt}
            onClick={() => update({ prompt: "" })}
          >
            <RotateCcw data-icon="inline-start" />
            Reset to default
          </Button>
        </div>
        <Textarea
          value={promptText}
          disabled={!defaults.data}
          onChange={(e) => update({ prompt: e.target.value.trim() === defaultPrompt.trim() ? "" : e.target.value })}
          spellCheck={false}
          className="min-h-72 resize-y font-mono text-xs leading-5"
        />
      </Section>

      <SaveBar dirty={dirty} pending={save.isPending} saved={save.isSuccess} error={save.error} />
    </form>
  );
}
