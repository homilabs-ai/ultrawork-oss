import { ArtifactMarkdown, ArtifactText } from "@/components/artifacts/artifact-reference";
import { formatTime } from "@/lib/format";
import type { TaskDetail } from "@/types/runs";

export function TaskTimes({ task }: { task: TaskDetail["task"] }) {
  return (
    <>
      claimed {formatTime(task.claimedAt)} · finished {formatTime(task.finishedAt)}
    </>
  );
}

export function TaskTranscript({ lines, className = "mt-2" }: { lines: TaskDetail["transcript"]; className?: string }) {
  return (
    <ul className={`${className} space-y-0.5`}>
      {lines.map((line) => (
        <li key={line.id} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground">{formatTime(line.timestamp)}</span>
          <span className="min-w-0 truncate">
            <ArtifactText>{line.message}</ArtifactText>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TaskHandoff({ handoff }: { handoff: string }) {
  return (
    <div className="divider-block">
      <div className="label-caption">Handoff</div>
      <div className="mt-1">
        <ArtifactMarkdown>{handoff}</ArtifactMarkdown>
      </div>
    </div>
  );
}
