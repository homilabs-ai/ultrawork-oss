import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="app-frame flex h-dvh overflow-hidden border bg-card shadow-2xl">
      <aside className="settings-sidebar flex min-h-0 w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar">
        <SettingsSidebar />
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
