import { TaskHandoff, TaskTimes, TaskTranscript } from "@/components/runs/task-transcript";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTaskDetail } from "@/hooks/use-runs";
import type { AgentFlowNode } from "@/lib/agent-tree";

export type NodeInspectorProps = {
  node: AgentFlowNode | null;
  runId: string | null;
};

export function NodeInspector(args: NodeInspectorProps) {
  const { node, runId } = args;
  const data = node?.data ?? null;
  const taskQuery = useTaskDetail(runId, data?.taskId ?? null);
  const detail = taskQuery.data;

  return (
    <section className="panel">
      <header className="panel-header flex items-center justify-between gap-2">
        <span>{data?.kind === "task" ? "Task" : "Planner"}</span>
        {data && <StatusBadge status={data.status} variant="pill" dot />}
      </header>

      {!data && (
        <p className="mt-2 text-sm text-muted-foreground">
          Select a node to inspect it.
        </p>
      )}

      {data && node && (
        <div className="panel-body text-sm">
          <div className="text-foreground">{data.fullLabel}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {data.taskId ?? node.id}
          </div>

          {data.kind === "task" && detail && (
            <div className="mt-1 text-xs text-muted-foreground">
              <TaskTimes task={detail.task} />
            </div>
          )}

          {data.kind === "agent" && data.unread > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              {data.unread} unread inbox item{data.unread === 1 ? "" : "s"}
            </div>
          )}

          <div className="divider-block">
            <div className="label-caption">Scope</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
              {data.scope}
            </div>
          </div>

          {data.kind === "task" && taskQuery.isLoading && (
            <p className="divider-block text-muted-foreground">Loading…</p>
          )}

          {data.kind === "task" && detail && detail.transcript.length > 0 && (
            <div className="divider-block">
              <div className="label-caption">Transcript</div>
              <TaskTranscript lines={detail.transcript} className="mt-1" />
            </div>
          )}

          {data.kind === "task" && detail?.handoff && <TaskHandoff handoff={detail.handoff} />}
        </div>
      )}
    </section>
  );
}
