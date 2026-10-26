import { Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ViewSwitch } from "@/components/ui/view-switch";

export type HeaderProps = {
  runId: string;
  title: string;
  canStop: boolean;
  stopping: boolean;
  onStop: () => void;
};

export function Header(args: HeaderProps) {
  const { runId, title, canStop, stopping, onStop } = args;

  return (
    <header className="run-header window-drag flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-card px-5">
      <div className="flex min-w-0 items-center text-base leading-none tracking-[-0.01em] text-muted-foreground">
        <span className="shrink-0">Workspace</span>
        <span className="mx-2.5 shrink-0 text-border">/</span>
        <span className="truncate font-medium text-foreground">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canStop ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={stopping}
            onClick={onStop}
          >
            <Square />
            {stopping ? "Stopping..." : "Stop"}
          </Button>
        ) : null}
        <ViewSwitch runId={runId} />
      </div>
    </header>
  );
}
