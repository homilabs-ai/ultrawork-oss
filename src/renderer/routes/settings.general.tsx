import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettings } from "@/views/general-settings";

export const Route = createFileRoute("/settings/general")({
  component: GeneralSettings,
});
