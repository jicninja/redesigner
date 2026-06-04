# Trend-aware redesign + optional aesthetic reference — design

**Date:** 2026-06-04
**Component:** `skills/redesigner` (orchestration in `SKILL.md` + small engine touches)
**Status:** approved for planning

## Problem

`redesigner` step 8 ("Redesign questions") offers a **hardcoded** style list
(`minimal / corporate / playful / dark`). It is static, dates badly, and is not
grounded in what is actually trending in UI/UX. There is also no way for the user
to point at a web/app they like and have its aesthetic inform the redesign.

We want the redesign to be **trend-aware** (style options derived from the current
state of the art, discovered dynamically) and to optionally accept an **aesthetic
reference** (a web URL or a mobile app) that inspires look-and-feel only.

## Goals

- Discover current UI/UX trends **dynamically**, building the source whitelist
  itself from an authority rubric (no hardcoded list of sources or of trends).
- Recommend which discovered trends fit the **specific surveyed site**, not just
  list global trends.
- Replace the hardcoded style question with **options generated from the
  discovered trends**, each carrying concrete design tokens.
- Let the user optionally provide an **aesthetic reference** (web or mobile),
  captured lightly (style only, never a content crawl), influencing aesthetics
  only — content and structure still come from the surveyed target.
- Reuse the existing **subagent + artifacts** patterns; keep engine changes minimal.

## Non-goals

- No caching of the trend report (runs every time; freshness handling is a
  possible later add, explicitly out of scope here).
- The reference does **not** influence structure/navigation — aesthetic only.
- No automated tests (prototype mode per project convention; verify with
  typecheck/build). See `[[no-testing]]`.

## Design

### A. New step 7.5 — Trend discovery (subagent)

Runs **automatically** after the UX audit (step 7) and before the style question
(step 8). Delegated to a **subagent with clean context + web search**.

The subagent does two things:

1. **Discover global trends** using the dynamic-whitelist prompt: it builds its own
   source whitelist from an **authority rubric** (primary design systems / official
   release notes / conference talks score highest; curated juried galleries and
   data-backed research next; SEO listicles discarded), detects **circularity**
   (pages citing each other count as one source; climb to the primary source), and
   requires a trend to appear in **≥2 independent sources** (one primary/curated).
   Anchored to the environment date (e.g. June 2026).
2. **Recommend fit for THIS site**: it receives `visual-style.md`, `tokens.json`
   and `uiux-expert-review.md`, and ranks which discovered trends suit this product.

**Artifacts written:**

- `redesigner-artifacts/reports/ui-trends.md` — human-readable report.
- `redesigner-artifacts/trends.json` — structured. Each trend:
  `{ nombre, estado (emergente|en_auge|maduro|en_declive), ship_en_produccion,
  descripcion, rasgos_visuales[], design_tokens_clave{}, cuando_usar,
  cuando_evitar, ejemplos_referencia[], fuentes[], tipo_fuentes[], confianza }`,
  plus top-level `recomendadas_para_este_sitio[]` (ranked names),
  `_whitelist_construida[]` and `_meta { fecha_busqueda, criterio_corte,
  fuentes_descartadas_n }`.

The subagent returns a **short summary** (top trends + which fit this site), not
the dump.

### B. New step 7.6 — Optional aesthetic reference

Before the style question, offer (optional): *"do you have a web or app you like
aesthetically?"* Capture is **lightweight, style-only** — never a content crawl.

- **Web reference:** run the existing engine in a light mode — `capture
  --max-pages 1 --style-only` into a separate dir — yielding a few screenshots +
  tokens (palette / type / motion), **plus a `WebFetch`** of the URL for brand/vibe
  context. `--style-only` skips the crawl/asset-download/HTML-copy work and keeps
  screenshot + token extraction.
- **Mobile reference:** we do not install third-party apps; a subagent **searches
  the app store** (Google Play / App Store) for the app's **listing screenshots**
  and derives the aesthetic by VLM.

**Artifact:** `redesigner-artifacts/reference/` with `screenshots/` and
`reference.md` (palette, typography, density, motion, vibe). Influence is
**aesthetic only**.

### C. Step 8 reshaped — dynamic style options

Instead of the hardcoded list, the `AskUserQuestion` style options are **generated
from `trends.json`** (`recomendadas_para_este_sitio`, ranked), each option carrying
its `design_tokens_clave`. The "full revamp vs refinement" question stays. If a
reference was provided, add an option *"match the reference's aesthetic"*.

The chosen style(s) + reference + trend report flow into `redesign-brief.md`.

### D. Brief + build

`reports/redesign-brief.md` gains two sections:

- **Trend direction** — the chosen trend, its `design_tokens_clave`, and
  `cuando_evitar` caveats.
- **Reference aesthetic** — present only if a reference was given.

The step-9 build subagent already reads the brief; the chosen trend's
`design_tokens_clave` are the **starting point** it applies in `theme.css`.
Re-paletting is a `sed`-style sweep and the codegen has a known invalid
`rgba(var(--x-rgb), α)` emission — emit `rgb(var(--x) / α)` instead. See
`[[redisgner-retheme-tokens]]`.

### E. Mobile mirror (section M)

The same two steps apply to the mobile pipeline: trend discovery (7.5) with a
**mobile lens** (touch targets, thumb zones, native nav patterns), and the
reference (7.6) defaulting to the app-store-screenshots path. Dynamic styles feed
the mobile brief and the Expo scaffold theme.

## Files touched

- `skills/redesigner/SKILL.md` — add steps 7.5, 7.6; rewrite step 8 to dynamic
  options; enrich the step-8 brief description; mirror in section M (M.4 / M.5).
- `skills/redesigner/src/report/md-templates.ts` — add `ui-trends.md` and
  `reference.md` skeletons to the generated report set.
- `skills/redesigner/src/mobile/md-templates.ts` — same skeletons for mobile.
- `skills/redesigner/bin/capture.ts` + `src/capture/index.ts` (and `config.ts`) —
  add a `--style-only` flag: capture screenshot + tokens for a single page, skip
  crawl / asset download / HTML copy.
- New runtime artifacts (no code to define them; written by subagents): `trends.json`,
  `reference/`.

## Verification

- `npm --prefix skills/redesigner run` typecheck / build passes (tsx/tsc).
- `capture --style-only --max-pages 1 <url>` produces `reference/` with a
  screenshot + `tokens.json` and no crawl.
- A dry run of the orchestration: trends subagent writes `trends.json`; step 8
  offers options derived from it.
- No automated test suite (prototype mode).

## Open questions

None blocking. Possible later adds (out of scope): trend-report freshness/cache,
reference-driven structural inspiration.
