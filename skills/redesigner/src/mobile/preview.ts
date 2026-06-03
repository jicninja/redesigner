import path from "node:path";
import { writeFileSafe } from "../util/fs.js";
import type { CapturedScreen } from "./types.js";

/**
 * Generates a basic preview.html: a gallery of the captured app screens in phone-shaped
 * cards, so the surveyed flow can be eyeballed without spending model context. Mirrors the
 * web preview, adapted to "screens" (no per-page HTML; a hierarchy link when available).
 */
export async function writeMobilePreview(
  outAbs: string,
  screens: CapturedScreen[],
  meta: { appId: string; platform: string; device: string; auth: string },
): Promise<void> {
  const cards = screens
    .map(
      (s) => `  <article class="card">
    <header><strong>${escapeHtml(s.label)}</strong></header>
    <a href="${s.screenshot}" target="_blank" title="view full">
      <img loading="lazy" src="${s.screenshot}" alt="${escapeHtml(s.label)}" />
    </a>
    <footer>
      <a href="${s.screenshot}" target="_blank">full screenshot</a>${
        s.hierarchy ? ` · <a href="${s.hierarchy}" target="_blank">hierarchy</a>` : ""
      }
    </footer>
  </article>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>redesigner · mobile preview — ${escapeHtml(meta.appId)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; background: #0b0b0c; color: #e8e8ea; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { opacity: .6; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .card { background: #151517; border: 1px solid #26262a; border-radius: 18px; overflow: hidden; }
  .card header { padding: 10px 12px; border-bottom: 1px solid #26262a; }
  .card img { width: 100%; display: block; background: #000; }
  .card footer { padding: 8px 12px; font-size: 12px; opacity: .7; }
  a { color: #7aa2ff; text-decoration: none; }
</style>
</head>
<body>
  <h1>Mobile survey preview</h1>
  <div class="meta">${escapeHtml(meta.appId)} · ${escapeHtml(meta.platform)} · device ${escapeHtml(
    meta.device,
  )} · access: ${escapeHtml(meta.auth)} · ${screens.length} screen(s)</div>
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
