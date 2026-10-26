import type { agents, events, inbox, runs, tasks } from "./schema.ts";

export type {
  AgentRole,
  AgentStatus,
  InboxKind,
  InboxStatus,
  RunStatus,
  TaskStatus,
  TaskType,
  TaskVerdict,
} from "./enums.ts";

export type RunRow = typeof runs.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type InboxRow = typeof inbox.$inferSelect;
export type EventRow = typeof events.$inferSelect;
