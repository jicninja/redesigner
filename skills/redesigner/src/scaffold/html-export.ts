import path from "node:path";
import { writeFileSafe, writeJson } from "../util/fs.js";
import { log } from "../util/log.js";
import { tokensToThemeCss } from "./theme.js";
import { tokensToFigma } from "./figma-tokens.js";
import type { DesignTokens } from "../capture/tokens.js";

export interface HtmlExportOptions {
  out: string;
  artifacts: string;
  tokens: DesignTokens;
}

/**
 * Export "mock HTML": un único HTML estático con Tailwind v4 (CDN browser) y
 * los tokens en un <style>@theme. Sirve como mock simple y como base para
 * importar a Figma con el plugin html.to.design. Además emite tokens.figma.json.
 */
export async function exportHtmlMock(opts: HtmlExportOptions): Promise<void> {
  const root = path.resolve(process.cwd(), opts.out, "redesign-html");
  const theme = tokensToThemeCss(opts.tokens);

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rediseño — mock</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style type="text/tailwindcss">
${theme}
  </style>
</head>
<body class="bg-surface text-text font-sans">
  <header class="sticky top-0 border-b border-black/10 backdrop-blur">
    <nav class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
      <span class="text-lg font-bold">Marca</span>
      <div class="flex gap-6 text-sm">
        <a href="#" class="opacity-80 hover:opacity-100">Inicio</a>
        <a href="#" class="opacity-80 hover:opacity-100">Productos</a>
        <a href="#" class="opacity-80 hover:opacity-100">Contacto</a>
      </div>
    </nav>
  </header>
  <main class="mx-auto max-w-5xl px-6 py-16">
    <h1 class="text-4xl font-bold tracking-tight">Rediseño</h1>
    <p class="mt-4 text-lg opacity-80">Mock estático generado por redesigner. Editá a mano o importá a Figma con html.to.design.</p>
    <div class="mt-8 flex gap-4">
      <button class="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-surface hover:opacity-90">Primario</button>
      <button class="rounded-lg border border-black/20 px-5 py-2.5 text-sm font-medium hover:bg-black/5">Secundario</button>
    </div>
    <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      ${[1, 2, 3]
        .map(
          (i) => `<div class="rounded-xl border border-black/10 p-6 shadow-md">
        <h3 class="text-lg font-semibold">Tarjeta ${i}</h3>
        <p class="mt-2 text-sm opacity-75">Contenido de ejemplo.</p>
      </div>`,
        )
        .join("\n      ")}
    </div>
  </main>
</body>
</html>
`;

  await writeFileSafe(path.join(root, "index.html"), html);
  await writeJson(path.join(root, "tokens.figma.json"), tokensToFigma(opts.tokens));
  log.success(`Mock HTML en: ${root}`);
  log.info("Abrí index.html en el navegador, o importalo a Figma con el plugin html.to.design.");
  log.info("tokens.figma.json es importable con el plugin Tokens Studio.");
}
