# Contributing

Thanks for helping out! Bug reports, fixes and focused features are all welcome.

## Setup

```bash
bun install           # also runs scripts/patch-libsql.ts (postinstall)
bun run desktop:dev   # Electron + server in watch mode + Vite HMR
```

The project uses [Bun](https://bun.com) for everything: runtime, package manager, tests and bundling. Don't add Node-only tooling (npm, ts-node, jest, express, dotenv). See [AGENTS.md](AGENTS.md) for the conventions; coding agents read it too.

## Before opening a PR

```bash
bun run format
bun run lint
bun run typecheck
bun test
```

CI runs these on every PR, and `main` only accepts PRs that pass. `bun run lint` fails on any warning, including formatting, so run `bun run format` first.

- No `console.log` in app code (`src/`). Use `console.warn`/`console.error` for real problems.
- Keep PRs small and focused, and add a test when you change behavior.
- If you change `src/server/core/db/schema.ts`, run `bun run db:generate` and commit the new migration. Never edit or delete existing migrations in `drizzle/`, because installed apps have already applied them.
- Add your change under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).

## Layout

- `src/main/` is the Electron main process. `src/renderer/` is the UI. `src/server/` is the agent server that main spawns.
- The UI talks to the server only through `/api/*` (see `src/server/api/app.ts` and `src/renderer/api/runs.ts`).
- Desktop-only features (settings, folder picker) go through the preload bridge `window.ultrawork` (`src/main/preload.ts`, `src/renderer/lib/desktop.ts`).

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).

## Releasing (maintainers)

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) when a `v*` tag is pushed.

1. Bump `version` in `package.json`, move the "Unreleased" notes in `CHANGELOG.md` under the new version, and merge that PR into `main`.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. CI checks that the tag matches `package.json`, runs the checks, then builds, signs and notarizes the app. It uploads it to the auto-update feed (`bun run desktop:publish`) and creates a GitHub Release with the dmg and zip.

The workflow uses the `release` GitHub environment. It needs these secrets:

| Secret | What it is |
| --- | --- |
| `MAC_CERT_P12_BASE64` | Developer ID Application certificate + private key, exported as `.p12`, base64-encoded |
| `MAC_CERT_PASSWORD` | Password for that `.p12` |
| `APPLE_API_KEY_P8` | App Store Connect API key (`AuthKey_XXXX.p8` contents), used for notarization |
| `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` | Key ID and issuer ID for that API key |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` / `R2_BUCKET` | Upload credentials for the release bucket |

It also needs the environment variable `R2_PUBLIC_URL`, the public URL of the bucket.

To build a signed release locally instead, run `bun run desktop:pack --sign` and then `bun run desktop:publish`, with the `R2_*` values above in your `.env`. Locally, notarization can use the `ultrawork-notary` keychain profile instead of the API key.
