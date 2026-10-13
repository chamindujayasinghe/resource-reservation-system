import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so .env is not loaded automatically.
process.loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
