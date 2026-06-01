import { consola } from "consola";

/**
 * Logger compartido. Nunca debe recibir credenciales: enmascará cualquier
 * valor sensible antes de loguear con `redact`.
 */
export const log = consola.withTag("redisgner");

/** Enmascara una credencial para que sea seguro mostrarla en logs. */
export function redact(value: string | undefined | null): string {
  if (!value) return "(vacío)";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-1)}`;
}
