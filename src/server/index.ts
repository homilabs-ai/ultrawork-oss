import { createApp } from "@/api/app.ts";
import { Harness, loadConfig } from "@/core/index.ts";
import { checkSandbox } from "@/core/runtime/sandbox.ts";

const config = loadConfig();
const harness = new Harness(config);

const sandbox = await checkSandbox(config.sandboxAllowedDomains);
if (sandbox.ok) console.log(`[sandbox] ${sandbox.message}`);
else console.warn(`[sandbox] ${sandbox.message} runCommand will fail until this is fixed.`);

Bun.serve({
  hostname: "127.0.0.1",
  port: config.serverPort,
  idleTimeout: 30,
  fetch: createApp(harness).fetch,
});
console.log(`Gateway listening on http://127.0.0.1:${config.serverPort}`);

const resumable = harness.repo.listRuns(50).find((r) => r.status === "running");
if (resumable) {
  console.log(`Resuming run ${resumable.id}…`);
  void harness.start(resumable.id).then((outcome) => console.log(`Run ${resumable.id} ${outcome}.`));
}

const shutdown = () => {
  harness.scheduler?.stop();
  void harness.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
