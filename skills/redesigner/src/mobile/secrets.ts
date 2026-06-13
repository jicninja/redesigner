import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type SecretStore = Record<string, Record<string, string>>;

let cache: SecretStore | null = null;
/** All secret values seen, for scrubbing from any emitted text. */
const knownValues = new Set<string>();

/** Secrets live in the PROJECT cwd (gitignored), not in the skill dir. */
function secretsPath(): string {
  return join(process.cwd(), ".qa.secrets.json");
}

function load(): SecretStore {
  if (cache) return cache;
  const path = secretsPath();
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  cache = JSON.parse(readFileSync(path, "utf8")) as SecretStore;
  for (const group of Object.values(cache)) {
    for (const v of Object.values(group)) if (v) knownValues.add(v);
  }
  return cache;
}

/**
 * Return a credential group as an env map with UPPERCASE keys, for injecting into a
 * Maestro run (`--env USERNAME=... PASSWORD=...`). Values never touch the flow YAML or
 * git — only the process env at runtime.
 */
export function secretsAsEnv(group: string): Record<string, string> {
  const store = load();
  const fields = store[group];
  if (!fields) throw new Error(`Credential group "${group}" not found in .qa.secrets.json`);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    env[k.toUpperCase()] = v;
    knownValues.add(v);
  }
  return env;
}

/** Replace any known secret value occurrences with a mask. */
export function scrub(text: string): string {
  load();
  let out = text;
  for (const v of knownValues) {
    if (v) out = out.split(v).join("••••••");
  }
  return out;
}
