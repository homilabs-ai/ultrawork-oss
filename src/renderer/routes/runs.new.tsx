import { createFileRoute } from "@tanstack/react-router";

import { NewRun } from "@/views/new-run";

export const Route = createFileRoute("/runs/new")({
  component: NewRun,
});
