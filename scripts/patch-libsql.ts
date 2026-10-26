const TARGET = "node_modules/@mastra/libsql/dist/index.js";

const ORIGINAL = `  async initDomainsSequentially() {
    for (const store of this.getStoresToInit()) {
      await store.init();
    }
    return true;
  }
  async initDomainsInParallel() {
    await Promise.all(this.getStoresToInit().map((store) => store.init()));
    return true;
  }`;

const PATCHED = `  async initDomainsSequentially() {
    for (const store of this.getStoresToInit()) {
      try {
        await store.init();
      } catch (err) {
        this.logger?.warn?.(\`LibSQLStore: domain init failed (\${store?.constructor?.name ?? "unknown"}), continuing.\`, err);
      }
    }
    return true;
  }
  async initDomainsInParallel() {
    await Promise.all(
      this.getStoresToInit().map(async (store) => {
        try {
          await store.init();
        } catch (err) {
          this.logger?.warn?.(\`LibSQLStore: domain init failed (\${store?.constructor?.name ?? "unknown"}), continuing.\`, err);
        }
      })
    );
    return true;
  }`;

const file = Bun.file(TARGET);
if (!(await file.exists())) {
  process.exit(0);
}

const src = await file.text();
if (src.includes("domain init failed")) {
  console.log("patch-libsql: already patched.");
  process.exit(0);
}
if (!src.includes(ORIGINAL)) {
  console.warn("patch-libsql: target init block not found (libsql version changed?). Skipping.");
  process.exit(0);
}

await Bun.write(TARGET, src.replace(ORIGINAL, PATCHED));
console.log("patch-libsql: applied resilient domain-init patch.");
