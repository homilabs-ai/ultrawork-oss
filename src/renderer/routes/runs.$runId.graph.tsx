import { createFileRoute } from "@tanstack/react-router";

import { AgentGraphPanels } from "@/views/agent-graph";

export type AgentGraphSearch = {
  node?: string;
  artifact?: string;
  files?: boolean;
};

export const Route = createFileRoute("/runs/$runId/graph")({
  validateSearch: (search: Record<string, unknown>): AgentGraphSearch => ({
    node: typeof search.node === "string" ? search.node : undefined,
    artifact:
      typeof search.artifact === "string" ? search.artifact : undefined,
    files: search.files === true || search.files === "true" || undefined,
  }),
  component: AgentGraphPanels,
});
