import { Files } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VerifierBadge } from "@/components/runs/verifier-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RunTask } from "@/types/runs";

export type TaskPannelProps = {
  tasks: RunTask[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  artifactCount: number;
  onOpenArtifacts: () => void;
};

export function TaskPannel(args: TaskPannelProps) {
  const { tasks, selectedTaskId, onSelectTask, artifactCount, onOpenArtifacts } = args;

  return (
    <section className="panel">
      <header className="panel-header flex items-center justify-between gap-2 border-b pb-3">
        <span>Tasks</span>
        <Button variant="ghost" size="xs" onClick={onOpenArtifacts}>
          <Files />
          {artifactCount}
        </Button>
      </header>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="panel-body">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onSelectTask(task.id)}
                data-selected={task.id === selectedTaskId}
                className="row-select"
              >
                <StatusBadge status={task.status} />
                <span className="fill-truncate">{task.title}</span>
                <VerifierBadge task={task} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
