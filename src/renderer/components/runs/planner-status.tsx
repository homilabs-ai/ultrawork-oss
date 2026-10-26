import { useEffect, useRef, useState } from "react";

import { ArtifactMarkdown, ArtifactText } from "@/components/artifacts/artifact-reference";
import { InlineChat } from "@/components/runs/inline-chat";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { PlannerTranscriptItem, RootPlannerState, Run } from "@/types/runs";

export type PlannerStatusProps = {
  run: Run;
  rootPlanner: RootPlannerState | null;
};

type Pane = "chat" | "transcript";

function GoalBrief({ run }: Readonly<{ run: Run }>) {
  return (
    <li className="border-l-2 border-brand/70 pl-2.5 text-sm">
      <div className="label-caption">Goal brief</div>
      <div className="mt-0.5 wrap-break-word">
        <ArtifactMarkdown>
          {run.instruction_md}
        </ArtifactMarkdown>
      </div>
    </li>
  );
}

function TranscriptLine({ item }: { item: PlannerTranscriptItem }) {
  if (item.kind === "steer") {
    return (
      <li className="border-l-2 border-brand/70 pl-2.5 text-sm">
        <div className="label-caption">Steer</div>
        <p className="mt-0.5 whitespace-pre-wrap wrap-break-word">
          <ArtifactText>
            {item.text}
          </ArtifactText>
        </p>
      </li>
    );
  }
  if (item.kind === "tool") {
    const label = item.toolName ?? "tool";

    return (
      <li
        className={cn(
          "truncate text-sm",
          item.isError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <HoverCard>
          <HoverCardTrigger delay={100} closeDelay={200}>
            <span className="font-medium">{label}</span>
            <span>: </span>
            <ArtifactText>
              {item.text}
            </ArtifactText>
            {item.result === undefined && !item.unresolved && (
              <span className="ml-1 opacity-60">…</span>
            )}
          </HoverCardTrigger>
          <HoverCardContent className="w-auto max-w-lg space-y-2 whitespace-normal break-words">
            <div className="font-medium">{label}</div>
            {item.args && (
              <div>
                <div className="label-caption">Args</div>
                <pre className="max-h-48 overflow-auto text-xs">
                  {item.args}
                </pre>
              </div>
            )}
            {item.result === undefined ? (
              <div className="text-xs text-muted-foreground">
                {item.unresolved ? "No result recorded" : "Running…"}
              </div>
            ) : (
              item.result && (
                <div>
                  <div className="label-caption">Result</div>
                  <pre className="max-h-48 overflow-auto text-xs">
                    {item.result}
                  </pre>
                </div>
              )
            )}
          </HoverCardContent>
        </HoverCard>
      </li>
    );
  }
  return (
    <li className="text-sm">
      <ArtifactMarkdown>
        {item.text}
      </ArtifactMarkdown>
    </li>
  );
}

function PaneSwitch({
  pane,
  onChange,
}: {
  pane: Pane;
  onChange: (pane: Pane) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {(
        [
          ["chat", "Chat"],
          ["transcript", "Transcript"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            pane === id
              ? "bg-card text-foreground shadow-panel"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PlannerStatus(args: PlannerStatusProps) {
  const { run, rootPlanner } = args;
  const [pane, setPane] = useState<Pane>("chat");
  const bodyRef = useRef<HTMLDivElement>(null);
  const tipId = rootPlanner?.transcript.at(-1)?.id;

  useEffect(() => {
    if (pane !== "transcript") return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tipId, pane]);

  if (!rootPlanner) {
    return (
      <section className="panel">
        <header className="panel-header flex items-center justify-between gap-2 text-muted-foreground">
          <span>Root planner</span>
          <PaneSwitch pane={pane} onChange={setPane} />
        </header>
        <p className="mt-2 text-sm text-muted-foreground">
          No root planner for this run.
        </p>
        {pane === "chat" ? (
          <InlineChat run={run} transcript={[]} />
        ) : (
          <ul className="mt-4">
            <GoalBrief run={run} />
          </ul>
        )}
      </section>
    );
  }

  const { status, turnCount, unread, transcript = [], lastError } = rootPlanner;

  return (
    <section className="panel">
      <header className="panel-header flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">root planner</span>
          <StatusBadge status={status} dot>
            {status === "active" ? "working" : "idle"}
          </StatusBadge>
          <span className="truncate text-muted-foreground">
            · turn {turnCount} ·{" "}
            <span className={cn(unread > 0 && "text-status-waiting")}>
              {unread} unread
            </span>
          </span>
        </div>
        <PaneSwitch pane={pane} onChange={setPane} />
      </header>

      {lastError && (
        <p className="mt-2 shrink-0 text-sm text-destructive">
          Error: {lastError}
        </p>
      )}

      {pane === "chat" ? (
        <InlineChat
          run={run}
          transcript={transcript}
          isAgentWorking={status === "active"}
        />
      ) : (
        <div ref={bodyRef} className="panel-body mt-3">
          <div className="label-caption">Full transcript</div>

          <ul className="mt-2 space-y-2">
            <GoalBrief run={run} />
            {transcript.map((item) => (
              <TranscriptLine key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
