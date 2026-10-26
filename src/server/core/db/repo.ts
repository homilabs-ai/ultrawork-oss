import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { ThinkingLevel } from "../config.ts";
import type { DB } from "./db.ts";
import { agents, events, inbox, runs, tasks } from "./schema.ts";
import type {
  AgentRole,
  AgentRow,
  AgentStatus,
  EventRow,
  InboxKind,
  InboxRow,
  RunRow,
  RunStatus,
  TaskRow,
  TaskStatus,
  TaskType,
  TaskVerdict,
} from "./types.ts";

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export interface RunModels {
  planner?: string;
  worker?: string;
  plannerEffort?: ThinkingLevel;
  workerEffort?: ThinkingLevel;
  verifier?: boolean;
}

export class Repo {
  constructor(private db: DB) {}

  createRun(instructionMd: string, models: RunModels = {}): RunRow {
    return this.db
      .insert(runs)
      .values({
        id: uid(),
        instruction_md: instructionMd,
        status: "running",
        planner_model: models.planner ?? null,
        worker_model: models.worker ?? null,
        thinking_level: models.plannerEffort ?? null,
        worker_thinking_level: models.workerEffort ?? null,
        verifier_plugin: models.verifier ?? null,
        created_at: now(),
      })
      .returning()
      .get();
  }

  getRun(id: string): RunRow | null {
    return this.db.select().from(runs).where(eq(runs.id, id)).get() ?? null;
  }

  setRunStatus(id: string, status: RunStatus): void {
    this.db.update(runs).set({ status, stopped_at: null }).where(eq(runs.id, id)).run();
  }

  interruptRun(id: string): {
    cancelledAgents: number;
    cancelledTasks: number;
  } {
    const ts = now();
    return this.db.transaction((tx) => {
      tx.update(runs).set({ status: "idle", stopped_at: null }).where(eq(runs.id, id)).run();
      const cancelledSubplanners = tx
        .update(agents)
        .set({ status: "cancelled", updated_at: ts })
        .where(
          and(
            eq(agents.run_id, id),
            sql`${agents.parent_agent_id} IS NOT NULL`,
            inArray(agents.status, ["idle", "active"]),
          ),
        )
        .returning({ id: agents.id })
        .all().length;
      const resetRootPlanners = tx
        .update(agents)
        .set({ status: "idle", updated_at: ts })
        .where(
          and(
            eq(agents.run_id, id),
            sql`${agents.parent_agent_id} IS NULL`,
            inArray(agents.status, ["active", "done", "cancelled"]),
          ),
        )
        .returning({ id: agents.id })
        .all().length;
      const cancelledTasks = tx
        .update(tasks)
        .set({ status: "cancelled", finished_at: ts })
        .where(and(eq(tasks.run_id, id), inArray(tasks.status, ["pending", "claimed", "running"])))
        .returning({ id: tasks.id })
        .all().length;
      return {
        cancelledAgents: cancelledSubplanners + resetRootPlanners,
        cancelledTasks,
      };
    });
  }

  setRootAgent(runId: string, agentId: string): void {
    this.db.update(runs).set({ root_agent_id: agentId }).where(eq(runs.id, runId)).run();
  }

  listRuns(limit = 50): RunRow[] {
    return this.db.select().from(runs).orderBy(desc(runs.created_at)).limit(limit).all();
  }

  createAgent(args: {
    runId: string;
    role: AgentRole;
    parentAgentId: string | null;
    scopeMd: string;
    depth: number;
  }): AgentRow {
    const ts = now();
    return this.db
      .insert(agents)
      .values({
        id: uid(),
        run_id: args.runId,
        role: args.role,
        parent_agent_id: args.parentAgentId,
        scope_md: args.scopeMd,
        depth: args.depth,
        status: "idle",
        created_at: ts,
        updated_at: ts,
      })
      .returning()
      .get();
  }

  getAgent(id: string): AgentRow | null {
    return this.db.select().from(agents).where(eq(agents.id, id)).get() ?? null;
  }

  setAgentStatus(id: string, status: AgentStatus): void {
    this.db.update(agents).set({ status, updated_at: now() }).where(eq(agents.id, id)).run();
  }

  listAgents(runId: string): AgentRow[] {
    return this.db.select().from(agents).where(eq(agents.run_id, runId)).orderBy(asc(agents.created_at)).all();
  }

  enqueueTask(args: {
    runId: string;
    requesterAgentId: string;
    title: string;
    scopeMd: string;
    depth: number;
    type?: TaskType;
  }): TaskRow {
    return this.db
      .insert(tasks)
      .values({
        id: uid(),
        run_id: args.runId,
        requester_agent_id: args.requesterAgentId,
        title: args.title,
        scope_md: args.scopeMd,
        type: args.type ?? "worker",
        status: "pending",
        depth: args.depth,
        created_at: now(),
      })
      .returning()
      .get();
  }

  listTasks(runId: string): TaskRow[] {
    return this.db.select().from(tasks).where(eq(tasks.run_id, runId)).orderBy(asc(tasks.created_at)).all();
  }

  claimNextTask(runId: string, maxDepth: number): TaskRow | null {
    const row = this.db
      .update(tasks)
      .set({ status: "claimed", claimed_at: now() })
      .where(
        sql`${tasks.id} = (
          SELECT id FROM tasks
          WHERE run_id = ${runId} AND status = 'pending' AND depth <= ${maxDepth}
          ORDER BY created_at ASC LIMIT 1
        )`,
      )
      .returning()
      .get();
    return row ?? null;
  }

  setTaskStatus(id: string, status: TaskStatus): void {
    const finishedAt = status === "done" || status === "failed" || status === "cancelled" ? now() : null;
    this.db.update(tasks).set({ status, finished_at: finishedAt }).where(eq(tasks.id, id)).run();
  }

  setTaskVerdict(id: string, verdict: TaskVerdict): void {
    this.db.update(tasks).set({ verdict }).where(eq(tasks.id, id)).run();
  }

  countTasks(runId: string, statuses: TaskStatus[]): number {
    if (statuses.length === 0) return 0;
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.run_id, runId), inArray(tasks.status, statuses)))
      .get();
    return row?.n ?? 0;
  }

  resetInflightTasks(runId: string): number {
    const rows = this.db
      .update(tasks)
      .set({ status: "pending", claimed_at: null })
      .where(and(eq(tasks.run_id, runId), inArray(tasks.status, ["claimed", "running"])))
      .returning({ id: tasks.id })
      .all();
    return rows.length;
  }

  pushInbox(args: {
    runId: string;
    agentId: string;
    kind: InboxKind;
    refId: string | null;
    contentMd: string;
  }): InboxRow {
    return this.db
      .insert(inbox)
      .values({
        id: uid(),
        run_id: args.runId,
        agent_id: args.agentId,
        kind: args.kind,
        ref_id: args.refId,
        content_md: args.contentMd,
        status: "unread",
        created_at: now(),
      })
      .returning()
      .get();
  }

  drainInbox(agentId: string): InboxRow[] {
    const items = this.db
      .select()
      .from(inbox)
      .where(and(eq(inbox.agent_id, agentId), eq(inbox.status, "unread")))
      .orderBy(asc(inbox.created_at))
      .all();
    if (items.length > 0) {
      this.db
        .update(inbox)
        .set({ status: "read" })
        .where(and(eq(inbox.agent_id, agentId), eq(inbox.status, "unread")))
        .run();
    }
    return items;
  }

  requeueInbox(ids: string[]): void {
    if (ids.length === 0) return;
    this.db.update(inbox).set({ status: "unread" }).where(inArray(inbox.id, ids)).run();
  }

  countUnread(agentId: string): number {
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(inbox)
      .where(and(eq(inbox.agent_id, agentId), eq(inbox.status, "unread")))
      .get();
    return row?.n ?? 0;
  }

  logEvent(args: {
    runId: string;
    agentId?: string | null;
    taskId?: string | null;
    type: string;
    payload?: unknown;
  }): void {
    this.db
      .insert(events)
      .values({
        id: uid(),
        run_id: args.runId,
        agent_id: args.agentId ?? null,
        task_id: args.taskId ?? null,
        type: args.type,
        payload_json: JSON.stringify(args.payload ?? {}),
        ts: now(),
      })
      .run();
  }

  listEvents(runId: string, limit = 200): EventRow[] {
    return this.db.select().from(events).where(eq(events.run_id, runId)).orderBy(desc(events.ts)).limit(limit).all();
  }

  listAgentEvents(runId: string, agentId: string, limit = 200): EventRow[] {
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.run_id, runId), eq(events.agent_id, agentId)))
      .orderBy(desc(events.ts))
      .limit(limit)
      .all();
  }

  listTaskEvents(runId: string, taskId: string, limit = 200): EventRow[] {
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.run_id, runId), eq(events.task_id, taskId)))
      .orderBy(desc(events.ts))
      .limit(limit)
      .all();
  }

  countEventsByType(runId: string, types: string[], opts?: { agentId?: string; taskId?: string }): number {
    if (types.length === 0) return 0;
    const filters = [eq(events.run_id, runId), inArray(events.type, types)];
    if (opts?.agentId) filters.push(eq(events.agent_id, opts.agentId));
    if (opts?.taskId) filters.push(eq(events.task_id, opts.taskId));
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(events)
      .where(and(...filters))
      .get();
    return row?.n ?? 0;
  }

  getTask(id: string): TaskRow | null {
    return this.db.select().from(tasks).where(eq(tasks.id, id)).get() ?? null;
  }

  getInboxByRef(runId: string, refId: string): InboxRow | null {
    return (
      this.db
        .select()
        .from(inbox)
        .where(and(eq(inbox.run_id, runId), eq(inbox.ref_id, refId)))
        .orderBy(desc(inbox.created_at))
        .get() ?? null
    );
  }
}
