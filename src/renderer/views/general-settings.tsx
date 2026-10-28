import { FolderOpen, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { DesktopOnly, Field, SaveBar, Section, SettingsPage } from "@/components/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDesktopSettings } from "@/hooks/use-desktop-settings";
import { type DesktopSettings, desktop } from "@/lib/desktop";

export function GeneralSettings() {
  return (
    <SettingsPage
      title="General"
      eyebrow="This machine"
      icon={Settings2}
      description="Where agents save their work, and what they're allowed to do on this Mac."
    >
      {desktop ? <SettingsForm /> : <DesktopOnly />}
    </SettingsPage>
  );
}

function SettingsForm() {
  const bridge = desktop!;
  const { saved, save } = useDesktopSettings();
  const [draft, setDraft] = useState<DesktopSettings | null>(null);
  const [domainsText, setDomainsText] = useState("");

  const reset = (s: DesktopSettings) => {
    setDraft(s);
    setDomainsText(s.sandbox.allowedDomains.join("\n"));
  };
  useEffect(() => {
    if (saved.data && !draft) reset(saved.data);
  }, [saved.data, draft]);

  if (!draft) return null;

  const current: DesktopSettings = {
    ...draft,
    sandbox: {
      ...draft.sandbox,
      allowedDomains: domainsText
        .split(/[\n,]/)
        .map((d) => d.trim())
        .filter(Boolean),
    },
  };
  const dirty = JSON.stringify(current) !== JSON.stringify(saved.data);
  const update = (patch: Partial<DesktopSettings>) => setDraft({ ...draft, ...patch });
  const updateSandbox = (patch: Partial<DesktopSettings["sandbox"]>) =>
    setDraft({ ...draft, sandbox: { ...draft.sandbox, ...patch } });

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(current, { onSuccess: reset });
      }}
    >
      <Section title="Workspace">
        <Field label="Folder" hint="Agents save their work here.">
          <div className="flex gap-2">
            <Input value={draft.workspaceDir} onChange={(e) => update({ workspaceDir: e.target.value })} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const dir = await bridge.chooseFolder(draft.workspaceDir);
                if (dir) update({ workspaceDir: dir });
              }}
            >
              <FolderOpen data-icon="inline-start" />
              Choose
            </Button>
          </div>
        </Field>
        <Field label="Browser" hint="Let agents browse websites, including ones that need a login.">
          <Switch
            label="Enable browser tools"
            checked={draft.chromeMcp}
            onCheckedChange={(v) => update({ chromeMcp: v })}
          />
        </Field>
      </Section>

      <Section title="Permissions">
        <p className="text-sm leading-6 text-muted-foreground">
          Agents run code in an isolated sandbox. They can only write inside the workspace folder and can't read your
          passwords or keys.
        </p>
        <Field label="Package installs" hint="Let agents download tools and libraries they need for a task.">
          <Switch
            label="Allow network to listed domains"
            checked={draft.sandbox.networkEnabled}
            onCheckedChange={(v) => updateSandbox({ networkEnabled: v })}
          />
        </Field>
        <Field label="Allowed sites" hint="Where agents may download from. One per line; everything else is blocked.">
          <Textarea
            rows={6}
            className="font-mono text-xs"
            disabled={!draft.sandbox.networkEnabled}
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 text-muted-foreground"
            onClick={async () => {
              const d = await bridge.settings.defaults();
              setDomainsText(d.sandbox.allowedDomains.join("\n"));
            }}
          >
            <RotateCcw data-icon="inline-start" />
            Reset to defaults
          </Button>
        </Field>
        <Field label="Command timeout" hint="Seconds before a single command is stopped.">
          <Input
            type="number"
            min={10}
            className="w-32"
            value={Math.round(draft.sandbox.timeoutMs / 1000)}
            onChange={(e) => updateSandbox({ timeoutMs: Math.max(10, Number(e.target.value) || 0) * 1000 })}
          />
        </Field>
      </Section>

      <SaveBar dirty={dirty} pending={save.isPending} saved={save.isSuccess} error={save.error} />
    </form>
  );
}
