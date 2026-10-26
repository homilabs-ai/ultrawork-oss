import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Circle, Copy, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SETTINGS_QUERY_KEY, useDesktopSettings } from "@/hooks/use-desktop-settings";
import { desktop, type SetupStatus, type ToolStatus } from "@/lib/desktop";
import { cn } from "@/lib/utils";

const SETUP_QUERY_KEY = ["desktop-setup"] as const;

type Need = "Required" | "Recommended" | "Optional";

interface ToolInfo {
  key: keyof SetupStatus["tools"];
  name: string;
  need: Need;
  why: string;
  install: string;
  link?: { label: string; href: string };
}

const TOOLS: ToolInfo[] = [
  {
    key: "commandLineTools",
    name: "Xcode Command Line Tools",
    need: "Required",
    why: "Apple's developer basics: git, python3, make and a C compiler. Without them, most commands agents run will fail.",
    install: "xcode-select --install",
  },
  {
    key: "python3",
    name: "Python 3",
    need: "Required",
    why: "Agents write and run Python scripts for data work, and install libraries like pandas into a virtualenv.",
    install: "brew install python",
  },
  {
    key: "homebrew",
    name: "Homebrew",
    need: "Recommended",
    why: "The package manager used to install the tools below.",
    install: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    link: { label: "brew.sh", href: "https://brew.sh" },
  },
  {
    key: "node",
    name: "Node.js (npm)",
    need: "Recommended",
    why: "Lets agents install npm packages and run JavaScript tooling.",
    install: "brew install node",
  },
  {
    key: "ripgrep",
    name: "ripgrep",
    need: "Optional",
    why: "Fast search across large folders. Agents fall back to grep without it.",
    install: "brew install ripgrep",
  },
];

export function SetupView() {
  const bridge = desktop as NonNullable<typeof desktop>;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: SETUP_QUERY_KEY, queryFn: bridge.setup.check });
  const complete = useMutation({
    mutationFn: bridge.setup.complete,
    onSuccess: (s) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, s);
      void navigate({ to: "/" });
    },
  });

  const s = status.data;
  const missingRequired = s ? TOOLS.some((t) => t.need === "Required" && !s.tools[t.key].found) : false;

  return (
    <div className="app-frame flex h-dvh flex-col overflow-hidden border bg-card shadow-2xl">
      <header className="window-drag h-14 shrink-0 border-b" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-background/60">
        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-brand">
            <Sparkles className="size-3.5" />
            Welcome to Ultrawork
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Get this Mac ready for your agents</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Agents work on this machine: they run commands in a terminal, browse the web in Chrome, and search with Exa.
            Here's what they use and how to get anything that's missing. You can change all of this later in Settings.
          </p>

          {!s ? (
            <p className="mt-8 text-sm text-muted-foreground">
              {status.isError ? String(status.error) : "Checking this Mac…"}
            </p>
          ) : (
            <div className="mt-8 space-y-5">
              <Group
                title="Terminal tools"
                description="Paste install commands into Terminal. Come back here when they finish; this page checks again on its own."
              >
                {TOOLS.map((t) => (
                  <Item
                    key={t.key}
                    name={t.name}
                    need={t.need}
                    status={s.tools[t.key]}
                    why={t.why}
                    link={t.link}
                    command={t.install}
                  />
                ))}
              </Group>

              <ChromeGroup chrome={s.chrome} />
              <ExaGroup configured={s.exa.configured} />
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6">
            <Button onClick={() => complete.mutate()} disabled={!s || complete.isPending}>
              {complete.isPending ? "Applying…" : "Continue"}
            </Button>
            <Button variant="outline" onClick={() => void status.refetch()} disabled={status.isFetching}>
              <RefreshCw className={cn(status.isFetching && "animate-spin")} />
              Check again
            </Button>
            {missingRequired ? (
              <span className="text-sm text-muted-foreground">
                You can continue now, but agents will fail at tasks that need what's missing.
              </span>
            ) : null}
            {complete.error ? <span className="text-sm text-destructive">{String(complete.error)}</span> : null}
          </div>
        </div>
      </main>
    </div>
  );
}

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      <ul className="mt-4 divide-y border-t">{children}</ul>
    </section>
  );
}

function Item({
  name,
  need,
  status,
  why,
  link,
  command,
  children,
}: {
  name: string;
  need: Need;
  status: ToolStatus;
  why: string;
  link?: { label: string; href: string };
  command?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 py-4 last:pb-0">
      <StatusIcon found={status.found} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          <NeedBadge need={need} />
          {status.found && status.path ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">{status.path}</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{why}</p>
        {!status.found && (command || link) ? (
          <div className="mt-2.5 space-y-2">
            {command ? <CommandLine command={command} /> : null}
            {link ? <ExternalAnchor href={link.href}>{link.label}</ExternalAnchor> : null}
          </div>
        ) : null}
        {children}
      </div>
    </li>
  );
}

function ChromeGroup({ chrome }: { chrome: SetupStatus["chrome"] }) {
  const { saved, save } = useDesktopSettings();
  const queryClient = useQueryClient();
  return (
    <Group
      title="Browser"
      description="Agents drive their own headless Chrome through Chrome MCP (bundled with Ultrawork). It needs Google Chrome installed."
    >
      <Item
        name="Google Chrome"
        need="Recommended"
        status={chrome}
        why="Lets agents open JavaScript-heavy pages, log in to sites, fill forms and take screenshots. Each task gets its own profile, separate from your everyday Chrome."
        link={{ label: "Download Chrome", href: "https://www.google.com/chrome/" }}
      >
        {chrome.found && !chrome.enabled && saved.data ? (
          <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
            Browser tools are turned off.
            <Button
              size="xs"
              variant="outline"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { ...saved.data, chromeMcp: true },
                  { onSuccess: () => void queryClient.invalidateQueries({ queryKey: SETUP_QUERY_KEY }) },
                )
              }
            >
              {save.isPending ? "Turning on…" : "Turn on"}
            </Button>
          </div>
        ) : null}
      </Item>
    </Group>
  );
}

function ExaGroup({ configured }: { configured: boolean }) {
  const { saved, save } = useDesktopSettings();
  const queryClient = useQueryClient();
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && key === null) setKey(saved.data.exaApiKey);
  }, [saved.data, key]);

  const dirty = key !== null && saved.data !== undefined && key !== saved.data.exaApiKey;

  return (
    <Group title="Web search" description="Exa is the search engine agents use to find and read pages quickly.">
      <Item
        name="Exa API key"
        need="Recommended"
        status={{ found: configured }}
        why="Without it, agents can't search the web or fetch pages, and have to rely on the browser or what you give them."
      >
        {!configured ? (
          <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
            Sign up at <ExternalAnchor href="https://exa.ai">exa.ai</ExternalAnchor>, create a key under API Keys in
            the dashboard, and paste it here.
          </p>
        ) : null}
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!saved.data || key === null) return;
            save.mutate(
              { ...saved.data, exaApiKey: key.trim() },
              {
                onSuccess: (s) => {
                  setKey(s.exaApiKey);
                  void queryClient.invalidateQueries({ queryKey: SETUP_QUERY_KEY });
                },
              },
            );
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            aria-label="Exa API key"
            value={key ?? ""}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your Exa API key"
          />
          <Button type="submit" variant="outline" disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
        {save.error ? <p className="mt-1.5 text-xs text-destructive">{String(save.error)}</p> : null}
      </Item>
    </Group>
  );
}

function StatusIcon({ found }: { found: boolean }) {
  return found ? (
    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-background">
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  ) : (
    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
  );
}

function NeedBadge({ need }: { need: Need }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        need === "Required" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
      )}
    >
      {need}
    </span>
  );
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={command}>
        {command}
      </code>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Copy command"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}
