#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { S3Client } from "bun";

const PREFIX = "mac";
const FEED = "latest-mac.yml";

const root = resolve(import.meta.dir, "..");
const releaseDir = resolve(root, "release");
const force = process.argv.includes("--force");

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET", "R2_PUBLIC_URL"]) {
  if (!process.env[key]) fail(`${key} is not set (add it to .env)`);
}

const s3 = new S3Client({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET,
});

const feedPath = resolve(releaseDir, FEED);
if (!existsSync(feedPath)) fail(`${feedPath} not found. Run \`bun run desktop:pack --sign\` first.`);
const feedText = await Bun.file(feedPath).text();
const feed = Bun.YAML.parse(feedText) as { version: string; files: { url: string }[] };

const pkg = await Bun.file(resolve(root, "package.json")).json();
if (feed.version !== pkg.version) {
  fail(`release/${FEED} is ${feed.version} but package.json is ${pkg.version}. Rebuild first.`);
}

const artifacts = feed.files.flatMap((f) => [f.url, `${f.url}.blockmap`]);
for (const name of artifacts) {
  if (!existsSync(resolve(releaseDir, name))) fail(`missing release/${name}`);
}
const dmg = feed.files.find((f) => f.url.endsWith(".dmg"))?.url;
if (!dmg) fail(`no .dmg listed in ${FEED}`);

const app = resolve(releaseDir, "mac-arm64", "Ultrawork.app");
if (existsSync(app)) {
  const check = await Bun.$`xcrun stapler validate ${app}`.quiet().nothrow();
  if (check.exitCode !== 0) fail(`${app} is not notarized/stapled. Build with \`bun run desktop:pack --sign\`.`);
}

const liveFeed = s3.file(`${PREFIX}/${FEED}`);
if (await liveFeed.exists()) {
  const live = Bun.YAML.parse(await liveFeed.text()) as { version: string };
  const cmp = Bun.semver.order(feed.version, live.version);
  if (cmp < 0) fail(`live version ${live.version} is newer than ${feed.version}.`);
  if (cmp === 0 && !force) fail(`${feed.version} is already published. Bump the version, or pass --force.`);
  console.log(`live: ${live.version} → publishing ${feed.version}`);
} else {
  console.log(`no live release → publishing ${feed.version}`);
}

const types: Record<string, string> = {
  ".dmg": "application/x-apple-diskimage",
  ".zip": "application/zip",
  ".blockmap": "application/octet-stream",
  ".yml": "text/yaml",
};
const typeOf = (name: string) => types[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream";

async function upload(localName: string, key: string, extra: { contentDisposition?: string } = {}) {
  const file = Bun.file(resolve(releaseDir, localName));
  const mb = (file.size / 1024 / 1024).toFixed(1);
  const started = performance.now();
  process.stdout.write(`  ${key} (${mb} MB)… `);
  await s3.write(`${PREFIX}/${key}`, file, {
    type: typeOf(localName),
    partSize: 16 * 1024 * 1024,
    queueSize: 6,
    ...extra,
  });
  console.log(`${((performance.now() - started) / 1000).toFixed(1)}s`);
}

console.log("==> uploading artifacts");
for (const name of artifacts) await upload(name, name);

const latestDmg = dmg.replace(/-\d+\.\d+\.\d+(?:-[\w.]+)?-/, "-latest-");
await upload(dmg, latestDmg, { contentDisposition: `attachment; filename="${dmg}"` });

console.log("==> updating feed");
await upload(FEED, FEED);

const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
console.log(`
Published Ultrawork ${feed.version}
  download: ${PUBLIC_URL}/${PREFIX}/${latestDmg}
  feed:     ${PUBLIC_URL}/${PREFIX}/${FEED}`);
