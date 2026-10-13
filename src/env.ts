import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_URL_TEST: z.url(),
  AUTH_SECRET: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid environment variables:\n${problems}\nCopy .env.example to .env and fill in the values.`,
  );
}

export const env = parsed.data;
