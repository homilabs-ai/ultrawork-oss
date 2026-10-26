import { createFileRoute } from "@tanstack/react-router";

import { SecretsSettings } from "@/views/secrets-settings";

export const Route = createFileRoute("/settings/secrets")({
  component: SecretsSettings,
});
