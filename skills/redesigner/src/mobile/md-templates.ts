import path from "node:path";
import { existsSync } from "node:fs";
import { writeFileSafe } from "../util/fs.js";

/**
 * Pre-writes the MD report skeletons (headers + TODO) for the MOBILE pipeline, worded for a
 * native app survey (screens, not pages; touch/native patterns, not CSS). Mirrors the web
 * skeletons so the same downstream steps work. Does not overwrite existing files.
 */
export async function writeMobileReportSkeletons(outAbs: string, appId: string): Promise<void> {
  const reportsDir = path.join(outAbs, "reports");
  const today = new Date().toISOString().slice(0, 10);

  const files: Record<string, string> = {
    "ui-trends.md": `# UI/UX trends (current — mobile lens)

> Discovered dynamically by a subagent with web search. Whitelist built from an authority
> rubric — NOT hardcoded. See trends.json for structured data.
> Date: ${today}

## How sources were chosen
TODO (subagent): constructed whitelist + scoring. Authority rubric: official platform
design systems (iOS HIG / Material) and conference talks (WWDC, Google I/O) score highest;
curated galleries and data-backed research next; SEO listicles discarded. Collapse circular
citations.

## Trends in play (mobile)
TODO: per trend — name; status; ships-in-production?; description; visual traits; when to
use / avoid; sources; confidence. Mobile lens: touch targets, thumb zones, native nav
patterns (tabs/stack/drawer), gestures, safe areas.

## Recommended for THIS app
TODO: ranked subset that fits the surveyed app (given visual-style.md, tokens.json,
uiux-expert-review.md), each with its concrete design tokens.
`,
    "reference.md": `# Aesthetic reference (optional)

> An app/web the user likes — captured lightly for LOOK & FEEL only.
> Mobile reference: store-listing screenshots (Play / App Store) found by the subagent (VLM)
> — we do NOT install third-party apps.
> Web reference: reference/ from \`capture --style-only\` + a WebFetch of the URL.
> Date: ${today}

## Reference
TODO (Claude): what it is and the store URL / app.

## Aesthetic to borrow
TODO: palette, typography, density, motion, overall vibe.

## What NOT to copy
TODO: content, structure, brand marks — aesthetic only.
`,
    "site-overview.md": `# App overview

> Surveyed app: ${appId}
> Date: ${today}

## What is it / what does it do?
TODO (Claude): describe the app's purpose from the captured screens.

## Main screens / flows
TODO: list the detected screens (home, list, detail, profile, settings, etc.).

## Audience and domain
TODO: type of user and inferred domain.
`,
    "visual-style.md": `# Visual style

> Date: ${today}

## Layout and navigation
TODO (Claude): screen structure, navigation pattern (tabs, stack, drawer), density, safe areas.

## Color
TODO: palette, mood, contrast. (See tokens.json — derived from screen pixels.)

## Typography
TODO: families/feel inferred by eye from the screens (no CSS on mobile).

## Motion / gestures
TODO: transitions, gestures and micro-interactions observed across screens.

## Recurring components
TODO: buttons, cards, lists, inputs, tab bars, sheets, FABs.
`,
    "design-tokens.md": `# Design tokens

> Source: tokens.json (palette extracted from screen PIXELS — mobile has no CSS).
> Date: ${today}

## Colors
TODO (Claude): note roles (background, surface, text, accent) based on tokens.json.

## Typography
TODO: type scale/weights estimated by eye from the screens.

## Spacing / radii / elevation
TODO: spacing rhythm, corner radii and elevation/shadow observed in the screens.
`,
    "logo-analysis.md": `# Logo analysis

> Candidate: logo/logo.png (header crop of the first screen) · logo/candidates.json
> Date: ${today}

## Description
TODO (Claude, VLM): describe the logo/app mark (type, colors, style) from the header crop.

## Quality verdict
TODO: is it basic/generic? default font? a real concept? (yes/no + why)

## Recommendation
TODO: redesign / refine / keep.
`,
    "logo-prompt.md": `# Logo redesign prompt (gpt-image)

> Only filled in if the logo is rated as basic.
> Date: ${today}

TODO (Claude): refined prompt for gpt-image, ready to paste by hand.
Include: brand concept, style, palette, typography, transparent background, variations.
`,
    "redesign-brief.md": `# Redesign brief (mobile)

> Date: ${today}

## Chosen direction
TODO (Claude): full revamp vs refinement + style chosen by the user.

## Trend direction
TODO (Claude): the trend chosen from ui-trends.md / trends.json (mobile lens), its design
tokens, and its \`when to avoid\` caveats. These tokens seed theme.ts.

## Reference aesthetic (if provided)
TODO (Claude): look & feel borrowed from reference.md (palette/type/density/motion).
Aesthetic ONLY — content and structure stay from the surveyed app.

## Target stack
TODO: React Native / Expo vs mobile-first React web (decided before the scaffold step).

## Proposed improvements
TODO: concrete changes toward a cleaner, more native-feeling UI (touch targets, thumb zones, hierarchy).

## Component inventory
TODO: screens and components to build in the redesign.

## Motion plan
TODO: map observed transitions/gestures to animation variants.
`,
  };

  for (const [name, content] of Object.entries(files)) {
    const dest = path.join(reportsDir, name);
    if (existsSync(dest)) continue; // don't clobber
    await writeFileSafe(dest, content);
  }
}
