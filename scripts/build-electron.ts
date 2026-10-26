#!/usr/bin/env bun
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const result = await Bun.build({
  entrypoints: [resolve(root, "src/main/index.ts"), resolve(root, "src/main/preload.ts")],
  outdir: resolve(root, "dist/main"),
  target: "node",
  format: "cjs",
  naming: "[name].cjs",
  external: ["electron"],
  minify: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
