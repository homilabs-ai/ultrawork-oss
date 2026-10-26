# Ultrawork

A macOS desktop app for **long-running, self-orchestrating AI agents**. You give it one goal. It splits the work across planner and worker agents, runs them in parallel on your machine, and saves all state to SQLite. A run can pause, take your steering notes, and resume.

## How it works

- **Planners** break a goal into parts. They can start subplanners (up to `MAX_DEPTH` levels deep), queue tasks, steer or cancel them, and mark their part complete.
- **Workers** pick up queued tasks and do the work: files, shell commands, web search and a headless browser. They send their results back to the planner.
- **The scheduler** runs a loop that dispatches workers, wakes planners that have new results, enforces budgets, and decides when a run is idle, finished or stopped.
- **Durable state** lives entirely in SQLite (through Drizzle). It survives restarts, and a running goal resumes when the app reopens.
- **Sandbox:** workers run shell commands under [Anthropic sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (Seatbelt on macOS). They can only write to the workspace. Network access is limited to an allowlist of package registries.

Built with [Bun](https://bun.com), [Electron](https://www.electronjs.org), [Mastra](https://mastra.ai), [Hono](https://hono.dev), Drizzle and React.

## Architecture

```
src/main      Electron main process
  ├─ spawns ──▶ src/server   Bun + Hono on 127.0.0.1:4317
  │               ├─ /api/*   REST + SSE for the UI
  │               ├─ static   built UI (dist/renderer)
  │               └─ harness  scheduler, agents, SQLite
  └─ window ──▶ src/renderer  React UI, loaded from http://127.0.0.1:4317/
```

The server runs as its own process (on Bun) so a long or stuck agent run can't freeze the window.

The server only listens on the loopback address. It rejects requests that come from other websites or that use a non-local `Host` header, so a page open in your browser can't start runs.

## Getting started

Requirements: macOS, [Bun](https://bun.com) ≥ 1.3, and at least one model provider API key (Fireworks, OpenAI or Anthropic). An [Exa](https://exa.ai) key for web search is optional.

```bash
bun install
bun run desktop:dev   # Electron + server (reloads on change) + Vite HMR for the UI
```

API keys, the workspace folder, sandbox network access and browser tools are set inside the app under **Settings**. Settings are stored in `~/Library/Application Support/Ultrawork/settings.json`, with the SQLite databases in the same folder. Saving settings restarts the server.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run desktop:dev` | Electron with the server in watch mode and Vite HMR |
| `bun run desktop:dev:fresh` | Same, with a throwaway user-data directory (first-run flow) |
| `bun run desktop` | Builds the UI and runs Electron against the repo |
| `bun run desktop:pack` | Builds an unsigned `.app` into `release/` |
| `bun run desktop:pack --sign` | Signed and notarized dmg + zip (needs an Apple Developer ID) |
| `bun run desktop:icon` | Regenerates `resources/icon.{png,icns}` from `icon.svg` |
| `bun test` | Tests |
| `bun run typecheck` | Typechecks the backend, Electron and the web UI |
| `bun run lint` / `bun run format` | Biome |
| `bun run db:generate` | Generates a Drizzle migration after editing `src/server/core/db/schema.ts` |

## Project structure

```
src/
  main/              Electron main process + preload: window, server process, settings, setup, auto-update
  renderer/          UI shown in the window (React, Vite, TanStack Router, Tailwind)
  server/            Agent server, spawned by main
    index.ts         Entry point
    api/             Hono routes, SSE, workspace files, attachments, local-only check
    core/
      config.ts      Environment-driven configuration
      models.ts      Provider and model catalog
      runtime/       Orchestrator, scheduler, sandbox, steering
      agents/        Mastra driver, prompts, planner/worker tools
      transport/     SQLite task queue + inbox, in-process event bus
      db/            Drizzle schema and repository
resources/           App icon and macOS entitlements
drizzle/             SQL migrations (applied automatically on start)
scripts/             Build, dev and packaging scripts
test/                Server and main-process tests (UI tests sit next to their code)
dist/                Build output (gitignored)
```

## Configuration

The desktop app sets these from Settings. When you run the server directly (`bun src/server/index.ts`), you can set them as environment variables or in `.env`.

| Variable | Default | Description |
| --- | --- | --- |
| `FIREWORKS_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | | Provider keys. A provider's models become available once its key is set |
| `EXA_API_KEY` | | Turns on the web search tool |
| `PLANNER_MODEL` / `WORKER_MODEL` | `kimi-k3` | Default models (catalog ids from `src/server/core/models.ts`) |
| `VERIFIER_MODEL` | `deepseek-v4.1-flash` | Separate model for final verification tasks |
| `PLUGIN_VERIFIER_DEFAULT` | `off` | `on` requires a verifier before a run completes |
| `MAX_WORKERS` / `MAX_PLANNERS` / `MAX_DEPTH` | `20` / `3` / `3` | Concurrency and recursion limits |
| `MAX_TURNS` / `MAX_WALLCLOCK_MS` / `MAX_LLM_CALLS` | `500` / `6h` / `2000` | Budget limits |
| `WORKSPACE_DIR` | `workspace` | Where agents read and write files |
| `DB_PATH` | `data/harness.db` | SQLite state |
| `PORT` | `4317` | Gateway port |
| `SANDBOX_ALLOWED_DOMAINS` | PyPI, npm, GitHub, crates.io | Domains the sandbox can reach. `none` means offline |
| `CHROME_MCP` | `on` | `off` turns off the workers' headless Chrome tools |

## Building your own distribution

`electron-builder.yml` has the settings for the official Ultrawork releases: `appId`, `mac.identity` and the auto-update `publish.url`. If you ship your own build, change all three so your users don't pull updates from the official feed. Official releases are built by CI when a version tag is pushed; see "Releasing" in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE)
