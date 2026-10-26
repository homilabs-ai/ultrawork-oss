import { describe, expect, test } from "bun:test";

import { buildAgentTree, dropSharedPrefix, toFlow } from "./agent-tree";
import type {
  RunAgent,
  RunTask,
} from "@/types/runs";

function agent(
  id: string,
  parent: string | null,
  extra: Partial<RunAgent> = {},
): RunAgent {
  return {
    id,
    role: parent ? "planner" : "root",
    parent,
    depth: parent ? 1 : 0,
    status: "idle",
    scope: `scope for ${id}`,
    unread: 0,
    ...extra,
  };
}

function task(
  id: string,
  requesterAgentId: string,
  extra: Partial<RunTask> = {},
): RunTask {
  return {
    id,
    requesterAgentId,
    title: `title ${id}`,
    scope: `scope ${id}`,
    status: "done",
    type: "worker",
    verdict: null,
    depth: 1,
    createdAt: 0,
    claimedAt: null,
    finishedAt: null,
    ...extra,
  };
}

describe("dropSharedPrefix", () => {
  test("strips everything the titles share, up to where they diverge", () => {
    expect(
      dropSharedPrefix([
        "Q2 close — extract Northwind accounts",
        "Q2 close — extract Contoso accounts",
      ]),
    ).toEqual(["Northwind accounts", "Contoso accounts"]);
  });

  test("leaves titles alone when the shared prefix is short", () => {
    const titles = ["build the thing", "burn the thing"];
    expect(dropSharedPrefix(titles)).toEqual(titles);
  });
});

describe("buildAgentTree", () => {
  test("nests sub-planners and hangs tasks off their requester", () => {
    const roots = buildAgentTree({
      agents: [agent("root", null), agent("sub", "root")],
      tasks: [task("t1", "root"), task("t2", "sub")],
      rootAgentId: "root",
    });

    expect(roots).toHaveLength(1);
    const [rootNode] = roots;

    expect(rootNode!.children.map((c) => c.id)).toEqual(["sub", "task:t1"]);
    expect(rootNode!.children[0]!.children.map((c) => c.id)).toEqual([
      "task:t2",
    ]);
  });

  test("surfaces tasks whose requester is missing rather than dropping them", () => {
    const roots = buildAgentTree({
      agents: [agent("root", null)],
      tasks: [task("orphan", "vanished")],
      rootAgentId: "root",
    });

    expect(roots.map((r) => r.id)).toEqual(["root", "task:orphan"]);
  });

  test("trims prefixes per sibling group, not across the whole run", () => {
    const roots = buildAgentTree({
      agents: [agent("root", null), agent("a", "root"), agent("b", "root")],
      tasks: [
        task("a1", "a", { title: "Alpha ingest phase — collect statements" }),
        task("a2", "a", { title: "Alpha ingest phase — collect receipts" }),
        task("b1", "b", { title: "Beta reporting phase — draft summary" }),
        task("b2", "b", { title: "Beta reporting phase — draft appendix" }),
      ],
      rootAgentId: "root",
    });

    const [rootNode] = roots;
    const [subA, subB] = rootNode!.children;

    expect(subA!.children.map((c) => c.label)).toEqual([
      "statements",
      "receipts",
    ]);
    expect(subB!.children.map((c) => c.label)).toEqual(["summary", "appendix"]);
  });

  test("keeps the full title alongside the trimmed label", () => {
    const [rootNode] = buildAgentTree({
      agents: [agent("root", null)],
      tasks: [
        task("a", "root", { title: "Goal Alpha phase one — collect data" }),
        task("b", "root", { title: "Goal Alpha phase one — verify data" }),
      ],
      rootAgentId: "root",
    });

    const [first] = rootNode!.children;
    expect(first!.label).toBe("collect data");
    expect(first!.fullLabel).toBe("Goal Alpha phase one — collect data");
  });
});

describe("toFlow", () => {
  test("places depth on the x axis and drops the virtual root", () => {
    const { nodes, edges } = toFlow(
      buildAgentTree({
        agents: [agent("root", null), agent("sub", "root")],
        tasks: [task("t1", "sub")],
        rootAgentId: "root",
      }),
    );

    expect(nodes).toHaveLength(3);
    expect(nodes.some((n) => n.id === "__virtual__")).toBe(false);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("root")!.position.x).toBe(0);
    expect(byId.get("sub")!.position.x).toBeGreaterThan(0);
    expect(byId.get("task:t1")!.position.x).toBeGreaterThan(
      byId.get("sub")!.position.x,
    );

    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["root", "sub"],
      ["sub", "task:t1"],
    ]);
  });
});
