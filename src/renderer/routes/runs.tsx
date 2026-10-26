import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";

import { SessionSidebar } from "@/components/runs/session-sidebar";
import { useRuns } from "@/hooks/use-runs";

export const Route = createFileRoute("/runs")({
  component: RunsLayout,
});

function RunsLayout() {
  const runsQuery = useRuns();

  const { runId } = useParams({ strict: false });

  return (
    <div className="app-frame flex h-dvh overflow-hidden border bg-card shadow-2xl">
      <aside className="app-sidebar flex min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r bg-sidebar">
        <SessionSidebar
          runs={runsQuery.data ?? []}
          selectedRunId={runId ?? null}
        />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background/50">
        <Outlet />
      </main>
    </div>
  );
}
