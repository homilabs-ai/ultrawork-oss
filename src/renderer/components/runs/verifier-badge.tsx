import { cn } from "@/lib/utils";
import type { RunTask } from "@/types/runs";

const VERDICT = {
  CLEAN: { label: "Verified", className: "text-status-success" },
  NEEDS_WORK: { label: "Needs work", className: "text-status-waiting" },
  pending: { label: "Verifier", className: "text-muted-foreground" },
} as const;

export function VerifierBadge({ task, className }: { task: Pick<RunTask, "type" | "verdict">; className?: string }) {
  if (task.type !== "verifier") return null;
  const v = VERDICT[task.verdict ?? "pending"];
  return (
    <span
      className={cn(
        "shrink-0 rounded-md border border-current/30 bg-current/10 px-1.5 py-0.5 text-[11px] leading-none",
        v.className,
        className,
      )}
    >
      {v.label}
    </span>
  );
}
