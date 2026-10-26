import { createFileRoute } from "@tanstack/react-router";

import { WorkerPlugins } from "@/views/worker-plugins";

export const Route = createFileRoute("/settings/worker-plugins")({
  component: WorkerPlugins,
});
