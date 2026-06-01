import path from "node:path";
import type { BrowserContext } from "playwright";
import { writeFileSafe, shortHash } from "../util/fs.js";

/** Image/font/icon extensions that we treat as a downloadable asset. */
const ASSET_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot)(\?|#|$)/i;

/** Defensive cap per asset (~8 MB): anything larger is skipped. */
const MAX_BYTES = 8 * 1024 * 1024;

/** content-type → extension, for when the URL has no extension. */
function extFromContentType(ct: string): string {
  const c = ct.split(";")[0].trim();
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "font/woff2": "woff2",
    "font/woff": "woff",
    "font/ttf": "ttf",
    "font/otf": "otf",
    "application/font-woff2": "woff2",
    "application/font-woff": "woff",
    "application/x-font-ttf": "ttf",
  };
  return map[c] ?? "bin";
}

/**
 * Collects IMAGES/FONTS/ICONS by intercepting network RESPONSES (like
 * `CssCollector`, immune to CORS: it reads the response body). Saves them to
 * disk with a stable name and exposes a `map` of absolute URL → relative local
 * path, so the rewriter keeps the "before" faithful and offline.
 */
export class AssetCollector {
  private assets = new Map<string, string>(); // urlAbs -> assets/<host>/<base>__<hash>.<ext>
  private warnings: string[] = [];

  constructor(private readonly outAbs: string) {}

  attach(context: BrowserContext): void {
    context.on("response", async (res) => {
      try {
        const url = res.url();
        if (this.assets.has(url) || !/^https?:/i.test(url)) return;
        if (!res.ok()) return;
        const ct = (res.headers()["content-type"] ?? "").toLowerCase();
        const isAsset =
          ct.startsWith("image/") ||
          ct.startsWith("font/") ||
          ASSET_EXT.test(url);
        if (!isAsset) return;

        const body = await res.body();
        if (body.length > MAX_BYTES) {
          this.warnings.push(
            `asset >${Math.round(MAX_BYTES / 1024 / 1024)}MB skipped: ${url.slice(0, 120)}`,
          );
          return;
        }
        const rel = this.localPath(url, ct);
        await writeFileSafe(path.join(this.outAbs, rel), body);
        this.assets.set(url, rel);
      } catch {
        // unreadable responses (redirects, aborted, etc.) are ignored
      }
    });
  }

  /** Stable name `assets/<host>/<base>__<hash>.<ext>` (POSIX, relative to out). */
  private localPath(url: string, ct: string): string {
    let host = "asset";
    let base = "asset";
    let ext = extFromContentType(ct);
    try {
      const u = new URL(url);
      host = u.hostname.replace(/[^a-z0-9.-]/gi, "-") || "asset";
      const name = u.pathname.split("/").pop() ?? "";
      const dot = name.lastIndexOf(".");
      if (dot > 0) {
        base = name.slice(0, dot).replace(/[^a-zA-Z0-9._-]+/g, "-") || "asset";
        const fromUrl = name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (fromUrl) ext = fromUrl;
      } else if (name) {
        base = name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "asset";
      }
    } catch {
      /* noop */
    }
    return path.posix.join("assets", host, `${base}__${shortHash(url)}.${ext}`);
  }

  /** Map of absolute URL → relative local path (defensive copy). */
  map(): Map<string, string> {
    return new Map(this.assets);
  }

  /** Accumulated warnings (assets too large, etc.). */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /** Number of assets actually downloaded. */
  count(): number {
    return this.assets.size;
  }
}
