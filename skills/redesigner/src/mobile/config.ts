import path from "node:path";
import { z } from "zod";

/**
 * Configuration for the `mobile-capture` command. Like the web `capture`, there is NO
 * credential flag for username/password: login is MANUAL on the device. The only secrets
 * path is the optional `--creds <group>` that injects values from a local `.qa.secrets.json`
 * (gitignored) as Maestro `--env`, never written into the flow YAML.
 */
export const mobileFlagsSchema = z.object({
  app: z.string().min(1, "--app <appId> is required (Android package / iOS bundleId)"),
  platform: z.enum(["android", "ios"]),
  flows: z
    .string()
    .min(1, "--flows <path> is required (a .yaml Maestro flow or a directory of flows)"),
  out: z.string().default("./redesigner-artifacts"),
  device: z.string().default("auto"),
  creds: z.string().optional(),
  watch: z.coerce.boolean().default(false),
  /** Authoring mode: `maestro test --continuous` re-runs the flow on every save (no artifacts). */
  continuous: z.coerce.boolean().default(false),
});

export type MobileFlags = z.infer<typeof mobileFlagsSchema>;

export interface MobileConfig extends MobileFlags {
  outAbs: string;
  flowsAbs: string;
}

export function buildMobileConfig(rawFlags: Record<string, unknown>): MobileConfig {
  const flags = mobileFlagsSchema.parse(rawFlags);
  return {
    ...flags,
    outAbs: path.resolve(process.cwd(), flags.out),
    flowsAbs: path.resolve(process.cwd(), flags.flows),
  };
}
