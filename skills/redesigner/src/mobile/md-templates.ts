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
