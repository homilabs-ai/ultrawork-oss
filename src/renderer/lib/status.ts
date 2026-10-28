import type { LucideIcon } from "lucide-react";
import { Check, Circle, CircleX, Loader, Pause } from "lucide-react";
import type { AgentStatus, RunStatus, TaskStatus } from "@/types/runs";

export type StatusIntent = "active" | "waiting" | "success" | "danger" | "idle";

export const STATUS_INTENT = {
  running: "active",
  active: "active",
  claimed: "waiting",
  planning: "waiting",
  done: "success",
  failed: "danger",
  cancelled: "danger",
  pending: "idle",
  idle: "idle",
} satisfies Record<RunStatus | TaskStatus | AgentStatus | "planning", StatusIntent>;

export type KnownStatus = keyof typeof STATUS_INTENT;

export function statusIntent(status: string): StatusIntent {
  return STATUS_INTENT[status.toLowerCase() as KnownStatus] ?? "idle";
}

export const STATUS_TEXT: Record<StatusIntent, string> = {
  active: "text-status-active",
  waiting: "text-status-waiting",
  success: "text-status-success",
  danger: "text-status-danger",
  idle: "text-status-idle",
};

export const STATUS_ICON: Record<StatusIntent, LucideIcon> = {
  active: Loader,
  waiting: Pause,
  success: Check,
  danger: CircleX,
  idle: Circle,
};
