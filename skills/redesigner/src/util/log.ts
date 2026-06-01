import { consola } from "consola";

/**
 * Shared logger. It must never receive credentials: mask any
 * sensitive value before logging with `redact`.
 */
export const log = consola.withTag("redesigner");

/** Masks a credential so it is safe to display in logs. */
export function redact(value: string | undefined | null): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-1)}`;
}
