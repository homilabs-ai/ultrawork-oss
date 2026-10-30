# Agent instructions

Ultrawork is a macOS Electron app with one `package.json`. `src/main/` is the Electron main process, `src/server/` is the Bun server it spawns (`src/server/index.ts`), and `src/renderer/` is the React + Vite UI the server serves to the window.

## Tooling

- Use Bun for everything: `bun install`, `bun run <script>`, `bun test`, `bun <file>`. Don't use npm, pnpm, yarn, node, ts-node, jest or vitest.
- Bun loads `.env` automatically, so don't add dotenv.
- Backend: `Bun.serve` + Hono, `bun:sqlite` + Drizzle, `Bun.$` for shell commands, `Bun.file` for file I/O.
- The UI is the one exception: Vite builds and serves it (`vite.config.ts`, rooted at `src/renderer/`).
- `@/` means `src/server/` in main/server/test code and `src/renderer/` in UI code (separate tsconfigs).

## Checks

```bash
bun run format      # Biome: format, sort imports, safe fixes
bun run lint        # fails on any warning, including formatting
bun run typecheck
bun test
```

CI runs the same commands plus `bun run build:renderer`, and a PR can't merge until it passes.

## Rules

- Schema changes: edit `src/server/core/db/schema.ts`, then `bun run db:generate`. Never edit existing files in `drizzle/`.
- Every `/api/*` route goes through `localOnly` (`src/server/api/security.ts`). Don't add routes that skip it.
- Keep the code comment-free unless a comment explains something the code can't.
- No `console.log`/`console.info`/`console.debug` in `src/`. Use `console.warn` or `console.error` for real problems. Only `src/server/index.ts` and `scripts/` may print freely.
- No non-null assertions (`!`) outside tests. Narrow the type or handle the missing case.
- Don't silence a lint rule without a `biome-ignore` reason that says why the rule is wrong for that line.
