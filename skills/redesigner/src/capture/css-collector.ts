import path from "node:path";
import type { BrowserContext } from "playwright";
import { writeFileSafe, shortHash } from "../util/fs.js";

/**
 * Collects stylesheets by intercepting network RESPONSES. This is immune to
 * CORS (it reads the response body, not `cssRules`), so it captures CSS from
 * CDNs and other origins.
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
        // responses that can't be read (redirects, etc.) are ignored
      }
    });
  }

  /** Returns all collected CSS concatenated (for token/hover parsing). */
  combinedCss(): string {
    return [...this.sheets.values()].join("\n\n");
  }

  entries(): { url: string; css: string }[] {
    return [...this.sheets.entries()].map(([url, css]) => ({ url, css }));
  }

  /** Stable local name for a sheet: `<host>__<base>__<hash>.css`. */
  private localName(url: string): string {
    let host = "inline";
    let base = "sheet";
    try {
      const u = new URL(url);
      host = u.hostname.replace(/[^a-z0-9.-]/gi, "-");
      base = path.basename(u.pathname).replace(/\.css$/i, "") || "sheet";
    } catch {
      /* noop */
    }
    return `${host}__${base}__${shortHash(url)}.css`;
  }

  /** Writes each stylesheet to disk with a stable name `<host>__<hash>.css`. */
  async writeAll(cssDir: string): Promise<string[]> {
    const written: string[] = [];
    for (const [url, css] of this.sheets) {
      const name = this.localName(url);
      const file = path.join(cssDir, name);
      await writeFileSafe(file, `/* source: ${url} */\n${css}`);
      written.push(name);
    }
    return written;
  }

  /** Map absoluteUrl -> local path relative to out (`css/<name>`), for rewriting. */
  map(): Map<string, string> {
    const m = new Map<string, string>();
    for (const url of this.sheets.keys()) {
      m.set(url, path.posix.join("css", this.localName(url)));
    }
    return m;
  }
}
