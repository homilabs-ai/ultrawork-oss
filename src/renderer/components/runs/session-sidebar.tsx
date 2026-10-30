import { Link } from "@tanstack/react-router";
import { Moon, Plus, Settings, Sun } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { formatRelativeTime } from "@/lib/format";
import { setTheme } from "@/lib/theme";
import type { RunStatus, RunSummary } from "@/types/runs";

const LIVE_STATUSES = new Set<RunStatus>(["running", "idle"]);

function SessionControls() {
  return (
    <Link
      to="/runs/new"
      className="inline-flex h-9 w-full items-center justify-start gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Plus className="size-4" />
      New session
    </Link>
  );
}

function WorkspaceNavigation() {
  return (
    <nav className="px-3 py-4">
      <SessionControls />
    </nav>
  );
}

function SidebarFooter() {
  const theme = useResolvedTheme();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return (
    <div className="mt-auto flex shrink-0 items-center justify-between border-t px-4 py-3 text-muted-foreground">
      <Link
        to="/settings/general"
        className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"
        aria-label="Settings"
      >
        <Settings className="size-4" />
      </Link>
      <button
        type="button"
        onClick={toggleTheme}
        className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"
        aria-label="Toggle color theme"
      >
        {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </button>
    </div>
  );
}

function SessionCard({ run, selected }: { run: RunSummary; selected: boolean }) {
  const { id, title, status, createdAt, stoppedAt } = run;

  return (
    <Link
      to="/runs/$runId"
      params={{ runId: id }}
      data-selected={selected}
      title={`${title}\n${id}`}
      className="row-select row-raised min-h-12 flex-wrap gap-x-2 gap-y-0.5 px-2.5 py-2"
    >
      <StatusBadge status={status} dot label={LIVE_STATUSES.has(status)} className="text-xs capitalize">
        {status === "running" ? "working" : "idle"}
      </StatusBadge>
      <span className="row-title text-sm">{title}</span>
      <span className="w-full pl-5 text-[11px] text-muted-foreground">
        {formatRelativeTime(stoppedAt ?? createdAt)}
      </span>
    </Link>
  );
}

export function SessionSidebar({ runs, selectedRunId }: { runs: RunSummary[]; selectedRunId: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sidebar-header flex h-14 shrink-0 items-center justify-between border-b px-5">
        <div className="flex items-center gap-2.5 font-semibold">
          <span className="grid size-6 place-items-center rounded-md bg-foreground text-[10px] tracking-tighter text-background">
            UW
          </span>
          Ultrawork
        </div>
      </div>
      <WorkspaceNavigation />
      <div className="min-h-0 flex-1 overflow-y-auto border-t px-3 pt-4">
        <div className="label-caption px-2.5 py-2">Recent</div>
        <div className="space-y-1">
          {runs.map((run) => (
            <SessionCard key={run.id} run={run} selected={selectedRunId === run.id} />
          ))}
        </div>
      </div>
      <SidebarFooter />
    </div>
  );
}
