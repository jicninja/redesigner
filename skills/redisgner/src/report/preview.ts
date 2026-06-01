import path from "node:path";
import { writeFileSafe } from "../util/fs.js";
import type { PageArtifacts } from "../capture/page-capture.js";

/**
 * Genera un preview.html MUY básico: una galería de las screenshots capturadas
 * con links al HTML guardado de cada página (embebible en iframe). La idea es
 * revisar a ojo lo scrapeado sin gastar contexto del modelo en tokens/imágenes.
 */
export async function writePreview(
  outAbs: string,
  captured: PageArtifacts[],
  meta: { url: string; auth: string },
): Promise<void> {
  const cards = captured
    .map(
      (p) => `  <article class="card">
    <header>
      <strong>${escapeHtml(p.title || p.slug)}</strong>
      <a href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">${escapeHtml(p.url)}</a>
    </header>
    <a href="${p.screenshotFull}" target="_blank" title="ver full">
      <img loading="lazy" src="${p.screenshotViewport}" alt="${escapeHtml(p.slug)}" />
    </a>
    <footer>
      <a href="${p.html}" target="_blank">HTML</a> ·
      <a href="${p.screenshotFull}" target="_blank">screenshot full</a>
    </footer>
  </article>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>redisgner · preview — ${escapeHtml(meta.url)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; background: #0b0b0c; color: #e8e8ea; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { opacity: .6; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .card { background: #151517; border: 1px solid #26262a; border-radius: 12px; overflow: hidden; }
  .card header { padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid #26262a; }
  .card header a { font-size: 12px; opacity: .55; color: inherit; text-decoration: none; word-break: break-all; }
  .card img { width: 100%; display: block; background: #fff; }
  .card footer { padding: 8px 12px; font-size: 12px; opacity: .7; }
  a { color: #7aa2ff; }
</style>
</head>
<body>
  <h1>Preview del relevamiento</h1>
  <div class="meta">${escapeHtml(meta.url)} · acceso: ${escapeHtml(meta.auth)} · ${captured.length} páginas · click en una imagen para ver el full</div>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`;
  await writeFileSafe(path.join(outAbs, "preview.html"), html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
