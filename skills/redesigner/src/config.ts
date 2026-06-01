import path from "node:path";
import { z } from "zod";

/**
 * Configuration for the `capture` command. There is NO .env file or credentials: the
 * URL and options come from CLI flags. For SECURITY the engine never receives
 * username/password — if the site requires login, it is handled by hand in the
 * visible browser (--no-headless). See src/capture/login.ts.
 */

const viewportSchema = z
  .string()
  .regex(/^\d+x\d+$/, "viewport must be WidthxHeight, e.g. 1440x900")
  .transform((v) => {
    const [w, h] = v.split("x").map(Number);
    return { width: w, height: h };
  });

export const captureFlagsSchema = z.object({
  url: z.string().url("--url must be a valid URL (include https://)"),
  loginUrl: z.string().url().optional(),
  out: z.string().default("./redesigner-artifacts"),
  maxPages: z.coerce.number().int().positive().max(500).default(25),
  viewport: viewportSchema.prefault("1440x900"),
  headless: z.coerce.boolean().default(true),
  captureTrace: z.coerce.boolean().default(false),
  // Maximum time per page (ms).
  pageTimeout: z.coerce.number().int().positive().default(30_000),
});

export type CaptureFlags = z.infer<typeof captureFlagsSchema>;

export interface CaptureConfig extends CaptureFlags {
  outAbs: string;
}

/**
 * Resolves the CLI flags (already parsed by commander) into the final config.
 * Fails fast with a clear message if something is invalid. There are no credentials: the
 * login, if any, is manual in the visible browser.
 */
export function buildCaptureConfig(rawFlags: Record<string, unknown>): CaptureConfig {
  const flags = captureFlagsSchema.parse(rawFlags);

  return {
    ...flags,
    outAbs: path.resolve(process.cwd(), flags.out),
  };
}

/** Converts a ZodError into a user-readable message. */
export function formatConfigError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
  }
  return String(err);
}
