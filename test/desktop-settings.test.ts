import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "../src/main/settings.ts";

test("older settings files load with verifier defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "settings-"));
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ exaApiKey: "exa", verifier: { effort: "max", enabledByDefault: true } }),
  );
  const loaded = new SettingsStore(dir).load();
  expect(loaded.exaApiKey).toBe("exa");
  expect(loaded.verifier).toEqual({ model: "", effort: "max", prompt: "" });
});
