import { createFileRoute, redirect } from "@tanstack/react-router";

import { runsQueryOptions } from "@/hooks/use-runs";
import { desktop, hasApiKey, isDesktop } from "@/lib/desktop";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    if (desktop) {
      const settings = await desktop.settings.get();
      if (!settings.setupDone) throw redirect({ to: "/setup" });
      if (!hasApiKey(settings.apiKeys)) throw redirect({ to: "/settings/models" });
    }
    const runs = await context.queryClient.ensureQueryData(runsQueryOptions);
    const newest = runs[0];
    if (newest) {
      throw redirect({ to: "/runs/$runId", params: { runId: newest.id } });
    }
    throw redirect({ to: "/runs/new" });
  },
  errorComponent: ApiUnreachable,
});

function ApiUnreachable({ error }: { error: Error }) {
  return (
    <div className="center-note h-screen">
      <p className="text-destructive">Failed to load sessions.</p>
      {isDesktop ? (
        <p className="text-muted-foreground">Try quitting and reopening Ultrawork.</p>
      ) : (
        <p className="text-muted-foreground">
          Is the API running? Try <code className="text-brand">bun run serve</code>
        </p>
      )}
      <p className="max-w-lg truncate text-muted-foreground/70">{error.message}</p>
    </div>
  );
}
