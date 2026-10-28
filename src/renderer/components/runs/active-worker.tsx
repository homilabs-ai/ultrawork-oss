import { ArrowLeftIcon } from "lucide-react";
import { TaskHandoff, TaskTimes, TaskTranscript } from "@/components/runs/task-transcript";
import { VerifierBadge } from "@/components/runs/verifier-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { TaskDetail } from "@/types/runs";

export type ActiveWorkerProps = {
  detail: TaskDetail | null | undefined;
  loading: boolean;
  error: Error | null;
  onBack: () => void;
};

export function ActiveWorker(args: ActiveWorkerProps) {
  const { detail, loading, error, onBack } = args;

  return (
    <section className="panel">
      <header className="panel-header flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Planner
        </button>
        <span aria-hidden="true" className="text-muted-foreground/50">
          /
        </span>
        <span>Active Worker</span>
      </header>

      {loading && <p className="mt-2 text-sm text-muted-foreground">Loading worker…</p>}

      {error && <p className="mt-2 text-sm text-destructive">Failed to load task: {error.message}</p>}

      {detail && (
        <div className="panel-body text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <StatusBadge status={detail.task.status} />
            <span className="fill-truncate">{detail.task.title}</span>
            <VerifierBadge task={detail.task} />
            <span className="shrink-0 text-muted-foreground">
              <TaskTimes task={detail.task} />
            </span>
          </div>

          <TaskTranscript lines={detail.transcript} />

          {detail.handoff && <TaskHandoff handoff={detail.handoff} />}
        </div>
      )}
    </section>
  );
}
