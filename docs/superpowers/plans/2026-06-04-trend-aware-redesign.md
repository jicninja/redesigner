# Trend-aware Redesign + Optional Aesthetic Reference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `redesigner` discover current UI/UX trends dynamically (subagent-built source whitelist), offer style options generated from those trends, and optionally take a lightweight aesthetic reference (web or mobile app).

**Architecture:** The heavy lifting is orchestration in `SKILL.md` (new steps 7.5 trends, 7.6 reference; step 8 rewritten to dynamic options; mobile mirror in section M), backed by small engine touches: a `--style-only` capture flag for the web reference, and two new report skeletons (`ui-trends.md`, `reference.md`) plus an enriched `redesign-brief.md` in both the web and mobile template sets. Trends/reference data live as runtime artifacts (`trends.json`, `reference/`) written by subagents — no code defines them.

**Tech Stack:** TypeScript (ESM, `tsx`), `commander`, `zod`, Playwright. Verify with `npm run typecheck` (`tsc --noEmit`). **No automated tests** — this project is prototype-mode (per `no-testing` convention); verify with typecheck + a functional run.

**Conventions:** `SKILL_DIR` = `skills/redesigner`. All `npm` commands run with `--prefix "skills/redesigner"`. Commit after each task.

---

## File structure

- `skills/redesigner/src/config.ts` — add `styleOnly` flag to the capture schema.
- `skills/redesigner/bin/capture.ts` — expose `--style-only` on the `capture` command.
- `skills/redesigner/src/capture/index.ts` — branch the pipeline on `styleOnly` (single page, skip crawl/assets/logo/skeletons).
- `skills/redesigner/src/report/md-templates.ts` — add `ui-trends.md` + `reference.md`, enrich `redesign-brief.md` (web).
- `skills/redesigner/src/mobile/md-templates.ts` — same two skeletons + brief enrichment (mobile lens).
- `skills/redesigner/SKILL.md` — steps 7.5, 7.6, rewritten step 8, mobile mirror (section M), Rules bullet.
- `README.md` — short mention of the new steps.

---

## Task 1: `--style-only` capture flag (engine)

**Files:**
- Modify: `skills/redesigner/src/config.ts:26-29`
- Modify: `skills/redesigner/bin/capture.ts:23` and `:27-36`
- Modify: `skills/redesigner/src/capture/index.ts` (asset attach, crawl branch, guards)

- [ ] **Step 1: Add `styleOnly` to the config schema**

In `skills/redesigner/src/config.ts`, replace:

```ts
  captureTrace: z.coerce.boolean().default(false),
  // Maximum time per page (ms).
  pageTimeout: z.coerce.number().int().positive().default(30_000),
```

with:

```ts
  captureTrace: z.coerce.boolean().default(false),
  // Light "style only" capture: single page screenshot + tokens, no crawl/assets/logo.
  // Used to capture an aesthetic reference site (look & feel only).
  styleOnly: z.coerce.boolean().default(false),
  // Maximum time per page (ms).
  pageTimeout: z.coerce.number().int().positive().default(30_000),
```

- [ ] **Step 2: Expose the flag on the CLI**

In `skills/redesigner/bin/capture.ts`, after the `--capture-trace` option (line 23), add:

```ts
  .option("--style-only", "light style-only capture: single page screenshot + tokens, no crawl/assets/logo (for an aesthetic reference)", false)
```

Then in the same `capture` action's `buildCaptureConfig({...})` call, add `styleOnly: opts.styleOnly,` right after `captureTrace: opts.captureTrace,`:

```ts
      const config = buildCaptureConfig({
        url: opts.url,
        loginUrl: opts.loginUrl,
        out: opts.out,
        maxPages: opts.maxPages,
        viewport: opts.viewport,
        headless: opts.headless,
        captureTrace: opts.captureTrace,
        styleOnly: opts.styleOnly,
        pageTimeout: opts.pageTimeout,
      });
```

- [ ] **Step 3: Skip asset download when style-only**

In `skills/redesigner/src/capture/index.ts`, replace:

```ts
  const assets = new AssetCollector(config.outAbs);
  assets.attach(session.context);
```

with:

```ts
  const assets = new AssetCollector(config.outAbs);
  if (!config.styleOnly) assets.attach(session.context);
```

- [ ] **Step 4: Branch crawl vs single-page capture**

In `skills/redesigner/src/capture/index.ts`, replace:

```ts
    // Non-destructive crawl, capturing each page.
    const startUrl = page.url();
    const { visited, skipped } = await crawl(
      page,
      startUrl,
      { maxPages: config.maxPages, pageTimeout: config.pageTimeout },
      {
        onPage: async (p, url) => {
          const art = await capturePage(p, url, config.outAbs);
          captured.push(art);
        },
      },
    );
    log.success(`Crawl: ${visited.length} pages, ${skipped.length} skipped.`);
```

with:

```ts
    // Non-destructive crawl, capturing each page. In style-only mode we grab
    // just the start page (aesthetic reference — no link-following).
    const startUrl = page.url();
    let skipped: { url: string; reason: string }[] = [];
    if (config.styleOnly) {
      const art = await capturePage(page, startUrl, config.outAbs);
      captured.push(art);
      log.success("Style-only capture: 1 page.");
    } else {
      const res = await crawl(
        page,
        startUrl,
        { maxPages: config.maxPages, pageTimeout: config.pageTimeout },
        {
          onPage: async (p, url) => {
            const art = await capturePage(p, url, config.outAbs);
            captured.push(art);
          },
        },
      );
      skipped = res.skipped;
      log.success(`Crawl: ${res.visited.length} pages, ${res.skipped.length} skipped.`);
    }
```

- [ ] **Step 5: Guard asset-rewrite, fine-details, logo and skeletons**

In `skills/redesigner/src/capture/index.ts`, wrap the asset-rewrite block. Replace:

```ts
    // Rewrite saved HTML/CSS → local assets (offline) + <base> fallback.
    try {
      await rewriteCapturedAssets(
        config.outAbs,
        captured.map((p) => ({ html: p.html, url: p.url, slug: p.slug })),
        sheetNames,
        assets.map(),
        warnings,
      );
    } catch (err) {
      warnings.push(`asset rewrite: ${String(err).slice(0, 120)}`);
    }
    warnings.push(...assets.getWarnings());

    // Fine details (hover/focus/transitions/keyframes) on the first page.
    try {
      await extractFineDetails(page, config.outAbs, combinedCss);
    } catch (err) {
      warnings.push(`fine details: ${String(err).slice(0, 120)}`);
    }

    // Logo.
    let logoCount = 0;
    try {
      logoCount = await detectLogo(session.context, captured, config.outAbs);
    } catch (err) {
      warnings.push(`logo: ${String(err).slice(0, 120)}`);
    }
```

with:

```ts
    // Rewrite saved HTML/CSS → local assets (offline) + <base> fallback.
    // Skipped in style-only mode (no assets downloaded, no offline mock needed).
    if (!config.styleOnly) {
      try {
        await rewriteCapturedAssets(
          config.outAbs,
          captured.map((p) => ({ html: p.html, url: p.url, slug: p.slug })),
          sheetNames,
          assets.map(),
          warnings,
        );
      } catch (err) {
        warnings.push(`asset rewrite: ${String(err).slice(0, 120)}`);
      }
      warnings.push(...assets.getWarnings());
    }

    // Fine details (hover/focus/transitions/keyframes) on the first page.
    let logoCount = 0;
    if (!config.styleOnly) {
      try {
        await extractFineDetails(page, config.outAbs, combinedCss);
      } catch (err) {
        warnings.push(`fine details: ${String(err).slice(0, 120)}`);
      }

      // Logo.
      try {
        logoCount = await detectLogo(session.context, captured, config.outAbs);
      } catch (err) {
        warnings.push(`logo: ${String(err).slice(0, 120)}`);
      }
    }
```

Then guard the report skeletons. Replace:

```ts
    // Report skeletons for Claude to fill in.
    await writeReportSkeletons(config.outAbs, config.url);
```

with:

```ts
    // Report skeletons for Claude to fill in. Style-only reference captures don't
    // get their own reports — they feed reports/reference.md in the main artifacts dir.
    if (!config.styleOnly) {
      await writeReportSkeletons(config.outAbs, config.url);
    }
```

- [ ] **Step 6: Typecheck**

Run: `npm --prefix "skills/redesigner" run typecheck`
Expected: PASS (no errors). The previously block-scoped `visited`/`skipped` are gone; `skipped` is now declared once and `logoCount` is declared before its first use.

- [ ] **Step 7: Functional run (style-only)**

Run:
```bash
npm --prefix "skills/redesigner" run capture -- --url "https://stripe.com" --out "/tmp/ref-test" --style-only
```
Expected: finishes fast; `/tmp/ref-test` contains `screenshots/`, `tokens.json`, `manifest.json`, `preview.html`; `manifest.json` has `pagesVisited: 1`; there is **no** `reports/` directory and **no** `assets/` directory. Clean up: `rm -rf /tmp/ref-test`.

- [ ] **Step 8: Commit**

```bash
git add skills/redesigner/src/config.ts skills/redesigner/bin/capture.ts skills/redesigner/src/capture/index.ts
git commit -m "feat(redesigner): --style-only capture for aesthetic reference sites

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Web report skeletons — `ui-trends.md`, `reference.md`, enriched brief

**Files:**
- Modify: `skills/redesigner/src/report/md-templates.ts` (the `files` map, ~line 13 and the `redesign-brief.md` entry ~line 83)

- [ ] **Step 1: Add the `ui-trends.md` and `reference.md` skeletons**

In `skills/redesigner/src/report/md-templates.ts`, the `files` object currently starts with `"site-overview.md": ...`. Add these two entries at the top of the object (immediately after the opening `const files: Record<string, string> = {`):

```ts
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
```

- [ ] **Step 2: Enrich `redesign-brief.md` with Trend direction + Reference aesthetic**

In the same file, replace the `redesign-brief.md` entry:

```ts
    "redesign-brief.md": `# Redesign brief

> Date: ${today}

## Chosen direction
TODO (Claude): full revamp vs refinement + style chosen by the user.

## Proposed improvements
```

with:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix "skills/redesigner" run typecheck`
Expected: PASS.

- [ ] **Step 4: Functional check (skeletons wired)**

Run: `grep -c "ui-trends.md\|reference.md\|Trend direction" skills/redesigner/src/report/md-templates.ts`
Expected: `3` (one match per added marker: the two new skeleton keys + the new brief section).

- [ ] **Step 5: Commit**

```bash
git add skills/redesigner/src/report/md-templates.ts
git commit -m "feat(redesigner): web report skeletons for trends + aesthetic reference

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Mobile report skeletons (mirror, mobile lens)

**Files:**
- Modify: `skills/redesigner/src/mobile/md-templates.ts` (the `files` map ~line 14 and the `redesign-brief.md` entry ~line 84)

- [ ] **Step 1: Add `ui-trends.md` and `reference.md` (mobile lens)**

In `skills/redesigner/src/mobile/md-templates.ts`, add these two entries at the top of the `files` object (immediately after `const files: Record<string, string> = {`):

```ts
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
```

- [ ] **Step 2: Enrich the mobile `redesign-brief.md`**

In the same file, replace:

```ts
    "redesign-brief.md": `# Redesign brief (mobile)

> Date: ${today}

## Chosen direction
TODO (Claude): full revamp vs refinement + style chosen by the user.

## Target stack
```

with:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix "skills/redesigner" run typecheck`
Expected: PASS.

- [ ] **Step 4: Functional check**

Run: `grep -c "ui-trends.md\|reference.md\|Trend direction" skills/redesigner/src/mobile/md-templates.ts`
Expected: `3`.

- [ ] **Step 5: Commit**

```bash
git add skills/redesigner/src/mobile/md-templates.ts
git commit -m "feat(redesigner): mobile report skeletons for trends + aesthetic reference

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: SKILL.md — step 7.5 (trend discovery subagent)

**Files:**
- Modify: `skills/redesigner/SKILL.md` (insert between the end of step 7 and `## 8. Redesign questions`)

- [ ] **Step 1: Insert step 7.5**

In `skills/redesigner/SKILL.md`, find the line `## 8. Redesign questions` and insert the following block **immediately before** it:

````markdown
## 7.5 Discover current UI/UX trends — via SUBAGENT

**Before asking the user about style**, ground the options in what is actually trending.
**Delegate to a subagent** (Agent tool) with a clean context **and web search**. Pass it the
current date, the `redesigner-artifacts` paths (`reports/visual-style.md`, `tokens.json`,
`reports/uiux-expert-review.md`) and these instructions. The subagent MUST:

1. **Build its own source whitelist** from an authority rubric — do NOT hand it a list:
   - Highest: primary sources — official design systems (Apple HIG, Material), release
     notes, conference talks (WWDC, Config, Google I/O).
   - Next: curated juried galleries (awards) and data-backed research ("state of" reports,
     UX labs).
   - Discard: SEO listicles with no author, content >18 months old, affiliate farms.
   - Detect **circularity**: if several pages just cite each other, count them as one and
     climb to the primary source.
2. **Admit a trend only if it appears in ≥2 independent sources**, at least one primary/curated.
   Classify each: status (emerging/rising/mature/declining) and **ships-in-production vs
   gallery-demo** (kinetic type, heavy glass, etc. often die on a11y/perf).
3. **Recommend which trends fit THIS site/app** using `visual-style.md` + `tokens.json` +
   the UX audit — ranked.
4. Write `redesigner-artifacts/reports/ui-trends.md` (human-readable) **and**
   `redesigner-artifacts/trends.json` (structured): an array of trends, each
   `{ nombre, estado, ship_en_produccion, descripcion, rasgos_visuales[],
   design_tokens_clave{}, cuando_usar, cuando_evitar, ejemplos_referencia[], fuentes[],
   tipo_fuentes[], confianza }`, plus top-level `recomendadas_para_este_sitio[]` (ranked
   names), `_whitelist_construida[]` and `_meta { fecha_busqueda, criterio_corte,
   fuentes_descartadas_n }`.
5. Return a **short summary** (top trends + which fit this site) — NOT the dump.

Read the summary / `trends.json`; you'll use `recomendadas_para_este_sitio` to build the
style options in step 8.

````

- [ ] **Step 2: Verify the insert**

Run: `grep -n "7.5 Discover current UI/UX trends\|## 8. Redesign questions" skills/redesigner/SKILL.md`
Expected: the `7.5` line number is immediately before the `## 8.` line number.

- [ ] **Step 3: Commit**

```bash
git add skills/redesigner/SKILL.md
git commit -m "feat(redesigner): SKILL step 7.5 — dynamic UI trend discovery subagent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: SKILL.md — step 7.6 (reference) + rewritten step 8 (dynamic styles)

**Files:**
- Modify: `skills/redesigner/SKILL.md` (insert step 7.6 before step 8; replace the body of step 8)

- [ ] **Step 1: Insert step 7.6 (optional aesthetic reference)**

In `skills/redesigner/SKILL.md`, insert the following block **immediately before** `## 8. Redesign questions` (i.e. right after the step 7.5 block from Task 4):

````markdown
## 7.6 Optional aesthetic reference

Ask the user (optional, in their language): *"Is there a website or app whose look you'd
like the redesign to draw from? (optional)"* This influences **aesthetics only** — palette,
typography, density, motion. Content and structure still come from the surveyed target. If
they decline, skip to step 8.

- **Web reference (URL):** capture it lightly — single page, no crawl:
  ```bash
  npm --prefix "SKILL_DIR" run capture -- --url "<REF_URL>" --out "PROJECT/redesigner-artifacts/reference" --style-only
  ```
  Then `WebFetch` the URL for brand/vibe context. Look at
  `redesigner-artifacts/reference/screenshots/*` and `reference/tokens.json`.
- **Mobile app reference:** do NOT install it. Use a subagent (or WebSearch/WebFetch) to find
  the app's **store listing** (Google Play / App Store) and read its **screenshots** by VLM.

Fill `redesigner-artifacts/reports/reference.md`: what it is, the aesthetic to borrow
(palette/type/density/motion/vibe) and what NOT to copy (content/structure/brand). Carry this
into the step-8 brief as a **style reference only**.

````

- [ ] **Step 2: Replace the body of step 8 with dynamic options**

Find the step 8 block, which currently reads:

```markdown
## 8. Redesign questions

`AskUserQuestion` (multi if applicable):
- **Type**: full revamp vs refinement.
- **Style**: minimal / corporate / playful / dark / etc.
- **Priority**: which pages/components matter most.

With the answers + the UX audit, complete `reports/redesign-brief.md`: concrete improvements, component inventory, and the **motion plan** (map transitions/keyframes to `motion` variants).
```

Replace it entirely with:

```markdown
## 8. Redesign questions

`AskUserQuestion` (multi if applicable):
- **Type**: full revamp vs refinement.
- **Style**: build the options **dynamically from `trends.json`** —
  `recomendadas_para_este_sitio` (ranked), each labeled by its `nombre` with a one-line
  `descripcion`; do NOT use a hardcoded list. Prefer trends with `ship_en_produccion: true`.
  If a reference was captured in step 7.6, add an extra option **"Match the reference's
  aesthetic"**.
- **Priority**: which pages/components matter most.

With the answers + the UX audit + the chosen trend's `design_tokens_clave` + the reference
(if any), complete `reports/redesign-brief.md`: fill **Chosen direction**, **Trend direction**
(chosen trend + its tokens + `cuando_evitar` caveats — these seed `theme.css`), **Reference
aesthetic** (if provided), concrete improvements, component inventory, and the **motion plan**
(map transitions/keyframes to `motion` variants).
```

- [ ] **Step 3: Verify**

Run: `grep -n "7.6 Optional aesthetic reference\|dynamically from .trends.json\|Match the reference" skills/redesigner/SKILL.md`
Expected: three matches — the 7.6 heading, the dynamic-options line, and the reference option.

- [ ] **Step 4: Commit**

```bash
git add skills/redesigner/SKILL.md
git commit -m "feat(redesigner): SKILL step 7.6 reference + dynamic trend-based style options

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SKILL.md — mobile mirror (section M) + Rules

**Files:**
- Modify: `skills/redesigner/SKILL.md` (section M.4 and the Rules list)

- [ ] **Step 1: Mirror the steps in the mobile lens (M.4)**

In `skills/redesigner/SKILL.md`, find the step-8 bullet inside section M.4, which reads:

```markdown
- **Step 8 (questions)**: confirm direction/style and, in `redesign-brief.md`, set the **target stack**. Default for a native app is **React Native / Expo** (use M.5). Mobile-first React web is only for a web mockup.
```

Replace it with:

```markdown
- **Step 7.5 (trends)**: run the trend-discovery subagent with a **mobile lens** — its whitelist favors platform design systems (iOS HIG / Material) and platform talks; trends are judged for touch targets, thumb zones, native nav and gestures. Writes the same `trends.json` + `reports/ui-trends.md`.
- **Step 7.6 (reference)**: for a **mobile** reference, don't install the app — find its **store listing** (Play / App Store) and read its screenshots by VLM; for a web reference use `capture --style-only`. Fill `reports/reference.md` (aesthetic only).
- **Step 8 (questions)**: build the **style options dynamically from `trends.json`** (`recomendadas_para_este_sitio`), add a "Match the reference's aesthetic" option if a reference was captured, then in `redesign-brief.md` set the **target stack** (default native app = **React Native / Expo**, use M.5) and fill the **Trend direction** / **Reference aesthetic** sections.
```

- [ ] **Step 2: Add a Rules bullet**

In the `## Rules` list at the end of `skills/redesigner/SKILL.md`, add this bullet after the line that starts `- Prefer \`preview.html\``:

```markdown
- **Trends are discovered, not hardcoded**: the step-7.5 subagent builds its own source whitelist from an authority rubric and writes `trends.json`; the step-8 style options come from it. The optional reference (step 7.6) is **aesthetic only** — never relayed as content/structure.
```

- [ ] **Step 3: Verify**

Run: `grep -n "Step 7.5 (trends)\|Trends are discovered, not hardcoded" skills/redesigner/SKILL.md`
Expected: two matches (M.4 mobile bullet + Rules bullet).

- [ ] **Step 4: Commit**

```bash
git add skills/redesigner/SKILL.md
git commit -m "feat(redesigner): mobile mirror + rule for trend-aware redesign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: README — document the new steps

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Locate where the pipeline steps are documented**

Run: `grep -n "UX audit\|auditor\|Redesign questions\|paso 8\|step 8\|7\\." README.md | head -20`
Expected: prints the lines around the pipeline description. Identify the spot describing the flow between the UX audit and the redesign questions.

- [ ] **Step 2: Add a short paragraph**

Insert, right after the UX-audit description and before the redesign-questions/style description, a paragraph in the README's existing language (match the surrounding prose — this repo's README is bilingual EN/ES with an antes/después split):

```markdown
Before asking about style, **redesigner discovers the current UI/UX trends dynamically**: a subagent with web search builds its own source whitelist from an authority rubric (official design systems and juried galleries over SEO listicles, de-duping circular citations), writes `trends.json`, and the style options offered to you are generated from the trends that fit your site — not a hardcoded list. You can also (optionally) point it at a **reference website or app**, captured lightly for look & feel only (`--style-only` for web; store-listing screenshots for mobile), to steer the aesthetic without touching content or structure.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document trend-aware redesign + aesthetic reference in README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Typecheck the whole engine**

Run: `npm --prefix "skills/redesigner" run typecheck`
Expected: PASS.

- [ ] **Confirm all skeletons present**

Run: `grep -l "ui-trends.md" skills/redesigner/src/report/md-templates.ts skills/redesigner/src/mobile/md-templates.ts`
Expected: both files listed.

- [ ] **Confirm SKILL.md ordering**

Run: `grep -n "## 7.5 \|## 7.6 \|## 8. Redesign questions" skills/redesigner/SKILL.md`
Expected: 7.5 < 7.6 < 8 in line order.

---

## Notes for the implementer

- **No tests.** This project is prototype-mode (`no-testing`). Verification = `tsc --noEmit` + the functional `grep`/run checks above. Do not add a test framework.
- **Known codegen gotcha:** when seeding theme tokens from a trend, emit `rgb(var(--x) / α)`, never `rgba(var(--x-rgb), α)` — the latter is invalid and is a recorded bug.
- **Subagent data shapes** (`trends.json`, `reference/`) are produced at runtime by the orchestration; no TypeScript defines them. The engine only gains `--style-only` and the new skeletons.
