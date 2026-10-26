import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const dir = path.join(import.meta.dir, "..", "resources");
const svg = path.join(dir, "icon.svg");
const png = path.join(dir, "icon.png");
const icns = path.join(dir, "icon.icns");

await $`rsvg-convert -w 1024 -h 1024 ${svg} -o ${png}`;

const tmp = await mkdtemp(path.join(tmpdir(), "ultrawork-icon-"));
const iconset = path.join(tmp, "icon.iconset");
await $`mkdir -p ${iconset}`;
for (const size of [16, 32, 128, 256, 512]) {
  await $`sips -z ${size} ${size} ${png} --out ${path.join(iconset, `icon_${size}x${size}.png`)}`.quiet();
  const x2 = size * 2;
  await $`sips -z ${x2} ${x2} ${png} --out ${path.join(iconset, `icon_${size}x${size}@2x.png`)}`.quiet();
}
await $`iconutil -c icns ${iconset} -o ${icns}`;
await rm(tmp, { recursive: true, force: true });

console.log(`Wrote ${path.relative(process.cwd(), png)} and ${path.relative(process.cwd(), icns)}`);
