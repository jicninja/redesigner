import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/** Creates a directory (recursively) if it does not exist. */
export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Writes a file, creating any necessary parent directories. */
export async function writeFileSafe(
  filePath: string,
  data: string | Buffer,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, data);
}

/** Writes JSON with indentation. */
export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFileSafe(filePath, JSON.stringify(value, null, 2));
}

/**
 * Converts a URL pathname into a filename-safe slug.
 * `/settings/profile` -> `settings__profile`; `/` -> `home`.
 */
export function slugFromPathname(pathname: string): string {
  const cleaned = pathname.replace(/^\/+|\/+$/g, "");
  if (!cleaned) return "home";
  const slug = cleaned
    .replace(/\//g, "__")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return slug || "page";
}

/** Short, stable hash of a string (for deduplicating by content/URL). */
export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}
