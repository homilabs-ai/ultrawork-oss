import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ThinkingLevel } from "../config.ts";
import type {
  AgentRole,
  AgentStatus,
  InboxKind,
  InboxStatus,
  RunStatus,
  TaskStatus,
  TaskType,
  TaskVerdict,
} from "./enums.ts";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  instruction_md: text("instruction_md").notNull(),
  status: text("status").$type<RunStatus>().notNull().default("running"),
  root_agent_id: text("root_agent_id"),
  planner_model: text("planner_model"),
  worker_model: text("worker_model"),
  thinking_level: text("thinking_level").$type<ThinkingLevel>(),
  worker_thinking_level: text("worker_thinking_level").$type<ThinkingLevel>(),
  verifier_plugin: integer("verifier_plugin", { mode: "boolean" }),
  created_at: integer("created_at").notNull(),
  stopped_at: integer("stopped_at"),
});

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    role: text("role").$type<AgentRole>().notNull(),
    parent_agent_id: text("parent_agent_id"),
    scope_md: text("scope_md").notNull(),
    depth: integer("depth").notNull().default(0),
    status: text("status").$type<AgentStatus>().notNull().default("idle"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [index("idx_agents_run").on(t.run_id, t.status)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    requester_agent_id: text("requester_agent_id").notNull(),
    title: text("title").notNull().default(""),
    scope_md: text("scope_md").notNull(),
    type: text("type").$type<TaskType>().notNull().default("worker"),
    verdict: text("verdict").$type<TaskVerdict>(),
    status: text("status").$type<TaskStatus>().notNull().default("pending"),
    depth: integer("depth").notNull().default(1),
    created_at: integer("created_at").notNull(),
    claimed_at: integer("claimed_at"),
    finished_at: integer("finished_at"),
  },
  (t) => [index("idx_tasks_status").on(t.run_id, t.status)],
);

export const inbox = sqliteTable(
  "inbox",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    agent_id: text("agent_id").notNull(),
    kind: text("kind").$type<InboxKind>().notNull(),
    ref_id: text("ref_id"),
    content_md: text("content_md").notNull(),
    status: text("status").$type<InboxStatus>().notNull().default("unread"),
    created_at: integer("created_at").notNull(),
  },
  (t) => [index("idx_inbox_agent").on(t.agent_id, t.status)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    agent_id: text("agent_id"),
    task_id: text("task_id"),
    type: text("type").notNull(),
    payload_json: text("payload_json").notNull().default("{}"),
    ts: integer("ts").notNull(),
  },
  (t) => [index("idx_events_run").on(t.run_id, t.ts)],
);

export const schema = { runs, agents, tasks, inbox, events };
