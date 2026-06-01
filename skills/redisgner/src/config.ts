import path from "node:path";
import { z } from "zod";

/**
 * Configuración del comando `capture`. NO hay archivo .env ni credenciales: la
 * URL y las opciones vienen por flags CLI. Por SEGURIDAD el motor nunca recibe
 * usuario/contraseña — si el sitio pide login, se resuelve a mano en el
 * navegador visible (--no-headless). Ver src/capture/login.ts.
 */

const viewportSchema = z
  .string()
  .regex(/^\d+x\d+$/, "viewport debe ser AnchoxAlto, ej 1440x900")
  .transform((v) => {
    const [w, h] = v.split("x").map(Number);
    return { width: w, height: h };
  });

export const captureFlagsSchema = z.object({
  url: z.string().url("--url debe ser una URL válida (incluí https://)"),
  loginUrl: z.string().url().optional(),
  out: z.string().default("./redisgner-artifacts"),
  maxPages: z.coerce.number().int().positive().max(500).default(25),
  viewport: viewportSchema.prefault("1440x900"),
  headless: z.coerce.boolean().default(true),
  captureTrace: z.coerce.boolean().default(false),
  // Tiempo máximo por página (ms).
  pageTimeout: z.coerce.number().int().positive().default(30_000),
});

export type CaptureFlags = z.infer<typeof captureFlagsSchema>;

export interface CaptureConfig extends CaptureFlags {
  outAbs: string;
}

/**
 * Resuelve las flags CLI (ya parseadas por commander) en la config final.
 * Falla rápido con mensaje claro si algo es inválido. No hay credenciales: el
 * login, si existe, es manual en el navegador visible.
 */
export function buildCaptureConfig(rawFlags: Record<string, unknown>): CaptureConfig {
  const flags = captureFlagsSchema.parse(rawFlags);

  return {
    ...flags,
    outAbs: path.resolve(process.cwd(), flags.out),
  };
}

/** Convierte un ZodError en un mensaje legible para el usuario. */
export function formatConfigError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `  • ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n");
  }
  return String(err);
}
