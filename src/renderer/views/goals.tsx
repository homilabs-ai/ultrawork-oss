import { getRouteApi } from "@tanstack/react-router";

import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { ActiveWorker } from "@/components/runs/active-worker";
import { ChatColumn } from "@/components/runs/chat-column";
import { PlannerStatus } from "@/components/runs/planner-status";
import { SteerInput } from "@/components/runs/steer-input";
import { TaskPannel } from "@/components/runs/task-pannel";
import { useArtifacts, useRunState, useTaskDetail } from "@/hooks/use-runs";
import { cn } from "@/lib/utils";
import type { ArtifactFile } from "@/types/runs";

const route = getRouteApi("/runs/$runId/");

export function GoalsPanels() {
  const { runId } = route.useParams();
  const { task: selectedTaskId, artifact: selectedArtifactPath, files: filesOpen } = route.useSearch();
  const navigate = route.useNavigate();

  const stateQuery = useRunState(runId);
  const taskQuery = useTaskDetail(runId, selectedTaskId ?? null);
  const artifactsQuery = useArtifacts();

  const state = stateQuery.data;
  const artifacts = artifactsQuery.data?.artifacts ?? [];
  const selectedArtifact = artifacts.find((artifact) => artifact.path === selectedArtifactPath) ?? null;

  const selectTask = (taskId: string | null) =>
    navigate({
      search: (previous) => ({
        ...previous,
        task: taskId ?? undefined,
      }),
      replace: true,
    });
  const openArtifact = (artifact: ArtifactFile | null) =>
    navigate({
      search: (previous) => ({
        ...previous,
        files: true,
        artifact: artifact?.path,
      }),
      replace: true,
    });
  const closeArtifacts = () =>
    navigate({
      search: (previous) => ({
        ...previous,
        files: undefined,
        artifact: undefined,
      }),
      replace: true,
    });

  if (stateQuery.isLoading) {
    return <div className="center-note text-muted-foreground">Loading run state…</div>;
  }

  if (!state) return null;

  const { done, failed, cancelled } = state.stats.taskCounts;
  const finished = done + failed + cancelled;
  const running = state.run.status === "running";

  return (
    <div className="run-control-layout flex min-h-0 w-full flex-1 flex-col gap-2 bg-background/70 p-3">
      <div className="surface shrink-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
          <span className="text-brand">Goals</span>
          <span className="text-xs text-muted-foreground">
            Agent {state.stats.agentCount} · Task {finished}/{state.tasks.length} · Turns {state.stats.turnCount}
          </span>
        </div>
        <div
          data-running={running}
          className={cn(
            "flex items-center gap-3 px-4 py-2 text-xs",
            running ? "text-status-active" : "text-status-idle",
          )}
        >
          <span className="goal-progress-dot" aria-hidden="true" />
          <span className="tracking-wide">{running ? "WORKING" : "IDLE"}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="goal-progress-bar"
              style={{
                width: `${state.tasks.length ? Math.max(4, (finished / state.tasks.length) * 100) : 4}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="run-primary flex min-h-0 flex-1 gap-3">
        <ChatColumn composer={<SteerInput runId={runId} />}>
          {selectedTaskId ? (
            <ActiveWorker
              detail={taskQuery.data}
              loading={taskQuery.isLoading}
              error={taskQuery.error}
              onBack={() => selectTask(null)}
            />
          ) : (
            <PlannerStatus run={state.run} rootPlanner={state.rootPlanner} />
          )}
        </ChatColumn>
        <div
          className={
            filesOpen || selectedArtifactPath
              ? "run-tasks min-h-0 w-[34rem] shrink-0"
              : "run-tasks min-h-0 w-80 shrink-0"
          }
        >
          {filesOpen || selectedArtifactPath ? (
            <ArtifactPanel
              artifacts={artifacts}
              selected={selectedArtifact}
              truncated={artifactsQuery.data?.truncated ?? false}
              loading={artifactsQuery.isLoading}
              error={artifactsQuery.error}
              onSelect={openArtifact}
              onClose={closeArtifacts}
            />
          ) : (
            <TaskPannel
              tasks={state.tasks}
              selectedTaskId={selectedTaskId ?? null}
              artifactCount={artifacts.length}
              onOpenArtifacts={() => openArtifact(null)}
              onSelectTask={(taskId) => selectTask(taskId === selectedTaskId ? null : taskId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
