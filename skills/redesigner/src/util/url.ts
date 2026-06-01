/**
 * URL utilities for the crawler. The crawler is READ-ONLY:
 * these functions decide which links to follow (same origin, non-destructive)
 * and normalize URLs for deduplication.
 */

/** Tracking params that are dropped when normalizing for dedupe. */
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
 * Regex of DESTRUCTIVE or mutating actions (ES + EN). Any link whose
 * href, text or aria-label matches this is SKIPPED. Safety first.
 */
export const DESTRUCTIVE_PATTERN =
  /\b(log\s?out|sign\s?out|logout|signout|cerrar\s?sesi[oó]n|salir|desconectar|delete|eliminar|borrar|remove|quitar|destroy|cancel|cancelar|deactivate|dar\s?de\s?baja|unsubscribe|desuscribir|pay|checkout|comprar|pagar|purchase|subscribe|suscribir|edit|editar|update|actualizar|save|guardar|create|crear|nuevo|new|add|agregar|a[nñ]adir|send|enviar|submit|confirm|confirmar|approve|aprobar|reject|rechazar|archive|archivar|reset|restablecer|revoke|revocar|transfer|transferir|withdraw|retirar|deposit|depositar)\b/i;

/** Schemes that are not HTTP navigation and are ignored. */
const NON_HTTP_SCHEME = /^(mailto:|tel:|sms:|javascript:|data:|blob:|ftp:)/i;

/** Download extensions that are not navigable pages. */
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
 * Normalizes a URL for deduplication: lowercases the host, removes the hash
 * (except SPA-style hash routes `#/...`), removes the trailing slash and tracking params.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.username = "";
    u.password = "";
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    // Hash: keep only SPA routes (#/something), drop anchors (#section).
    if (u.hash && !u.hash.startsWith("#/")) u.hash = "";
    let out = u.toString();
    // Remove the trailing slash except at the root.
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
 * Decides whether a link is safe to follow in a read-only crawl.
 * `text` and `aria` help detect action buttons disguised as links.
 */
export function classifyLink(
  href: string,
  baseUrl: string,
  meta: { text?: string; aria?: string; rel?: string; method?: string } = {},
): LinkDecision {
  if (!href || href.trim() === "" || href === "#")
    return { follow: false, reason: "empty" };
  if (NON_HTTP_SCHEME.test(href))
    return { follow: false, reason: "non-http scheme" };

  let abs: string;
  try {
    abs = new URL(href, baseUrl).toString();
  } catch {
    return { follow: false, reason: "invalid url" };
  }

  if (!sameOrigin(abs, baseUrl))
    return { follow: false, reason: "other origin" };
  if (DOWNLOAD_EXT.test(abs)) return { follow: false, reason: "download" };
  if ((meta.method ?? "").toLowerCase() === "post")
    return { follow: false, reason: "method=post" };

  const haystack = `${href} ${meta.text ?? ""} ${meta.aria ?? ""}`;
  if (DESTRUCTIVE_PATTERN.test(haystack))
    return { follow: false, reason: "destructive/mutating action" };

  return { follow: true };
}

/** Resolves a relative href to absolute; returns null if invalid. */
export function toAbsolute(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}
