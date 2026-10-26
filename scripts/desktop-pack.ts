#!/usr/bin/env bun
import { $ } from "bun";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sign = process.argv.includes("--sign");
const NOTARY_PROFILE = "ultrawork-notary";

console.log("==> building UI (src/renderer)");
await $`bun run build:renderer`.cwd(root);

console.log("==> building Electron shell");
await $`bun run scripts/build-electron.ts`.cwd(root);

await $`bun run scripts/build-gateway.ts`.cwd(root);

if (!sign) {
  console.log("==> electron-builder (unsigned, dir only)");
  await $`bunx electron-builder --mac --dir -c.mac.identity=null -c.mac.notarize=false`.cwd(root);
  console.log("\nDone (unsigned): release/mac*/Ultrawork.app. Pass --sign for a signed + notarized dmg/zip.");
} else {
  const env = { ...process.env };
  if (!env.APPLE_API_KEY && !env.APPLE_ID) env.APPLE_KEYCHAIN_PROFILE ??= NOTARY_PROFILE;

  console.log("==> electron-builder (sign + notarize)");
  await $`bunx electron-builder --mac --publish never`.cwd(root).env(env);
  console.log("\nDone: release/Ultrawork-*.dmg, release/Ultrawork-*-mac.zip, release/mac*/Ultrawork.app");
}
