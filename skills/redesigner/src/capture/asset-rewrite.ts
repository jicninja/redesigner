import path from "node:path";
import { readFile } from "node:fs/promises";
import { writeFileSafe } from "../util/fs.js";

/**
 * Reescribe referencias a assets: reemplaza cada URL **absoluta** del `assetMap`
 * (clave) por su **ruta local relativa** desde `fromDir` hacia el valor del map
 * (que es relativo a la raíz de salida). Funciona sobre HTML y CSS por igual,
 * porque opera sobre el texto: matchea la URL donde aparezca (`src`, `srcset`,
 * `href`, `url(...)`, etc.).
 *
 * Las claves se reemplazan de más larga a más corta para no corromper URLs que
 * son prefijo de otra (p. ej. `a.png` vs `a.png?2x`).
 */
export function rewriteRefs(
  content: string,
  assetMap: Map<string, string>,
  fromDir: string,
): string {
  const entries = [...assetMap.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  let out = content;
  for (const [abs, local] of entries) {
    if (!abs) continue;
    const rel = relPosix(fromDir, local);
    out = out.split(abs).join(rel);
  }
  return out;
}

/** Ruta relativa POSIX (web) desde `fromDir` hacia `local` (ambos rel. a la raíz). */
function relPosix(fromDir: string, local: string): string {
  const rel = path.posix.relative(fromDir || ".", local);
  return rel || local;
}

/**
 * Inyecta `<base href="...">` en el `<head>` del HTML, SOLO si no hay ya un
 * `<base>`. Sirve de fallback para que los assets no descargados resuelvan
 * contra el sitio vivo cuando haya conexión.
 */
export function injectBase(html: string, pageUrl: string): string {
  if (/<base\b/i.test(html)) return html;
  const tag = `<base href="${escapeAttr(pageUrl)}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  }
  return `${tag}${html}`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Aplica la reescritura a los artefactos guardados: cada `html/<slug>.html`
 * (con `<base>` de fallback) y cada CSS de red/inline. Nunca aborta: si un
 * archivo no se puede reescribir, lo deja como estaba y registra en `warnings`.
 */
export async function rewriteCapturedAssets(
  outAbs: string,
  pages: { html: string; url: string; slug: string }[],
  cssFileNames: string[],
  assetMap: Map<string, string>,
  warnings: string[],
): Promise<void> {
  // HTML por página.
  for (const p of pages) {
    const file = path.join(outAbs, p.html);
    const fromDir = path.posix.dirname(toPosix(p.html));
    try {
      const original = await readFile(file, "utf8");
      // NO inyectamos <base>: chocaba con los assets reescritos a rutas locales
      // (los hacía resolver contra el dominio vivo → "antes" en blanco). Los
      // refs no descargados ya quedaron absolutos (absolutizeAssetUrls) y cargan
      // online por sí solos.
      const rewritten = rewriteRefs(original, assetMap, fromDir);
      if (rewritten !== original) await writeFileSafe(file, rewritten);
    } catch (err) {
      warnings.push(`reescritura html ${p.slug}: ${String(err).slice(0, 100)}`);
    }
  }

  // CSS de red (css/<name>.css) e inline (css/inline/<slug>.css).
  const cssTargets: { file: string; fromDir: string }[] = [
    ...cssFileNames.map((name) => ({
      file: path.join(outAbs, "css", name),
      fromDir: "css",
    })),
    ...pages.map((p) => ({
      file: path.join(outAbs, "css", "inline", `${p.slug}.css`),
      fromDir: "css/inline",
    })),
  ];
  for (const t of cssTargets) {
    try {
      const original = await readFile(t.file, "utf8");
      const rewritten = rewriteRefs(original, assetMap, t.fromDir);
      if (rewritten !== original) await writeFileSafe(t.file, rewritten);
    } catch {
      // CSS inline puede no existir para una página; ignorar silenciosamente.
    }
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
