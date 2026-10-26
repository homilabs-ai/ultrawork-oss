import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Workflow } from "lucide-react";

const LINK_CLASS =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground";

const ACTIVE_CLASS = "bg-card text-foreground shadow-panel";

export function ViewSwitch({ runId }: { runId: string }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      <Link
        to="/runs/$runId/graph"
        params={{ runId }}
        activeProps={{ className: ACTIVE_CLASS }}
        className={LINK_CLASS}
        aria-label="Agent Graph (experimental)"
        title="Agent Graph (experimental)"
      >
        <Workflow className="size-3.5" />
        <span>Graph</span>
      </Link>
      <Link
        to="/runs/$runId"
        params={{ runId }}
        activeOptions={{ exact: true }}
        activeProps={{ className: ACTIVE_CLASS }}
        className={LINK_CLASS}
        aria-label="Goals"
        title="Goals"
      >
        <LayoutDashboard className="size-3.5" />
        <span>Goals</span>
      </Link>
    </div>
  );
}
