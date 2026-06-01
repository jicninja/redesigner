import type { DesignTokens } from "../capture/tokens.js";

/**
 * Convierte los design tokens a formato W3C Design Tokens / Tokens Studio,
 * importable a Figma con el plugin "Tokens Studio".
 */
export function tokensToFigma(tokens: DesignTokens): unknown {
  const color: Record<string, { value: string; type: "color" }> = {};
  tokens.colors.forEach((c, i) => {
    color[`palette-${i + 1}`] = { value: c.value, type: "color" };
  });
  if (tokens.roles.primaryText) color["text"] = { value: tokens.roles.primaryText, type: "color" };
  if (tokens.roles.dominantBackground)
    color["surface"] = { value: tokens.roles.dominantBackground, type: "color" };
  if (tokens.roles.accentCandidates[0])
    color["primary"] = { value: tokens.roles.accentCandidates[0], type: "color" };

  const fontSizes: Record<string, { value: string; type: "fontSizes" }> = {};
  tokens.fontSizes.forEach((s, i) => {
    fontSizes[`size-${i + 1}`] = { value: s.value, type: "fontSizes" };
  });

  const fontFamilies: Record<string, { value: string; type: "fontFamilies" }> = {};
  tokens.fontFamilies.forEach((f, i) => {
    fontFamilies[`family-${i + 1}`] = { value: f.value, type: "fontFamilies" };
  });

  const borderRadius: Record<string, { value: string; type: "borderRadius" }> = {};
  tokens.radii.forEach((r, i) => {
    borderRadius[`radius-${i + 1}`] = { value: r.value, type: "borderRadius" };
  });

  return {
    global: { color, fontSizes, fontFamilies, borderRadius },
    $metadata: { tokenSetOrder: ["global"] },
  };
}
