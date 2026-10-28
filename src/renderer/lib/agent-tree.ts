import type { Edge, Node } from "@xyflow/react";
import { hierarchy, tree } from "d3-hierarchy";

import { STATUS_TEXT, statusIntent } from "@/lib/status";
import type { AgentRole, RunAgent, RunTask } from "@/types/runs";

export type AgentNodeData = {
  kind: "agent" | "task";

  label: string;

  fullLabel: string;

  sublabel: string;
  status: string;
  role: AgentRole | null;
  scope: string;

  taskId: string | null;
  unread: number;
};

export type AgentFlowNode = Node<AgentNodeData, "agent" | "task">;

export type TreeNode = AgentNodeData & {
  id: string;
  children: TreeNode[];
};

export const NODE_W = 260;
export const NODE_H = 48;
const ROW_GAP = 14;
const COL_GAP = 76;

const TITLE_SEPARATORS = new Set([" ", "—", "–", "-", ",", ":", "·", "("]);
const MIN_SHARED_PREFIX = 12;

export function dropSharedPrefix(titles: string[]): string[] {
  if (titles.length < 2) return titles;

  const [first, ...rest] = titles as [string, ...string[]];
  let end = first.length;
  for (const title of rest) {
    end = Math.min(end, title.length);
    let i = 0;
    while (i < end && title[i] === first[i]) i++;
    end = i;
    if (end < MIN_SHARED_PREFIX) return titles;
  }

  while (end > 0 && !TITLE_SEPARATORS.has(first[end - 1]!)) end--;
  if (end < MIN_SHARED_PREFIX) return titles;

  const stripped = titles.map((t) =>
    t
      .slice(end)
      .replace(/^[\s—–\-,:·]+/, "")
      .trim(),
  );

  return stripped.some((t) => t.length === 0) ? titles : stripped;
}

function trimSiblingLabels(siblings: TreeNode[]): void {
  for (const kind of ["agent", "task"] as const) {
    const group = siblings.filter((n) => n.kind === kind);
    if (group.length > 1) {
      const labels = dropSharedPrefix(group.map((n) => n.fullLabel));
      group.forEach((node, i) => {
        node.label = labels[i]!;
      });
    }
  }
  for (const node of siblings) trimSiblingLabels(node.children);
}

function headline(md: string, fallback: string): string {
  const line = md.split("\n").find((l) => l.trim().length > 0);
  if (!line) return fallback;
  return line.replace(/^[#>\-*\s]+/, "").trim() || fallback;
}

function agentLabel(role: AgentRole): string {
  return role === "root" ? "Root planner" : "Sub-planner";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function buildAgentTree(args: {
  agents: RunAgent[];
  tasks: RunTask[];
  rootAgentId?: string | null;
}): TreeNode[] {
  const { agents, tasks, rootAgentId } = args;

  const ordered = [...tasks].sort((a, b) => a.createdAt - b.createdAt);

  const tasksByRequester = new Map<string, TreeNode[]>();
  for (const task of ordered) {
    const label = task.title || headline(task.scope, "Untitled task");
    const node: TreeNode = {
      id: `task:${task.id}`,
      kind: "task",
      label,
      fullLabel: label,

      sublabel: `${task.status} · ${task.id.slice(0, 8)}`,
      status: task.status,
      role: null,
      scope: task.scope,
      taskId: task.id,
      unread: 0,
      children: [],
    };
    const bucket = tasksByRequester.get(task.requesterAgentId);
    if (bucket) bucket.push(node);
    else tasksByRequester.set(task.requesterAgentId, [node]);
  }

  const nodes = new Map<string, TreeNode>();
  for (const agent of agents) {
    const label = headline(agent.scope, agentLabel(agent.role));
    nodes.set(agent.id, {
      id: agent.id,
      kind: "agent",
      label,
      fullLabel: label,
      sublabel: "",
      status: agent.status,
      role: agent.role,
      scope: agent.scope,
      taskId: null,
      unread: agent.unread,
      children: [],
    });
  }

  const roots: TreeNode[] = [];
  for (const agent of agents) {
    const node = nodes.get(agent.id)!;
    const parent = agent.parent ? nodes.get(agent.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  for (const agent of agents) {
    const node = nodes.get(agent.id)!;
    const own = tasksByRequester.get(agent.id) ?? [];
    const subplanners = node.children.length;
    node.children.push(...own);
    node.sublabel = [
      agentLabel(agent.role),
      subplanners > 0 ? plural(subplanners, "sub-planner") : null,
      own.length > 0 ? plural(own.length, "task") : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  for (const [agentId, bucket] of tasksByRequester) {
    if (!nodes.has(agentId)) roots.push(...bucket);
  }

  roots.sort((a, b) => {
    if (a.id === rootAgentId) return -1;
    if (b.id === rootAgentId) return 1;
    return 0;
  });

  trimSiblingLabels(roots);
  return roots;
}

export function toFlow(roots: TreeNode[]): {
  nodes: AgentFlowNode[];
  edges: Edge[];
} {
  if (roots.length === 0) return { nodes: [], edges: [] };

  const virtualRoot: TreeNode = {
    id: "__virtual__",
    kind: "agent",
    label: "",
    fullLabel: "",
    sublabel: "",
    status: "idle",
    role: null,
    scope: "",
    taskId: null,
    unread: 0,
    children: roots,
  };

  const layout = tree<TreeNode>()
    .nodeSize([NODE_H + ROW_GAP, NODE_W + COL_GAP])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));

  const laidOut = layout(hierarchy(virtualRoot, (d) => d.children));
  const descendants = laidOut.descendants().slice(1);

  const nodes: AgentFlowNode[] = descendants.map((d) => ({
    id: d.data.id,
    type: d.data.kind,

    position: { x: d.y - (NODE_W + COL_GAP), y: d.x },
    data: d.data,
    width: NODE_W,
    height: NODE_H,
    draggable: false,
    connectable: false,
  }));

  const edges: Edge[] = [];
  for (const d of descendants) {
    if (!d.parent || d.parent.data.id === virtualRoot.id) continue;
    edges.push({
      id: `${d.parent.data.id}->${d.data.id}`,
      source: d.parent.data.id,
      target: d.data.id,
      type: "smoothstep",

      className: STATUS_TEXT[statusIntent(d.data.status)],
      style: { stroke: "currentColor", strokeWidth: 1.5, opacity: 0.55 },
    });
  }

  return { nodes, edges };
}
