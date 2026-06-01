import type { Page } from "playwright";
import { classifyLink, normalizeUrl } from "../util/url.js";
import { log } from "../util/log.js";

export interface RawLink {
  href: string;
  text: string;
  aria: string;
}

/**
 * Extracts navigable links from the DOM. ONLY looks at `<a href>` — it does not
 * touch buttons or trigger actions (read-only crawler).
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
  /** Called for each visited page; should capture artifacts. */
  onPage: (page: Page, url: string) => Promise<void>;
}

export interface CrawlResult {
  visited: string[];
  skipped: { url: string; reason: string }[];
}

/**
 * Same-origin BFS, strictly read-only. Navigates by direct URL
 * (`page.goto`) over the `<a href>` links that pass the non-destructive filter.
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
      skipped.push({ url: current, reason: `navigation failed: ${String(err).slice(0, 80)}` });
      continue;
    }

    visited.add(current);
    log.info(`[${visited.size}/${opts.maxPages}] ${current}`);

    try {
      await cb.onPage(page, current);
    } catch (err) {
      log.warn(`capture failed at ${current}: ${String(err).slice(0, 120)}`);
    }

    // Collect and filter links (non-destructive, same-origin).
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
        if (decision.reason === "destructive/mutating action")
          skipped.push({ url: link.href, reason: decision.reason });
        continue;
      }
      const norm = normalizeUrl(link.href);
      if (!visited.has(norm) && !queue.includes(norm)) queue.push(norm);
    }
  }

  return { visited: [...visited], skipped };
}
