export type RunStatus = "running" | "idle";
export type AgentRole = "root" | "planner";
export type AgentStatus = "idle" | "active" | "done" | "failed" | "cancelled";
export type TaskStatus = "pending" | "claimed" | "running" | "done" | "failed" | "cancelled";
export type TaskType = "worker" | "verifier";
export type TaskVerdict = "CLEAN" | "NEEDS_WORK";
export type InboxKind = "scope" | "handoff";
export type InboxStatus = "unread" | "read";
