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
    "ui-trends.md": `# UI/UX trends (current)

> Discovered dynamically by a subagent with web search. The source whitelist is
> built from an authority rubric — NOT hardcoded. See trends.json for structured data.
> Date: ${today}

## How sources were chosen
TODO (subagent): the constructed whitelist and why each source scored. Authority rubric:
primary design systems / official release notes / conference talks score highest; curated
juried galleries and data-backed research next; SEO listicles discarded. Collapse circular
citations (pages citing each other = one source; climb to the primary).

## Trends in play
TODO: per trend — name; status (emerging/rising/mature/declining); ships-in-production?;
one-line description; key visual traits; when to use / when to avoid; sources; confidence.

## Recommended for THIS site
TODO: ranked subset that fits the surveyed product (given visual-style.md, tokens.json,
uiux-expert-review.md), each with its concrete design tokens.
`,
    "reference.md": `# Aesthetic reference (optional)

> A web/app the user likes — captured lightly for LOOK & FEEL only. Content and structure
> still come from the surveyed target.
> Web: reference/ (screenshots + tokens.json from \`capture --style-only\`) + a WebFetch of the URL.
> Mobile: store-listing screenshots found by the subagent (VLM).
> Date: ${today}

## Reference
TODO (Claude): what it is and the URL / app.

## Aesthetic to borrow
TODO: palette, typography, density, motion, overall vibe.

## What NOT to copy
TODO: content, structure, brand marks — aesthetic only.
`,
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

## Trend direction
TODO (Claude): the trend chosen from ui-trends.md / trends.json, its design tokens, and
its \`when to avoid\` caveats. These tokens seed theme.css. Emit colors as
\`rgb(var(--x) / α)\`, never \`rgba(var(--x-rgb), α)\`.

## Reference aesthetic (if provided)
TODO (Claude): the look & feel borrowed from reference.md (palette/type/density/motion).
Aesthetic ONLY — content and structure stay from the surveyed site.

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
