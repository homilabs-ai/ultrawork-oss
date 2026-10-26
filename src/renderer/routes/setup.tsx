import { createFileRoute, redirect } from "@tanstack/react-router";

import { isDesktop } from "@/lib/desktop";
import { SetupView } from "@/views/setup";

export const Route = createFileRoute("/setup")({
  beforeLoad: () => {
    if (!isDesktop) throw redirect({ to: "/" });
  },
  component: SetupView,
});
