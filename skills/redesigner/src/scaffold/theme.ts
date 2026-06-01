import type { DesignTokens } from "../capture/tokens.js";

/** Normaliza un valor de color a algo usable como CSS var. */
function clean(v: string): string {
  return v.trim();
}

/**
 * Mapea los design tokens capturados a un bloque `@theme` de Tailwind v4
 * (CSS-first). Genera nombres semánticos + la paleta cruda como referencia.
 */
export function tokensToThemeCss(tokens: DesignTokens): string {
  const lines: string[] = [];
  lines.push("/* Generado por redesigner desde tokens.json del sitio original.");
  lines.push("   Ajustá los roles a mano: estos son los valores MÁS FRECUENTES,");
  lines.push("   no necesariamente los semánticamente correctos. */");
  lines.push("@theme {");

  // Roles semánticos inferidos.
  const r = tokens.roles;
  if (r.primaryText) lines.push(`  --color-text: ${clean(r.primaryText)};`);
  if (r.dominantBackground && !/rgba\(0, 0, 0, 0\)/.test(r.dominantBackground))
    lines.push(`  --color-surface: ${clean(r.dominantBackground)};`);
  if (r.accentCandidates[0]) lines.push(`  --color-primary: ${clean(r.accentCandidates[0])};`);
  if (r.accentCandidates[1]) lines.push(`  --color-accent: ${clean(r.accentCandidates[1])};`);

  // Paleta cruda como referencia (palette-1..n).
  tokens.colors.slice(0, 8).forEach((c, i) => {
    lines.push(`  --color-palette-${i + 1}: ${clean(c.value)}; /* x${c.count} */`);
  });

  // Tipografía.
  if (tokens.fontFamilies[0])
    lines.push(`  --font-sans: ${clean(tokens.fontFamilies[0].value)};`);
  if (tokens.fontFamilies[1])
    lines.push(`  --font-display: ${clean(tokens.fontFamilies[1].value)};`);

  // Escala tipográfica (font sizes ordenados).
  const sizes = tokens.fontSizes
    .map((s) => parseFloat(s.value))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const scaleNames = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
  sizes.slice(0, scaleNames.length).forEach((px, i) => {
    lines.push(`  --text-${scaleNames[i]}: ${px}px;`);
  });

  // Radios.
  tokens.radii.slice(0, 4).forEach((rad, i) => {
    const name = ["sm", "md", "lg", "xl"][i];
    lines.push(`  --radius-${name}: ${clean(rad.value)};`);
  });

  // Sombras.
  tokens.shadows.slice(0, 3).forEach((sh, i) => {
    const name = ["sm", "md", "lg"][i];
    lines.push(`  --shadow-${name}: ${clean(sh.value)};`);
  });

  lines.push("}");
  return lines.join("\n") + "\n";
}
