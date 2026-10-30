#!/usr/bin/env bun
import { resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");

console.log("==> building UI (src/renderer)");
await $`bun run build:renderer`.cwd(root);

console.log("==> building Electron shell");
await $`bun run scripts/build-electron.ts`.cwd(root);

console.log("==> launching Electron");
const result = await $`bunx electron .`
  .cwd(root)
  .env({ ...process.env, ELECTRON_RUN_AS_NODE: undefined })
  .nothrow();
process.exit(result.exitCode);
