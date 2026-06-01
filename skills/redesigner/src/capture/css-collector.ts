import path from "node:path";
import type { BrowserContext } from "playwright";
import { writeFileSafe, shortHash } from "../util/fs.js";

/**
 * Colecta hojas de estilo interceptando las RESPONSES de la red. Esto es
 * inmune a CORS (lee el body de la respuesta, no `cssRules`), así captura
 * CSS de CDNs y otros orígenes.
 */
export class CssCollector {
  private sheets = new Map<string, string>(); // url -> css

  attach(context: BrowserContext): void {
    context.on("response", async (res) => {
      try {
        const ct = res.headers()["content-type"] ?? "";
        const url = res.url();
        const isCss = ct.includes("text/css") || /\.css(\?|$)/i.test(url);
        if (!isCss || !res.ok()) return;
        if (this.sheets.has(url)) return;
        const body = await res.text();
        if (body.trim()) this.sheets.set(url, body);
      } catch {
        // respuestas que no se pueden leer (redirects, etc.) se ignoran
      }
    });
  }

  /** Devuelve todo el CSS colectado concatenado (para parseo de tokens/hover). */
  combinedCss(): string {
    return [...this.sheets.values()].join("\n\n");
  }

  entries(): { url: string; css: string }[] {
    return [...this.sheets.entries()].map(([url, css]) => ({ url, css }));
  }

  /** Escribe cada stylesheet a disco con nombre estable `<host>__<hash>.css`. */
  async writeAll(cssDir: string): Promise<string[]> {
    const written: string[] = [];
    for (const [url, css] of this.sheets) {
      let host = "inline";
      let base = "sheet";
      try {
        const u = new URL(url);
        host = u.hostname.replace(/[^a-z0-9.-]/gi, "-");
        base = path.basename(u.pathname).replace(/\.css$/i, "") || "sheet";
      } catch {
        /* noop */
      }
      const name = `${host}__${base}__${shortHash(url)}.css`;
      const file = path.join(cssDir, name);
      await writeFileSafe(file, `/* source: ${url} */\n${css}`);
      written.push(name);
    }
    return written;
  }
}
