import path from "node:path";
import { readFile } from "node:fs/promises";
import { writeFileSafe } from "../util/fs.js";

/**
 * Rewrites asset references: replaces each **absolute** URL in the `assetMap`
 * (key) with its **relative local path** from `fromDir` to the map's value
 * (which is relative to the output root). Works on HTML and CSS alike, because
 * it operates on the text: it matches the URL wherever it appears (`src`,
 * `srcset`, `href`, `url(...)`, etc.).
 *
 * Keys are replaced from longest to shortest so as not to corrupt URLs that are
 * a prefix of another (e.g. `a.png` vs `a.png?2x`).
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

/** POSIX (web) relative path from `fromDir` to `local` (both rel. to the root). */
function relPosix(fromDir: string, local: string): string {
  const rel = path.posix.relative(fromDir || ".", local);
  return rel || local;
}

/**
 * Injects `<base href="...">` into the HTML `<head>`, ONLY if there isn't
 * already a `<base>`. Serves as a fallback so that undownloaded assets resolve
 * against the live site when there's a connection.
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
 * Applies the rewrite to the saved artifacts: each `html/<slug>.html` (with a
 * fallback `<base>`) and each network/inline CSS. Never aborts: if a file can't
 * be rewritten, it leaves it as-is and records it in `warnings`.
 */
export async function rewriteCapturedAssets(
  outAbs: string,
  pages: { html: string; url: string; slug: string }[],
  cssFileNames: string[],
  assetMap: Map<string, string>,
  warnings: string[],
): Promise<void> {
  // HTML per page.
  for (const p of pages) {
    const file = path.join(outAbs, p.html);
    const fromDir = path.posix.dirname(toPosix(p.html));
    try {
      const original = await readFile(file, "utf8");
      // We do NOT inject <base>: it clashed with assets rewritten to local paths
      // (it made them resolve against the live domain → blank "before"). The
      // undownloaded refs were already made absolute (absolutizeAssetUrls) and
      // load online on their own.
      const rewritten = rewriteRefs(original, assetMap, fromDir);
      if (rewritten !== original) await writeFileSafe(file, rewritten);
    } catch (err) {
      warnings.push(`html rewrite ${p.slug}: ${String(err).slice(0, 100)}`);
    }
  }

  // Network CSS (css/<name>.css) and inline (css/inline/<slug>.css).
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
      // inline CSS may not exist for a page; ignore silently.
    }
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
