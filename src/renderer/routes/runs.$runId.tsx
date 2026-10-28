import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Header } from "@/components/runs/header";
import { useRunState, useRunStream, useStopRun } from "@/hooks/use-runs";

export const Route = createFileRoute("/runs/$runId")({
  component: RunLayout,
});

function RunLayout() {
  const { runId } = Route.useParams();
  const stateQuery = useRunState(runId);
  const stopRun = useStopRun();
  useRunStream(runId);

  const state = stateQuery.data;

  return (
    <>
      <Header
        runId={runId}
        canStop={state?.run.status === "running"}
        stopping={stopRun.isPending}
        onStop={() => stopRun.mutate(runId)}
        title={
          state?.run.instruction_md
            .split("\n")
            .find((line) => line.trim().length > 0)
            ?.replace(/^#+\s*/, "")
            .trim()
            .slice(0, 80) || `Goal ${runId.slice(0, 8)}`
        }
      />

      {stateQuery.isError ? (
        <div className="panel center-note">
          <p className="text-destructive">Failed to load run state.</p>
          <p className="max-w-lg truncate text-muted-foreground/70">
            {stateQuery.error instanceof Error ? stateQuery.error.message : String(stateQuery.error)}
          </p>
        </div>
      ) : (
        <Outlet />
      )}
    </>
  );
}
