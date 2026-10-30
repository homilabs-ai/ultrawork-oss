import { createFileRoute } from "@tanstack/react-router";

import { GoalsPanels } from "@/views/goals";

export type RunSearch = {
  task?: string;
  artifact?: string;
  files?: boolean;
};

export const Route = createFileRoute("/runs/$runId/")({
  validateSearch: (search: Record<string, unknown>): RunSearch => ({
    task: typeof search.task === "string" ? search.task : undefined,
    artifact: typeof search.artifact === "string" ? search.artifact : undefined,
    files: search.files === true || search.files === "true" || undefined,
  }),
  component: GoalsPanels,
});
