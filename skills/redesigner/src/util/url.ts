/**
 * Utilidades de URL para el crawler. El crawler es de SOLO LECTURA:
 * estas funciones deciden qué links seguir (mismo origen, no destructivos)
 * y normalizan URLs para deduplicar.
 */

/** Parámetros de tracking que se descartan al normalizar para dedupe. */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
  "_ga",
];

/**
 * Regex de acciones DESTRUCTIVAS o mutantes (ES + EN). Cualquier link cuyo
 * href, texto o aria-label matchee esto se SALTA. Por seguridad ante todo.
 */
export const DESTRUCTIVE_PATTERN =
  /\b(log\s?out|sign\s?out|logout|signout|cerrar\s?sesi[oó]n|salir|desconectar|delete|eliminar|borrar|remove|quitar|destroy|cancel|cancelar|deactivate|dar\s?de\s?baja|unsubscribe|desuscribir|pay|checkout|comprar|pagar|purchase|subscribe|suscribir|edit|editar|update|actualizar|save|guardar|create|crear|nuevo|new|add|agregar|a[nñ]adir|send|enviar|submit|confirm|confirmar|approve|aprobar|reject|rechazar|archive|archivar|reset|restablecer|revoke|revocar|transfer|transferir|withdraw|retirar|deposit|depositar)\b/i;

/** Esquemas que no son navegación HTTP y se ignoran. */
const NON_HTTP_SCHEME = /^(mailto:|tel:|sms:|javascript:|data:|blob:|ftp:)/i;

/** Extensiones de descarga que no son páginas navegables. */
const DOWNLOAD_EXT =
  /\.(pdf|zip|rar|7z|tar|gz|csv|xlsx?|docx?|pptx?|dmg|exe|pkg|apk|mp4|mov|avi|mp3|wav|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)(\?|#|$)/i;

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Normaliza una URL para deduplicar: baja host a minúsculas, quita hash
 * (salvo rutas de hash tipo SPA `#/...`), quita slash final y params de tracking.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.username = "";
    u.password = "";
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    // Hash: conservar solo rutas SPA (#/algo), descartar anclas (#seccion).
    if (u.hash && !u.hash.startsWith("#/")) u.hash = "";
    let out = u.toString();
    // Quitar slash final salvo en la raíz.
    out = out.replace(/\/(?=([?#]|$))/, (m, _g, offset) =>
      offset === u.origin.length ? m : "",
    );
    return out;
  } catch {
    return raw;
  }
}

export interface LinkDecision {
  follow: boolean;
  reason?: string;
}

/**
 * Decide si un link es seguro de seguir en un crawl de solo lectura.
 * `text` y `aria` ayudan a detectar botones de acción disfrazados de link.
 */
export function classifyLink(
  href: string,
  baseUrl: string,
  meta: { text?: string; aria?: string; rel?: string; method?: string } = {},
): LinkDecision {
  if (!href || href.trim() === "" || href === "#")
    return { follow: false, reason: "vacío" };
  if (NON_HTTP_SCHEME.test(href))
    return { follow: false, reason: "esquema no-http" };

  let abs: string;
  try {
    abs = new URL(href, baseUrl).toString();
  } catch {
    return { follow: false, reason: "url inválida" };
  }

  if (!sameOrigin(abs, baseUrl))
    return { follow: false, reason: "otro origen" };
  if (DOWNLOAD_EXT.test(abs)) return { follow: false, reason: "descarga" };
  if ((meta.method ?? "").toLowerCase() === "post")
    return { follow: false, reason: "method=post" };

  const haystack = `${href} ${meta.text ?? ""} ${meta.aria ?? ""}`;
  if (DESTRUCTIVE_PATTERN.test(haystack))
    return { follow: false, reason: "acción destructiva/mutante" };

  return { follow: true };
}

/** Resuelve un href relativo a absoluto; devuelve null si es inválido. */
export function toAbsolute(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}
