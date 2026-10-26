import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Boxes,
  KeyRound,
  Moon,
  Settings2,
  Sun,
  Wrench,
} from "lucide-react";

import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { isDesktop } from "@/lib/desktop";
import { setTheme } from "@/lib/theme";

const settingsItems = [
  { label: "General", icon: Settings2, to: "/settings/general" },
  { label: "Models", icon: Boxes, to: "/settings/models" },
  { label: "Secrets", icon: KeyRound, to: "/settings/secrets" },
  { label: "Worker plugins", icon: Bot, to: "/settings/worker-plugins" },
  ...(isDesktop ? [{ label: "Setup checklist", icon: Wrench, to: "/setup" } as const] : []),
] as const;

export function SettingsSidebar() {
  const theme = useResolvedTheme();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="flex min-h-full flex-col">
      <div className="sidebar-header flex h-14 shrink-0 items-center justify-between border-b px-5">
        <Link
          to="/runs/new"
          className="flex items-center gap-2.5 font-semibold"
        >
          <span className="grid size-6 place-items-center rounded-md bg-foreground text-[10px] tracking-tighter text-background">
            UW
          </span>
          <span className="settings-sidebar-label">Ultrawork</span>
        </Link>
      </div>

      <div className="px-3 pt-4">
        <Link
          to="/runs/new"
          className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span className="settings-sidebar-label">Back to goals</span>
        </Link>
      </div>

      <nav className="mt-3 space-y-1 border-t px-3 py-4">
        <div className="label-caption px-2.5 pb-2 settings-sidebar-label">
          Settings
        </div>
        {settingsItems.map((item) => {
          const Icon = item.icon;
          const label = <span className="settings-sidebar-label">{item.label}</span>;
          return (
            <Link
              key={item.label}
              to={item.to}
              className="relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:font-medium [&.active]:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-end border-t px-4 py-3 text-muted-foreground">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"
          aria-label="Toggle color theme"
        >
          {theme === "dark" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
