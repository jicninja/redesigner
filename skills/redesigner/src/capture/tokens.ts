import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeJson } from "../util/fs.js";
import { log } from "../util/log.js";

interface Counter {
  [value: string]: number;
}

function bump(c: Counter, v: string | undefined) {
  if (!v) return;
  const val = v.trim();
  if (!val || val === "none" || val === "normal" || val === "auto" || val === "0px") return;
  c[val] = (c[val] ?? 0) + 1;
}

function ranked(c: Counter, limit = 24): { value: string; count: number }[] {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function isColor(v: string): boolean {
  return /^(#|rgb|hsl)/i.test(v.trim());
}

export interface DesignTokens {
  colors: { value: string; count: number }[];
  backgrounds: { value: string; count: number }[];
  fontFamilies: { value: string; count: number }[];
  fontSizes: { value: string; count: number }[];
  fontWeights: { value: string; count: number }[];
  lineHeights: { value: string; count: number }[];
  spacing: { value: string; count: number }[];
  radii: { value: string; count: number }[];
  shadows: { value: string; count: number }[];
  roles: {
    dominantBackground?: string;
    primaryText?: string;
    accentCandidates: string[];
  };
}

/**
 * Agrega los computed styles muestreados (css/computed/*.json) en tokens de
 * diseño con frecuencias, e infiere algunos roles (fondo dominante, texto, acento).
 */
export async function buildTokens(outAbs: string, _combinedCss: string): Promise<DesignTokens> {
  const computedDir = path.join(outAbs, "css", "computed");
  const colors: Counter = {};
  const backgrounds: Counter = {};
  const fontFamilies: Counter = {};
  const fontSizes: Counter = {};
  const fontWeights: Counter = {};
  const lineHeights: Counter = {};
  const spacing: Counter = {};
  const radii: Counter = {};
  const shadows: Counter = {};

  if (existsSync(computedDir)) {
    const files = (await readdir(computedDir)).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      let data: Record<string, Record<string, string>[]>;
      try {
        data = JSON.parse(await readFile(path.join(computedDir, f), "utf8"));
      } catch {
        continue;
      }
      for (const samples of Object.values(data)) {
        for (const s of samples) {
          bump(colors, s["color"]);
          bump(backgrounds, s["background-color"]);
          bump(fontFamilies, s["font-family"]);
          bump(fontSizes, s["font-size"]);
          bump(fontWeights, s["font-weight"]);
          bump(lineHeights, s["line-height"]);
          for (const p of ["margin", "padding", "gap"]) {
            (s[p] ?? "").split(/\s+/).forEach((v) => bump(spacing, v));
          }
          bump(radii, s["border-radius"]);
          bump(shadows, s["box-shadow"]);
        }
      }
    }
  }

  const rankedColors = ranked(colors).filter((c) => isColor(c.value));
  const rankedBg = ranked(backgrounds).filter((c) => isColor(c.value));

  const tokens: DesignTokens = {
    colors: rankedColors,
    backgrounds: rankedBg,
    fontFamilies: ranked(fontFamilies, 8),
    fontSizes: ranked(fontSizes),
    fontWeights: ranked(fontWeights, 8),
    lineHeights: ranked(lineHeights, 10),
    spacing: ranked(spacing, 16),
    radii: ranked(radii, 10),
    shadows: ranked(shadows, 10),
    roles: {
      dominantBackground: rankedBg[0]?.value,
      primaryText: rankedColors[0]?.value,
      // acentos: colores frecuentes pero no el texto principal, saturados.
      accentCandidates: rankedColors
        .slice(1, 6)
        .map((c) => c.value),
    },
  };

  await writeJson(path.join(outAbs, "tokens.json"), tokens);
  log.info(
    `Tokens: ${tokens.colors.length} colores, ${tokens.fontFamilies.length} fuentes, ${tokens.fontSizes.length} tamaños.`,
  );
  return tokens;
}
