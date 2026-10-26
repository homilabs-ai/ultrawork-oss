import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/core/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: `file:${process.env.DB_PATH ?? "data/harness.db"}`,
  },
});
