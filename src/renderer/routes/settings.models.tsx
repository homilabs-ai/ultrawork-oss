import { createFileRoute } from "@tanstack/react-router";

import { ModelsSettings } from "@/views/models-settings";

export const Route = createFileRoute("/settings/models")({
  component: ModelsSettings,
});
