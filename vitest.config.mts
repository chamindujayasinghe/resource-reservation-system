import path from "node:path";

import { defineConfig } from "vitest/config";

// Vitest does not put .env values on process.env by itself.
process.loadEnvFile();

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set. Copy .env.example to .env.");
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // Tests see the test database as DATABASE_URL, so the shared client in
    // src/server/db/client.ts can never touch development data.
    env: { DATABASE_URL: testDatabaseUrl },
    // Integration files share one database, so files run one at a time.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/global-setup.ts"],
        },
      },
    ],
  },
});
