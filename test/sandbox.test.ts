import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSandbox, runInSandbox, shutdownSandbox } from "@/core/runtime/sandbox.ts";

afterAll(() => shutdownSandbox());

const base = { allowedDomains: ["pypi.org"], timeoutMs: 15_000 };
const ready = async () => (await checkSandbox(base.allowedDomains)).ok;

test("runs a command in the workspace and confines writes to it", async () => {
  if (!(await ready())) return;
  const ws = mkdtempSync(join(tmpdir(), "sandbox-"));

  const ok = await runInSandbox({
    ...base,
    workspaceRoot: ws,
    commandId: "t1",
    command: "echo hi > out.txt && pwd",
  });
  expect(ok.exitCode).toBe(0);
  expect(ok.timedOut).toBe(false);
  expect(readFileSync(join(ws, "out.txt"), "utf8")).toBe("hi\n");

  const denied = await runInSandbox({
    ...base,
    workspaceRoot: ws,
    commandId: "t2",
    command: `touch "$HOME/sandbox-escape-test"`,
  });
  expect(denied.exitCode).not.toBe(0);
});

test("times out long-running commands", async () => {
  if (!(await ready())) return;
  const ws = mkdtempSync(join(tmpdir(), "sandbox-"));
  const res = await runInSandbox({
    ...base,
    workspaceRoot: ws,
    commandId: "t3",
    command: "sleep 10",
    timeoutMs: 300,
  });
  expect(res.timedOut).toBe(true);
});

test("network: allow-listed registries reachable, everything else blocked", async () => {
  if (!(await ready())) return;
  const ws = mkdtempSync(join(tmpdir(), "sandbox-"));
  const ok = await runInSandbox({
    ...base,
    workspaceRoot: ws,
    commandId: "n1",
    command: "curl -sS -o /dev/null -w '%{http_code}' https://pypi.org/simple/pip/",
  });
  expect(ok.stdout).toBe("200");
  const blocked = await runInSandbox({
    ...base,
    workspaceRoot: ws,
    commandId: "n2",
    command: "curl -sS https://example.com",
  });
  expect(blocked.exitCode).not.toBe(0);
  expect(blocked.stderr).toContain("not on the allow list");
});
