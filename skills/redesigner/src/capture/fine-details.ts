import path from "node:path";
import * as csstree from "css-tree";
import type { Page } from "playwright";
import { writeJson, ensureDir } from "../util/fs.js";
import { log } from "../util/log.js";

/** How many hover/focus elements are captured at runtime (time cap). */
const RUNTIME_CAP = 24;

interface ParsedCss {
  hoverSelectors: string[];
  focusSelectors: string[];
  transitions: { selector: string; value: string }[];
  animations: { selector: string; value: string }[];
  keyframes: { name: string; css: string }[];
}

/** Strips pseudo-classes from a selector so it can be matched in the DOM. */
function basify(selector: string): string {
  return selector
    .replace(/::?[a-z-]+(\([^)]*\))?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCss(css: string): ParsedCss {
  const res: ParsedCss = {
    hoverSelectors: [],
    focusSelectors: [],
    transitions: [],
    animations: [],
    keyframes: [],
  };
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(css);
  } catch {
    return res;
  }

  const seenHover = new Set<string>();
  const seenFocus = new Set<string>();

  csstree.walk(ast, {
    visit: "Rule",
    enter(node) {
      if (node.type !== "Rule" || node.prelude.type !== "SelectorList") return;
      const selectorText = csstree.generate(node.prelude);

      const hasHover = /:hover\b/.test(selectorText);
      const hasFocus = /:focus(-visible|-within)?\b/.test(selectorText);

      if (hasHover) {
        for (const part of selectorText.split(",")) {
          if (!/:hover\b/.test(part)) continue;
          const base = basify(part);
          if (base && !seenHover.has(base)) {
            seenHover.add(base);
            res.hoverSelectors.push(base);
          }
        }
      }
      if (hasFocus) {
        for (const part of selectorText.split(",")) {
          if (!/:focus/.test(part)) continue;
          const base = basify(part);
          if (base && !seenFocus.has(base)) {
            seenFocus.add(base);
            res.focusSelectors.push(base);
          }
        }
      }

      // transition/animation declarations within the rule.
      csstree.walk(node.block, {
        visit: "Declaration",
        enter(decl) {
          if (decl.type !== "Declaration") return;
          const prop = decl.property.toLowerCase();
          const value = csstree.generate(decl.value);
          if (prop === "transition" || prop.startsWith("transition-")) {
            res.transitions.push({ selector: basify(selectorText), value });
          }
          if (prop === "animation" || prop.startsWith("animation-")) {
            res.animations.push({ selector: basify(selectorText), value });
          }
        },
      });
    },
  });

  // @keyframes.
  csstree.walk(ast, {
    visit: "Atrule",
    enter(node) {
      if (node.type !== "Atrule" || !/keyframes$/i.test(node.name)) return;
      const name = node.prelude ? csstree.generate(node.prelude) : "(anon)";
      const css = csstree.generate(node);
      res.keyframes.push({ name, css });
    },
  });

  return res;
}

/** Captures the before/after state of a pseudo (hover|focus) at runtime. */
async function capturePseudo(
  page: Page,
  selectors: string[],
  pseudo: "hover" | "focus",
  outAbs: string,
): Promise<unknown[]> {
  const dir = path.join(outAbs, "screenshots", pseudo);
  await ensureDir(dir);
  const results: unknown[] = [];
  const props = ["color", "background-color", "border-color", "box-shadow", "transform", "opacity", "text-decoration"];

  let n = 0;
  for (const sel of selectors) {
    if (n >= RUNTIME_CAP) break;
    let loc;
    try {
      loc = page.locator(sel).first();
      if ((await loc.count()) === 0 || !(await loc.isVisible())) continue;
    } catch {
      continue;
    }

    try {
      const before = await loc.evaluate((el, p) => {
        const cs = getComputedStyle(el as HTMLElement);
        return Object.fromEntries((p as string[]).map((k) => [k, cs.getPropertyValue(k)]));
      }, props);

      if (pseudo === "hover") await loc.hover({ timeout: 2000 });
      else await loc.focus({ timeout: 2000 });
      await page.waitForTimeout(250);

      const after = await loc.evaluate((el, p) => {
        const cs = getComputedStyle(el as HTMLElement);
        return Object.fromEntries((p as string[]).map((k) => [k, cs.getPropertyValue(k)]));
      }, props);

      const shot = path.join("screenshots", pseudo, `${n}.png`);
      await loc.screenshot({ path: path.join(outAbs, shot) }).catch(() => {});

      // Only save if there was a visible change.
      const diff = props.filter((k) => (before as any)[k] !== (after as any)[k]);
      results.push({ selector: sel, screenshot: shot, before, after, changed: diff });
      n++;
    } catch {
      continue;
    }
  }
  return results;
}

/**
 * Extracts fine details: hover/focus (pixels + style diff), transitions and
 * @keyframes (declarative). Runs on the current page.
 */
export async function extractFineDetails(
  page: Page,
  outAbs: string,
  combinedCss: string,
): Promise<void> {
  const parsed = parseCss(combinedCss);
  log.info(
    `Details: ${parsed.hoverSelectors.length} hover, ${parsed.focusSelectors.length} focus, ` +
      `${parsed.keyframes.length} @keyframes, ${parsed.transitions.length} transitions.`,
  );

  await writeJson(path.join(outAbs, "css", "transitions.json"), parsed.transitions);
  await writeJson(path.join(outAbs, "css", "animations.json"), {
    animations: parsed.animations,
    keyframes: parsed.keyframes,
  });

  const hover = await capturePseudo(page, parsed.hoverSelectors, "hover", outAbs);
  const focus = await capturePseudo(page, parsed.focusSelectors, "focus", outAbs);

  await writeJson(path.join(outAbs, "css", "hover-states.json"), { hover, focus });
}
