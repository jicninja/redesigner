import path from "node:path";
import type { Page } from "playwright";
import { writeFileSafe, writeJson, slugFromPathname } from "../util/fs.js";

/** Propiedades de computed style que aportan al "design system". */
const STYLE_PROPS = [
  "color",
  "background-color",
  "background-image",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "margin",
  "padding",
  "gap",
  "border-radius",
  "border",
  "border-color",
  "box-shadow",
  "opacity",
  "transition",
  "animation",
];

/** Selectores representativos que se muestrean por página. */
const SAMPLE_SELECTORS = [
  "body",
  "header",
  "nav",
  "main",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "a",
  "button",
  "input",
  "select",
  "label",
  "ul",
  "li",
  "table",
  "section",
  "article",
  "[class*='card']",
  "[class*='btn']",
  "[class*='badge']",
];

export interface PageArtifacts {
  url: string;
  slug: string;
  title: string;
  screenshotFull: string;
  screenshotViewport: string;
  html: string;
}

/** Hace scroll para disparar contenido lazy, con tope de iteraciones. */
async function autoScroll(page: Page, maxSteps = 12): Promise<void> {
  await page.evaluate(async (steps: number) => {
    await new Promise<void>((resolve) => {
      let last = 0;
      let i = 0;
      const timer = setInterval(() => {
        const h = document.body.scrollHeight;
        window.scrollBy(0, window.innerHeight);
        i++;
        if (h === last || i >= steps) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
        last = h;
      }, 200);
    });
  }, maxSteps);
}

/** CSS inline (<style>, atributos style) + cssRules same-origin accesibles. */
async function collectInlineCss(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [];
    document
      .querySelectorAll("style")
      .forEach((s) => parts.push(s.textContent ?? ""));
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules; // lanza si es cross-origin
        for (const r of Array.from(rules)) parts.push(r.cssText);
      } catch {
        /* cross-origin: ya se captura por interceptación de red */
      }
    }
    return parts.filter(Boolean).join("\n");
  });
}

/** Muestrea computed styles de elementos representativos. */
async function sampleComputedStyles(
  page: Page,
): Promise<Record<string, Record<string, string>[]>> {
  return page.evaluate(
    ({ selectors, props }) => {
      const out: Record<string, Record<string, string>[]> = {};
      for (const sel of selectors) {
        let nodes: Element[] = [];
        try {
          nodes = Array.from(document.querySelectorAll(sel)).slice(0, 3);
        } catch {
          continue;
        }
        const samples: Record<string, string>[] = [];
        for (const el of nodes) {
          const cs = getComputedStyle(el as HTMLElement);
          const rec: Record<string, string> = {};
          for (const p of props) rec[p] = cs.getPropertyValue(p).trim();
          samples.push(rec);
        }
        if (samples.length) out[sel] = samples;
      }
      return out;
    },
    { selectors: SAMPLE_SELECTORS, props: STYLE_PROPS },
  );
}

/**
 * Captura una página: scroll lazy, screenshots full+viewport, HTML, CSS inline
 * y muestreo de computed styles. El CSS de red lo junta el CssCollector aparte.
 */
export async function capturePage(
  page: Page,
  url: string,
  outAbs: string,
): Promise<PageArtifacts> {
  const slug = slugFromPathname(new URL(url).pathname + new URL(url).hash);
  await autoScroll(page);
  await page.waitForTimeout(300);

  const screenshotFull = path.join("screenshots", `${slug}.full.png`);
  const screenshotViewport = path.join("screenshots", `${slug}.viewport.png`);

  await page.screenshot({
    path: path.join(outAbs, screenshotFull),
    fullPage: true,
  });
  await page.screenshot({ path: path.join(outAbs, screenshotViewport) });

  const html = await page.content();
  await writeFileSafe(path.join(outAbs, "html", `${slug}.html`), html);

  const inlineCss = await collectInlineCss(page);
  if (inlineCss.trim())
    await writeFileSafe(
      path.join(outAbs, "css", "inline", `${slug}.css`),
      inlineCss,
    );

  const computed = await sampleComputedStyles(page);
  await writeJson(path.join(outAbs, "css", "computed", `${slug}.json`), computed);

  const title = await page.title();

  return {
    url,
    slug,
    title,
    screenshotFull,
    screenshotViewport,
    html: path.join("html", `${slug}.html`),
  };
}
