/**
 * Single source of truth for the redesigner output layout.
 *
 * Everything a run produces lives under ONE parent folder (`redesign/`) inside the
 * user's project, so a redesign never scatters sibling folders across the project root:
 *
 *   <PROJECT>/redesign/
 *     ├── artifacts/        survey artifacts (screenshots, html, css, tokens, reports)
 *     ├── artifacts-after/  post-redesign mobile re-survey (optional)
 *     ├── app/              React + Vite + Tailwind redesign (web)
 *     ├── html/             static HTML mock export (web)
 *     ├── mobile/           React Native + Expo redesign (mobile)
 *     └── flows/            Maestro flows authored for the mobile survey
 */

/** Parent folder that holds the whole redesign under the project. */
export const REDESIGN_DIR = "redesign";

export const ARTIFACTS_SUBDIR = "artifacts";
export const ARTIFACTS_AFTER_SUBDIR = "artifacts-after";
export const APP_SUBDIR = "app";
export const HTML_SUBDIR = "html";
export const MOBILE_SUBDIR = "mobile";
export const FLOWS_SUBDIR = "flows";

/**
 * Default artifacts location, relative to the project cwd (POSIX-style; Node
 * normalizes per-OS). Used as the CLI default for capture/mobile `--out` and
 * scaffold `--artifacts`.
 */
export const DEFAULT_ARTIFACTS_DIR = `./${REDESIGN_DIR}/${ARTIFACTS_SUBDIR}`;
