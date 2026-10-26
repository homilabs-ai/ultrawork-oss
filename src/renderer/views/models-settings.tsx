import { useNavigate } from "@tanstack/react-router";
import { Boxes, Check } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type { ModelInfo, ProviderId } from "@/api/runs";
import { DesktopOnly, SaveBar, SettingsPage } from "@/components/settings/settings-layout";
import { useDesktopSettings } from "@/hooks/use-desktop-settings";
import { Input } from "@/components/ui/input";
import { useModels } from "@/hooks/use-runs";
import { desktop, type DesktopSettings, hasApiKey } from "@/lib/desktop";
import { PROVIDERS } from "@/lib/providers";
import { cn } from "@/lib/utils";

type ApiKeys = DesktopSettings["apiKeys"];

export function ModelsSettings() {
  return (
    <SettingsPage
      title="Models"
      eyebrow="Providers"
      icon={Boxes}
      description="Add a provider's API key to use its models. Only models whose provider has a key show up in the model picker."
    >
      {desktop ? <KeysForm /> : <WebCatalog />}
    </SettingsPage>
  );
}

function KeysForm() {
  const navigate = useNavigate();
  const { saved, save } = useDesktopSettings();
  const catalog = useModels();
  const [draft, setDraft] = useState<ApiKeys | null>(null);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data.apiKeys);
  }, [saved.data, draft]);

  if (!draft || !saved.data) return null;

  const firstRun = !hasApiKey(saved.data.apiKeys);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.data.apiKeys);

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { ...saved.data, apiKeys: draft },
          {
            onSuccess: (s) => {
              setDraft(s.apiKeys);
              if (firstRun && hasApiKey(s.apiKeys)) void navigate({ to: "/runs/new" });
            },
          },
        );
      }}
    >
      {firstRun ? (
        <div className="surface border-brand/30 bg-brand/5 p-5">
          <h2 className="text-sm font-semibold">Welcome to Ultrawork</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Paste an API key for at least one provider and save. Everything else has sensible defaults you can change
            later.
          </p>
        </div>
      ) : null}

      {PROVIDERS.map((p) => (
        <ProviderCard
          key={p.id}
          provider={p.id}
          connected={Boolean(saved.data.apiKeys[p.id])}
          models={catalog.data?.models.filter((m) => m.provider === p.id) ?? []}
        >
          <Input
            type="password"
            autoComplete="off"
            aria-label={`${p.name} API key`}
            value={draft[p.id]}
            onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
            placeholder={p.placeholder}
          />
        </ProviderCard>
      ))}

      <SaveBar dirty={dirty} pending={save.isPending} saved={save.isSuccess} error={save.error} />
    </form>
  );
}

function WebCatalog() {
  const catalog = useModels();
  return (
    <div className="mt-8 space-y-5">
      <DesktopOnly />
      {PROVIDERS.map((p) => {
        const models = catalog.data?.models.filter((m) => m.provider === p.id) ?? [];
        return (
          <ProviderCard key={p.id} provider={p.id} connected={models.some((m) => m.available)} models={models} />
        );
      })}
    </div>
  );
}

function ProviderCard({
  provider,
  connected,
  models,
  children,
}: {
  provider: ProviderId;
  connected: boolean;
  models: ModelInfo[];
  children?: ReactNode;
}) {
  const p = PROVIDERS.find((x) => x.id === provider)!;
  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{p.name}</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Get a key at {p.keyUrl}.</p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            connected ? "bg-muted text-foreground" : "text-muted-foreground",
          )}
        >
          {connected ? <Check className="size-3" /> : null}
          {connected ? "Key added" : "No key"}
        </span>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}

      <ul className="mt-4 divide-y border-t text-sm">
        {models.length === 0 ? (
          <li className="pt-3 text-xs text-muted-foreground">No models from {p.name} yet.</li>
        ) : (
          models.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
              <span className={cn(!m.available && "text-muted-foreground")}>{m.name}</span>
              <span className="text-xs text-muted-foreground">{m.available ? "In model picker" : "Needs key"}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
