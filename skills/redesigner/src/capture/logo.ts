import path from "node:path";
import type { BrowserContext } from "playwright";
import { writeFileSafe, writeJson, ensureDir } from "../util/fs.js";
import { log } from "../util/log.js";
import type { PageArtifacts } from "./page-capture.js";

interface LogoCandidate {
  type: "img" | "svg";
  src?: string;
  score: number;
  selector: string;
  width: number;
  height: number;
  alt: string;
  page: string;
}

/** In-page heuristic: finds and scores logo candidates. */
function findCandidatesInPage() {
  const results: Omit<LogoCandidate, "page">[] = [];
  const top = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.top < 200 && r.left < window.innerWidth / 2;
  };
  const hint = /logo|brand|marca|isotipo|imagotipo/i;

  const consider = (el: Element) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    let score = 0;
    const inHeader = !!el.closest("header, nav, [role='banner']");
    if (inHeader) score += 5;
    const homeLink = el.closest('a[href="/"], a[href=""]');
    if (homeLink) score += 4;
    const attrs = `${el.className} ${el.id} ${el.getAttribute("alt") ?? ""} ${el.getAttribute("aria-label") ?? ""}`;
    if (hint.test(attrs)) score += 4;
    if (top(el)) score += 3;
    // logos tend to be wide but not huge
    if (rect.width >= 60 && rect.width <= 320 && rect.height <= 120) score += 2;

    const tag = el.tagName.toLowerCase();
    const selector =
      tag + (el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(/\s+/)[0]}` : "");
    if (tag === "img") {
      results.push({
        type: "img",
        src: (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src,
        score,
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        alt: el.getAttribute("alt") ?? "",
      });
    } else if (tag === "svg") {
      results.push({
        type: "svg",
        score,
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        alt: el.getAttribute("aria-label") ?? "",
      });
    }
  };

  document.querySelectorAll("header img, header svg, nav img, nav svg, [role='banner'] img, [role='banner'] svg, a[href='/'] img, a[href='/'] svg").forEach(consider);
  // Fallback: any img/svg with a hint in its attributes.
  document.querySelectorAll("img, svg").forEach((el) => {
    const attrs = `${el.className} ${el.id} ${el.getAttribute("alt") ?? ""}`;
    if (hint.test(attrs)) consider(el);
  });

  // og:image and favicon as a low-priority fallback.
  const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const icon = document.querySelector('link[rel~="icon"], link[rel="apple-touch-icon"]')?.getAttribute("href");
  return { results, og, icon };
}

/**
 * Detects the logo: navigates to the first captured page, scores candidates,
 * downloads them (img via fetch, svg via screenshot) and picks the best as logo.png.
 */
export async function detectLogo(
  context: BrowserContext,
  captured: PageArtifacts[],
  outAbs: string,
): Promise<number> {
  if (captured.length === 0) return 0;
  const logoDir = path.join(outAbs, "logo");
  const candDir = path.join(logoDir, "candidates");
  await ensureDir(candDir);

  const page = await context.newPage();
  const all: LogoCandidate[] = [];
  let ogImage: string | undefined;
  let favicon: string | undefined;

  // Look at up to 3 pages to detect logo recurrence.
  for (const art of captured.slice(0, 3)) {
    try {
      await page.goto(art.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      const { results, og, icon } = await page.evaluate(findCandidatesInPage);
      ogImage ??= og ? new URL(og, art.url).toString() : undefined;
      favicon ??= icon ? new URL(icon, art.url).toString() : undefined;
      for (const r of results) all.push({ ...r, page: art.url });
    } catch {
      continue;
    }
  }

  // Recurrence: candidates with the same src/selector across pages score higher.
  const recur = new Map<string, number>();
  for (const c of all) {
    const key = c.src ?? c.selector;
    recur.set(key, (recur.get(key) ?? 0) + 1);
  }
  for (const c of all) {
    const key = c.src ?? c.selector;
    if ((recur.get(key) ?? 0) > 1) c.score += 3;
  }

  // Dedup by key, keeping the one with the highest score.
  const byKey = new Map<string, LogoCandidate>();
  for (const c of all) {
    const key = c.src ?? c.selector;
    const prev = byKey.get(key);
    if (!prev || c.score > prev.score) byKey.set(key, c);
  }
  const ranked = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, 6);

  // Download candidates.
  let saved = 0;
  const savedMeta: (LogoCandidate & { file: string })[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    const ext = c.type === "svg" ? "png" : guessExt(c.src);
    const file = `${i}.${ext}`;
    const dest = path.join(candDir, file);
    try {
      if (c.type === "img" && c.src) {
        const resp = await context.request.get(c.src);
        if (resp.ok()) {
          await writeFileSafe(dest, Buffer.from(await resp.body()));
          saved++;
          savedMeta.push({ ...c, file });
        }
      } else {
        // SVG: rasterize via a screenshot of the bounding box.
        await page.goto(c.page, { waitUntil: "domcontentloaded", timeout: 20000 });
        const loc = page.locator(c.selector).first();
        if ((await loc.count()) > 0) {
          await loc.screenshot({ path: dest });
          saved++;
          savedMeta.push({ ...c, file });
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback: if nothing was saved, use favicon/og.
  if (saved === 0 && (favicon || ogImage)) {
    const url = ogImage ?? favicon!;
    try {
      const resp = await context.request.get(url);
      if (resp.ok()) {
        const file = `0.${guessExt(url)}`;
        await writeFileSafe(path.join(candDir, file), Buffer.from(await resp.body()));
        savedMeta.push({
          type: "img",
          src: url,
          score: 1,
          selector: "favicon/og",
          width: 0,
          height: 0,
          alt: "fallback",
          page: captured[0].url,
          file,
        });
        saved++;
      }
    } catch {
      /* noop */
    }
  }

  await writeJson(path.join(logoDir, "candidates.json"), {
    candidates: savedMeta,
    ogImage,
    favicon,
  });

  // logo.png = best candidate, RASTERIZED (element screenshot) so the VLM can
  // see it (works equally for img/png/jpg/svg).
  if (savedMeta.length > 0) {
    const best = savedMeta[0];
    let rasterized = false;
    if (best.selector && best.selector !== "favicon/og") {
      try {
        await page.goto(best.page, { waitUntil: "domcontentloaded", timeout: 20000 });
        const loc = page.locator(best.selector).first();
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          await loc.screenshot({ path: path.join(logoDir, "logo.png") });
          rasterized = true;
        }
      } catch {
        /* fallback below */
      }
    }
    if (!rasterized) {
      // Fallback: download the binary (png/jpg) or copy the saved file.
      try {
        const { readFile } = await import("node:fs/promises");
        const buf = await readFile(path.join(candDir, best.file));
        await writeFileSafe(path.join(logoDir, "logo.png"), buf);
      } catch {
        /* noop */
      }
    }
  }

  await page.close().catch(() => {});
  log.info(`Logo: ${saved} candidates saved.`);
  return saved;
}

function guessExt(src?: string): string {
  if (!src) return "png";
  const m = src.match(/\.(png|jpe?g|gif|webp|svg|ico)(\?|#|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}
