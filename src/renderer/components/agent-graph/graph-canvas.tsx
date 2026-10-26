import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useRef } from "react";

import "@xyflow/react/dist/style.css";

import { nodeTypes } from "@/components/agent-graph/graph-node";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import type { AgentFlowNode } from "@/lib/agent-tree";
import { statusIntent } from "@/lib/status";

const FIT_OPTIONS = { padding: 0.15, maxZoom: 1, duration: 300 };

const MINIMAP_COLOR: Record<string, string> = {
  active: "var(--status-active)",
  waiting: "var(--status-waiting)",
  success: "var(--status-success)",
  danger: "var(--status-danger)",
  idle: "var(--status-idle)",
};

export type GraphCanvasProps = {
  nodes: AgentFlowNode[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (node: AgentFlowNode | null) => void;

  fitKey: string;
};

function Canvas(args: GraphCanvasProps) {
  const { nodes, edges, selectedId, onSelect, fitKey } = args;
  const { fitView } = useReactFlow();
  const theme = useResolvedTheme();

  const userMoved = useRef(false);
  const nodeCount = nodes.length;

  useEffect(() => {
    userMoved.current = false;
    void fitView(FIT_OPTIONS);
  }, [fitKey, fitView]);

  useEffect(() => {
    if (!userMoved.current) void fitView(FIT_OPTIONS);
  }, [nodeCount, fitView]);

  const decorated = nodes.map((node) =>
    node.id === selectedId ? { ...node, selected: true } : node,
  );

  return (
    <ReactFlow
      nodes={decorated}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={theme}
      fitView
      fitViewOptions={FIT_OPTIONS}
      minZoom={0.15}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => onSelect(node as AgentFlowNode)}
      onPaneClick={() => onSelect(null)}
      onMoveStart={(event) => {
        if (event) userMoved.current = true;
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls
        showInteractive={false}
        onFitView={() => {
          userMoved.current = false;
        }}
      />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={0}
        nodeColor={(node: Node) =>
          MINIMAP_COLOR[statusIntent(String(node.data?.status ?? "idle"))]!
        }
      />
    </ReactFlow>
  );
}

export function GraphCanvas(args: GraphCanvasProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ReactFlowProvider>
        <Canvas {...args} />
      </ReactFlowProvider>
    </div>
  );
}
