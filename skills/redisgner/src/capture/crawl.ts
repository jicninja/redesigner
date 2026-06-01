import type { Page } from "playwright";
import { classifyLink, normalizeUrl } from "../util/url.js";
import { log } from "../util/log.js";

export interface RawLink {
  href: string;
  text: string;
  aria: string;
}

/**
 * Extrae los links navegables del DOM. SOLO mira `<a href>` — no toca botones
 * ni dispara acciones (crawler de lectura).
 */
export async function extractLinks(page: Page): Promise<RawLink[]> {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors.map((a) => ({
      href: (a as HTMLAnchorElement).href,
      text: (a.textContent ?? "").trim().slice(0, 80),
      aria: a.getAttribute("aria-label") ?? "",
    }));
  });
}

export interface CrawlCallbacks {
  /** Se llama por cada página visitada; debe capturar artefactos. */
  onPage: (page: Page, url: string) => Promise<void>;
}

export interface CrawlResult {
  visited: string[];
  skipped: { url: string; reason: string }[];
}

/**
 * BFS same-origin, estrictamente de solo lectura. Navega por URL directa
 * (`page.goto`) sobre los `<a href>` que pasan el filtro no-destructivo.
 */
export async function crawl(
  page: Page,
  startUrl: string,
  opts: { maxPages: number; pageTimeout: number },
  cb: CrawlCallbacks,
): Promise<CrawlResult> {
  const queue: string[] = [normalizeUrl(startUrl)];
  const visited = new Set<string>();
  const skipped: { url: string; reason: string }[] = [];

  while (queue.length > 0 && visited.size < opts.maxPages) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;

    try {
      await page.goto(current, {
        waitUntil: "domcontentloaded",
        timeout: opts.pageTimeout,
      });
      await page.waitForLoadState("networkidle", { timeout: opts.pageTimeout }).catch(() => {});
    } catch (err) {
      skipped.push({ url: current, reason: `navegación falló: ${String(err).slice(0, 80)}` });
      continue;
    }

    visited.add(current);
    log.info(`[${visited.size}/${opts.maxPages}] ${current}`);

    try {
      await cb.onPage(page, current);
    } catch (err) {
      log.warn(`captura falló en ${current}: ${String(err).slice(0, 120)}`);
    }

    // Recolectar y filtrar links (no destructivos, same-origin).
    let links: RawLink[] = [];
    try {
      links = await extractLinks(page);
    } catch {
      links = [];
    }

    for (const link of links) {
      const decision = classifyLink(link.href, current, {
        text: link.text,
        aria: link.aria,
      });
      if (!decision.follow) {
        if (decision.reason === "acción destructiva/mutante")
          skipped.push({ url: link.href, reason: decision.reason });
        continue;
      }
      const norm = normalizeUrl(link.href);
      if (!visited.has(norm) && !queue.includes(norm)) queue.push(norm);
    }
  }

  return { visited: [...visited], skipped };
}
