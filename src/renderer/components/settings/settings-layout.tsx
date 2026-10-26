import { Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function SettingsPage({
  title,
  eyebrow,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background/60">
      <header className="window-drag flex h-14 items-center border-b bg-card px-6">
        <div className="flex min-w-0 items-center text-sm text-muted-foreground">
          <span>Settings</span>
          <span className="mx-2.5 text-border">/</span>
          <span className="truncate font-medium text-foreground">{title}</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-brand">
          <Icon className="size-3.5" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  );
}

export function DesktopOnly() {
  return (
    <div className="surface mt-8 p-5 text-sm text-muted-foreground">Settings are available in the Ultrawork app.</div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface p-5">
      <h2 className="label-caption mb-4">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SaveBar({
  dirty,
  pending,
  saved,
  error,
}: {
  dirty: boolean;
  pending: boolean;
  saved: boolean;
  error: unknown;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button type="submit" disabled={!dirty || pending}>
        {pending ? "Applying…" : "Save"}
      </Button>
      {saved && !dirty ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-4" /> Saved
        </span>
      ) : null}
      {error ? <span className="text-sm text-destructive">{String(error)}</span> : null}
    </div>
  );
}
