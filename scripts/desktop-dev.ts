#!/usr/bin/env bun
import { resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
const UI_PORT = 5173;

console.log("==> building Electron shell");
await $`bun run scripts/build-electron.ts`.cwd(root);

console.log("==> starting Vite");
const vite = Bun.spawn(["bunx", "vite", "--port", String(UI_PORT), "--strictPort"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
const stop = () => vite.kill();
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

console.log("==> launching Electron (dev)");
const result = await $`bunx electron .`
  .cwd(root)
  .env({ ...process.env, ELECTRON_RUN_AS_NODE: undefined, ULTRAWORK_DEV_UI: `http://localhost:${UI_PORT}/` })
  .nothrow();
process.exit(result.exitCode);
