import { z } from "zod";

/**
 * Environment variable validation.
 *
 * Why this exists
 * ---------------
 * GitHub App credentials, the encryption key, and the database URL are all
 * load-bearing — if any are missing or malformed, the app should refuse to
 * start instead of crashing on the first request with a cryptic error.
 *
 * This file is imported by every server module that needs config, so the
 * `parse()` call runs once when Node first loads it. A bad env crashes the
 * boot, which is what we want.
 *
 * Notes on individual vars
 * ------------------------
 * - GITHUB_PRIVATE_KEY is a PEM file (multi-line). On Vercel you paste it as
 *   a single line with `\n` literals; we restore newlines below so callers
 *   don't have to think about it.
 * - ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256). We accept
 *   base64 and validate the length after decoding.
 * - GITHUB_WEBHOOK_SECRET is what we HMAC the webhook body against. It must
 *   match the secret you configured on the App's webhook settings.
 */

const rawEnvSchema = z.object({
  // GitHub App
  GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
  GITHUB_APP_SLUG: z
    .string()
    .min(1, "GITHUB_APP_SLUG is required (URL slug of your App)"),
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
  GITHUB_PRIVATE_KEY: z
    .string()
    .min(1, "GITHUB_PRIVATE_KEY is required (PEM-formatted)"),
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(16, "GITHUB_WEBHOOK_SECRET must be at least 16 chars"),

  // Crypto
  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required (base64, 32 bytes)"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // App
  APP_URL: z.string().url("APP_URL must be a valid URL (e.g. https://...)"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Throwing on boot is intentional: better to crash now than serve broken auth.
  throw new Error(`Invalid environment variables:\n${issues}`);
}

// Restore real newlines in the private key. Vercel + most secret stores
// serialize multi-line values with literal `\n`.
const privateKey = parsed.data.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
const appUrl = new URL(parsed.data.APP_URL).origin;

// Decode + length-check the encryption key.
const encryptionKeyBytes = Buffer.from(parsed.data.ENCRYPTION_KEY, "base64");
if (encryptionKeyBytes.length !== 32) {
  throw new Error(
    `ENCRYPTION_KEY must decode to exactly 32 bytes (got ${encryptionKeyBytes.length}). ` +
      `Generate one with: openssl rand -base64 32`,
  );
}

export const env = {
  ...parsed.data,
  APP_URL: appUrl,
  GITHUB_PRIVATE_KEY: privateKey,
  ENCRYPTION_KEY_BYTES: encryptionKeyBytes,
} as const;

export type Env = typeof env;
