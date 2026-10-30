#!/usr/bin/env bun
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { $, type BunPlugin } from "bun";

const root = resolve(import.meta.dir, "..");
const outfile = resolve(root, "dist/gateway/ultrawork-gateway");
const CHROME_MCP_VERSION = "1.8.0";

const target = `${process.platform}-${process.arch}`;
const LIBSQL_TARGETS: Record<string, string> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
};
const libsqlPkg = LIBSQL_TARGETS[target];
if (!libsqlPkg) throw new Error(`build-gateway: unsupported platform ${target}`);

const libsqlStatic: BunPlugin = {
  name: "libsql-static-native",
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]libsql[\\/]index\.js$/ }, async (args) => {
      const src = await Bun.file(args.path).text();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal text from libsql's source
      const needle = "require(`@libsql/${target}`)";
      const devBranch = /if \(process\.env\.LIBSQL_JS_DEV\) \{\s*return load\(__dirname\)\s*\}/;
      if (!src.includes(needle) || !devBranch.test(src)) {
        throw new Error("build-gateway: libsql loader changed; update the plugin.");
      }
      const contents = src.replace(needle, `require("@libsql/${libsqlPkg}/index.node")`).replace(devBranch, "");
      return { loader: "js", contents };
    });
  },
};

const bundledPkgDirs = new Set<string>();
const PKG_DIR = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
const collectPackages: BunPlugin = {
  name: "collect-packages",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (/^(node|bun):/.test(args.path) || !args.importer) return undefined;
      try {
        const m = Bun.resolveSync(args.path, dirname(args.importer)).match(PKG_DIR);
        if (m?.[1]) bundledPkgDirs.add(m[1]);
      } catch {}
      return undefined;
    });
  },
};

console.log(`==> compiling gateway (${target}) → ${outfile}`);
mkdirSync(dirname(outfile), { recursive: true });
const result = await Bun.build({
  entrypoints: [resolve(root, "src/server/index.ts")],
  compile: { outfile, autoloadDotenv: false, autoloadBunfig: false },
  minify: true,
  sourcemap: "none",
  plugins: [collectPackages, libsqlStatic],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await writeThirdPartyNotices();

console.log(`==> installing chrome-devtools-mcp@${CHROME_MCP_VERSION} → dist/vendor/chrome-devtools-mcp`);
const vendorRoot = resolve(root, "dist/vendor");
const staging = resolve(vendorRoot, ".staging");
const vendor = resolve(vendorRoot, "chrome-devtools-mcp");
rmSync(vendorRoot, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
await Bun.write(
  resolve(staging, "package.json"),
  JSON.stringify({ private: true, dependencies: { "chrome-devtools-mcp": CHROME_MCP_VERSION } }, null, 2),
);
await $`bun install --production --no-save`.cwd(staging).quiet();
const installed = readdirSync(resolve(staging, "node_modules")).filter((d) => !d.startsWith("."));
if (installed.join() !== "chrome-devtools-mcp") {
  throw new Error(
    `build-gateway: chrome-devtools-mcp now has runtime deps (${installed.join(", ")}); update packaging.`,
  );
}
renameSync(resolve(staging, "node_modules", "chrome-devtools-mcp"), vendor);
rmSync(staging, { recursive: true, force: true });

async function writeThirdPartyNotices() {
  const pkgDirs = new Set(bundledPkgDirs);
  if (pkgDirs.size === 0) throw new Error("build-gateway: no bundled packages recorded; cannot generate notices.");
  pkgDirs.add(resolve(root, "node_modules", `@libsql/${libsqlPkg}`));

  const sections: string[] = [];
  const seen = new Set<string>();
  for (const dir of [...pkgDirs].sort()) {
    const pkgFile = Bun.file(resolve(dir, "package.json"));
    if (!(await pkgFile.exists())) continue;
    const pkg = (await pkgFile.json()) as { name?: string; version?: string; license?: unknown };
    const id = `${pkg.name}@${pkg.version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const licenseName = typeof pkg.license === "string" ? pkg.license : "see package";
    const licenseFile = (
      await Array.fromAsync(new Bun.Glob("{LICENSE,LICENCE,COPYING,NOTICE}*").scan({ cwd: dir }))
    ).sort();
    const texts = await Promise.all(licenseFile.map((f) => Bun.file(resolve(dir, f)).text()));
    sections.push(`${pkg.name}@${pkg.version} (${licenseName})\n\n${texts.join("\n\n").trim() || "(no license file)"}`);
  }
  const header =
    "Ultrawork includes the following third-party software.\n" +
    "chrome-devtools-mcp ships unmodified with its own LICENSE in Resources/chrome-devtools-mcp.\n";
  const out = resolve(root, "dist/THIRD_PARTY_NOTICES.txt");
  await Bun.write(out, `${header}\n${"=".repeat(80)}\n\n${sections.join(`\n\n${"=".repeat(80)}\n\n`)}\n`);
  console.log(`==> wrote ${sections.length} third-party notices → dist/THIRD_PARTY_NOTICES.txt`);
}
