# Changelog

## Unreleased

- Added a `NOTICE` file. The app now ships `LICENSE` and `NOTICE` in its resources.
- Stricter checks for contributors: lint warnings and formatting now fail CI, `console.log` and non-null assertions aren't allowed in app code, and CI also builds the UI.

## 0.2.0

First open-source release under the Apache License 2.0. Versions 0.1.x were closed-source.

- The server listens only on `127.0.0.1` and rejects requests with a non-local `Host` or `Origin`, so websites can't drive it.
- The Electron window only opens `http(s)`/`mailto` links externally and doesn't navigate away from the app.
- Removed the headless CLI (`index.ts run`, `/api/bind`, `/api/wake`). The server entry point is now `src/server/index.ts`.
- `desktop:pack` builds unsigned by default. Use `--sign` for signed + notarized builds.
- Releases are built, signed and published by GitHub Actions when a `v*` tag is pushed.
- One `package.json`. The source now lives in `src/main` (Electron), `src/renderer` (UI) and `src/server` (agents), and all builds go to `dist/`.
