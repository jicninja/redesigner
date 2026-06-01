import path from "node:path";
import { existsSync } from "node:fs";
import { writeFileSafe } from "../util/fs.js";

/**
 * Pre-writes the MD reports as skeletons with headers + TODO so that
 * Claude fills them in. Does not overwrite if they already exist (to avoid clobbering work).
 */
export async function writeReportSkeletons(outAbs: string, url: string): Promise<void> {
  const reportsDir = path.join(outAbs, "reports");
  const today = new Date().toISOString().slice(0, 10);

  const files: Record<string, string> = {
    "site-overview.md": `# Site overview

> Surveyed site: ${url}
> Date: ${today}

## What is it / what does it do?
TODO (Claude): describe the product's purpose based on the HTML and the screenshots.

## Main sections / areas
TODO: list of detected sections (nav, dashboard, settings, etc.).

## Audience and domain
TODO: type of user and inferred industry.
`,
    "visual-style.md": `# Visual style

> Date: ${today}

## Layout and structure
TODO (Claude): grid, density, hierarchy, use of space.

## Color
TODO: palette, mood, contrast. (See tokens.json.)

## Typography
TODO: families, scale, weights, feel.

## Motion / animations
TODO: motion language (see css/transitions.json and css/animations.json), hovers (css/hover-states.json).

## Recurring components
TODO: buttons, cards, inputs, badges, modals.
`,
    "design-tokens.md": `# Design tokens

> Source: tokens.json (aggregated frequencies of computed styles).
> Date: ${today}

## Colors
TODO (Claude): note roles (background, text, accent, borders) based on tokens.json.

## Typography
TODO: type scale and weights.

## Spacing / radii / shadows
TODO: inferred spacing scale, radii and shadows.
`,
    "logo-analysis.md": `# Logo analysis

> Candidates: logo/candidates/  ·  logo/candidates.json
> Date: ${today}

## Description
TODO (Claude, VLM): describe the logo (type: wordmark/icon/combination, colors, style).

## Quality verdict
TODO: is it basic/generic? does it use a default font? does it have a concept? (yes/no + why)

## Recommendation
TODO: redesign / refine / keep.
`,
    "logo-prompt.md": `# Logo redesign prompt (gpt-image)

> Only filled in if the logo is rated as basic.
> Date: ${today}

TODO (Claude): refined prompt for gpt-image, ready to paste by hand.
Include: brand concept, style, palette, typography, transparent background, variations.
`,
    "redesign-brief.md": `# Redesign brief

> Date: ${today}

## Chosen direction
TODO (Claude): full revamp vs refinement + style chosen by the user.

## Proposed improvements
TODO: concrete list of changes toward a cleaner, more professional UI.

## Component inventory
TODO: components to build in the redesign (React + Tailwind + motion).

## Motion plan (Framer Motion)
TODO: map captured transitions/keyframes to \`motion\` variants (fadeUp, stagger, hover/tap, page transitions with AnimatePresence).
`,
  };

  for (const [name, content] of Object.entries(files)) {
    const dest = path.join(reportsDir, name);
    if (existsSync(dest)) continue; // don't clobber
    await writeFileSafe(dest, content);
  }
}
