import path from "node:path";
import { readdirSync } from "node:fs";
import { writeJson } from "../util/fs.js";
import { log } from "../util/log.js";
import type { DesignTokens } from "../capture/tokens.js";
import { decodePng, luminance, rgbToHex, saturation } from "./image.js";

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

/** Target sampled-pixel budget per screen (keeps large screenshots fast). */
const SAMPLE_BUDGET = 40_000;

/**
 * Derive design tokens from the captured screenshots. Mobile has no DOM/CSS, so the palette
 * is extracted from PIXELS: every screen is sampled, colors are quantized into 5-bit/channel
 * buckets, and the most frequent buckets become the palette. Roles (background, text, accent)
 * are inferred from frequency + luminance + saturation.
 *
 * Output is the same `DesignTokens` shape as the web path (so design-tokens.md and the
 * scaffold theme can consume it). The typography/spacing/shadow arrays stay empty — they
 * can't be derived from pixels and are left for the VLM/redesign step.
 */
export async function buildMobileTokens(outAbs: string): Promise<DesignTokens> {
  const screensDir = path.join(outAbs, "screens");
  const files = readdirSync(screensDir)
    .filter((f) => /\.png$/i.test(f))
    .sort();

  const buckets = new Map<number, Bucket>();
  for (const f of files) {
    let img: ReturnType<typeof decodePng>;
    try {
      img = decodePng(path.join(screensDir, f));
    } catch {
      continue;
    }
    const { width, height, data } = img;
    const stride = Math.max(1, Math.round(Math.sqrt((width * height) / SAMPLE_BUDGET)));
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue; // skip transparent
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bk = buckets.get(key);
        if (bk) {
          bk.count++;
          bk.r += r;
          bk.g += g;
          bk.b += b;
        } else {
          buckets.set(key, { count: 1, r, g, b });
        }
      }
    }
  }

  // Representative color per bucket = average of its members.
  const ranked = [...buckets.values()]
    .map((bk) => ({
      count: bk.count,
      r: Math.round(bk.r / bk.count),
      g: Math.round(bk.g / bk.count),
      b: Math.round(bk.b / bk.count),
    }))
    .sort((a, b) => b.count - a.count);

  const totalSamples = ranked.reduce((s, c) => s + c.count, 0) || 1;
  const colors = ranked.slice(0, 16).map((c) => ({ value: rgbToHex(c.r, c.g, c.b), count: c.count }));
  const backgrounds = ranked.slice(0, 6).map((c) => ({ value: rgbToHex(c.r, c.g, c.b), count: c.count }));

  const dominantBackground = ranked[0] ? rgbToHex(ranked[0].r, ranked[0].g, ranked[0].b) : undefined;
  // Primary text: the highest-contrast frequent bucket against the background. On a DARK theme
  // text is light, on a LIGHT theme it's dark — pick by the background's luminance (theme-aware),
  // not by assuming dark text.
  const bgLum = ranked[0] ? luminance(ranked[0].r, ranked[0].g, ranked[0].b) : 255;
  const darkTheme = bgLum < 128;
  const frequentTop = ranked
    .slice(0, 24)
    .filter((c) => c.count / totalSamples > 0.002)
    .sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b));
  const text = darkTheme ? frequentTop[frequentTop.length - 1] : frequentTop[0];
  const primaryText = text ? rgbToHex(text.r, text.g, text.b) : undefined;
  // Accents: saturated, mid-luminance, frequent colors that read as brand/CTA.
  const accentCandidates = ranked
    .slice(0, 40)
    .filter((c) => {
      const l = luminance(c.r, c.g, c.b);
      return saturation(c.r, c.g, c.b) > 0.35 && l > 25 && l < 230;
    })
    .slice(0, 5)
    .map((c) => rgbToHex(c.r, c.g, c.b));

  const tokens: DesignTokens = {
    colors,
    backgrounds,
    fontFamilies: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    spacing: [],
    radii: [],
    shadows: [],
    roles: { dominantBackground, primaryText, accentCandidates },
  };

  await writeJson(path.join(outAbs, "tokens.json"), tokens);
  log.info(
    `Mobile tokens: ${colors.length} palette colors from ${files.length} screen(s); ` +
      `bg ${dominantBackground ?? "?"}, text ${primaryText ?? "?"}, ${accentCandidates.length} accent(s).`,
  );
  return tokens;
}
