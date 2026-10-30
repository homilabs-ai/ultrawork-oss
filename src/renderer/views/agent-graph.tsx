import { getRouteApi } from "@tanstack/react-router";
import { GraphCanvas } from "@/components/agent-graph/graph-canvas";
import { NodeInspector } from "@/components/agent-graph/node-inspector";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { useArtifacts, useRunState } from "@/hooks/use-runs";
import { buildAgentTree, toFlow } from "@/lib/agent-tree";

const route = getRouteApi("/runs/$runId/graph");

export function AgentGraphPanels() {
  const { runId } = route.useParams();
  const { node: selectedNodeId, artifact: selectedArtifactPath } = route.useSearch();
  const navigate = route.useNavigate();

  const stateQuery = useRunState(runId);
  const artifactsQuery = useArtifacts();
  const state = stateQuery.data;
  const artifacts = artifactsQuery.data?.artifacts ?? [];
  const selectedArtifact = artifacts.find((artifact) => artifact.path === selectedArtifactPath) ?? null;

  const graph = toFlow(
    buildAgentTree({
      agents: state?.agents ?? [],
      tasks: state?.tasks ?? [],
      rootAgentId: state?.run.root_agent_id ?? null,
    }),
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div className="graph-layout flex min-h-0 flex-1 bg-card">
      <div className="relative min-h-0 min-w-0 flex-1">
        {graph.nodes.length === 0 ? (
          <div className="center-note h-full text-muted-foreground">
            {stateQuery.isLoading ? "Loading run state…" : "No agents spawned yet."}
          </div>
        ) : (
          <GraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            selectedId={selectedNodeId ?? null}
            onSelect={(node) =>
              navigate({
                search: (previous) => ({ ...previous, node: node?.id }),
                replace: true,
              })
            }
            fitKey={runId}
          />
        )}
        {selectedNode ? (
          <div className="absolute right-3 top-3 z-10 h-[min(32rem,calc(100%-1.5rem))] w-72">
            <NodeInspector node={selectedNode} runId={runId} />
          </div>
        ) : null}
      </div>
      <div className="graph-rail min-h-0 w-[34rem] shrink-0">
        <ArtifactPanel
          artifacts={artifacts}
          selected={selectedArtifact}
          truncated={artifactsQuery.data?.truncated ?? false}
          loading={artifactsQuery.isLoading}
          error={artifactsQuery.error}
          onSelect={(artifact) =>
            navigate({
              search: (previous) => ({ ...previous, artifact: artifact?.path }),
              replace: true,
            })
          }
        />
      </div>
    </div>
  );
}
