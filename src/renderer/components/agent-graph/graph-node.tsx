import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Crown, GitBranch, Hammer } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import type { AgentFlowNode } from "@/lib/agent-tree";
import { STATUS_TEXT, statusIntent } from "@/lib/status";
import { cn } from "@/lib/utils";

const HIDDEN_HANDLE = { opacity: 0, pointerEvents: "none" } as const;

export function GraphNodeCard({ data, selected }: NodeProps<AgentFlowNode>) {
  const intent = statusIntent(data.status);
  const isTask = data.kind === "task";
  const Icon = isTask ? Hammer : data.role === "root" ? Crown : GitBranch;

  return (
    <div
      title={data.fullLabel}
      className={cn(
        "flex h-full w-full items-center gap-2 rounded-lg border bg-card px-2 text-left shadow-panel transition-shadow",
        "hover:shadow-raised",
        isTask && "rounded-md border-dashed",
        selected && "shadow-raised ring-2 ring-current",
        STATUS_TEXT[intent],
      )}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} isConnectable={false} />

      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-3.5" />
        {intent === "active" && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-40" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground">{data.label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{data.sublabel}</span>
      </span>

      {data.unread > 0 && (
        <span className="shrink-0 rounded-full border border-current/30 bg-current/10 px-1.5 text-[10px] leading-4">
          {data.unread}
        </span>
      )}
      <StatusBadge status={data.status} dot label={false} />

      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} isConnectable={false} />
    </div>
  );
}
