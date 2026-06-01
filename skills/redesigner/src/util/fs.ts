import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/** Crea un directorio (recursivo) si no existe. */
export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Escribe un archivo creando los directorios padre necesarios. */
export async function writeFileSafe(
  filePath: string,
  data: string | Buffer,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, data);
}

/** Escribe JSON con indentación. */
export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFileSafe(filePath, JSON.stringify(value, null, 2));
}

/**
 * Convierte un pathname de URL en un slug seguro para nombre de archivo.
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

/** Hash corto y estable de un string (para deduplicar por contenido/URL). */
export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}
