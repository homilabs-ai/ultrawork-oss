import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DesktopOnly,
  Field,
  SaveBar,
  Section,
  SettingsPage,
} from "@/components/settings/settings-layout";
import { useDesktopSettings } from "@/hooks/use-desktop-settings";
import { Input } from "@/components/ui/input";
import { desktop } from "@/lib/desktop";

export function SecretsSettings() {
  return (
    <SettingsPage
      title="Secrets"
      eyebrow="This machine"
      icon={KeyRound}
      description="Keys for the tools agents use. They're stored on this Mac. Model provider keys are under Models."
    >
      {desktop ? <SecretsForm /> : <DesktopOnly />}
    </SettingsPage>
  );
}

function SecretsForm() {
  const { saved, save } = useDesktopSettings();
  const [exa, setExa] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && exa === null) setExa(saved.data.exaApiKey);
  }, [saved.data, exa]);

  if (exa === null || !saved.data) return null;

  const dirty = exa !== saved.data.exaApiKey;

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ ...saved.data, exaApiKey: exa }, { onSuccess: (s) => setExa(s.exaApiKey) });
      }}
    >
      <Section title="Tools">
        <Field label="Exa" hint="Optional. Lets agents search the web. Get a key at exa.ai.">
          <Input
            type="password"
            autoComplete="off"
            value={exa}
            onChange={(e) => setExa(e.target.value)}
            placeholder="Leave empty to disable web search"
          />
        </Field>
      </Section>

      <SaveBar dirty={dirty} pending={save.isPending} saved={save.isSuccess} error={save.error} />
    </form>
  );
}
