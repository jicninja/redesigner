---
name: redesigner
description: Surveys a website/app with Playwright (MANUAL login + READ-ONLY crawl), captures screenshots, HTML, CSS, hovers/animations, detects the logo and extracts design tokens; builds a navigable mock of what was surveyed, adds a UX audit via subagent, then orchestrates the redesign with Claude (React + Tailwind + Framer Motion) and exports to Pencil, an HTML mock and Figma. Also surveys NATIVE MOBILE APPS by driving them with Maestro on a real device/emulator (MANUAL login on the device, READ-ONLY), deriving tokens/logo from the screen pixels and feeding the same analysis/redesign. Use when the user wants to survey/audit a site's style or redesign it. Triggers on "redesign", "survey this site", "scrape the style", "redesigner", and for mobile on "redesign this app", "mobile app", "native app", "Maestro".
---

# redesigner — survey and redesign a site

Hybrid pipeline: a Node/Playwright engine (deterministic, **read-only**) captures artifacts; you (Claude, with vision) do the analysis, the logo, the questions and the redesign. The heavy steps (navigable mock, UX audit, redesign build, exports) are **delegated to subagents** so they don't consume this conversation's context.

`SKILL_DIR` = this skill's directory (where `package.json` lives). `PROJECT` = the user's cwd.

## Capture source: web or mobile

There are **two capture sources** that both write the same `redesigner-artifacts/` and feed the same downstream steps:

- **Web** (default): a URL → the Playwright engine (steps 0–6 below).
- **Mobile**: a **native app** on a real device/emulator → the Maestro engine (section **M**). Route here when the user points at an app (package/bundle id, an installed app, "redesign this app", "mobile", "native", an Expo/React Native project).

Pick the source from what the user gives you. After capture, **steps 4 (navigable mock), 5–6 (analysis + logo), 7 (UX audit), 8 (questions), 9–9b (build + show/iterate) and 10 (exports) are SHARED** — they read `redesigner-artifacts/` regardless of source. Mobile just produces `screens/` instead of web `pages`, tokens from **pixels** instead of CSS, and uses a mobile lens (see section M).

## 0. Setup (first time)

If `SKILL_DIR/node_modules` doesn't exist, install dependencies:
```bash
npm --prefix "SKILL_DIR" install
```
(The `postinstall` downloads Playwright's Chromium.)

## 1. Interactive preflight (in the user's language)

1. Ask for the site **URL** if it wasn't provided.
2. **ALWAYS warn** (deliver this in the user's language): *"Login is MANUAL: if the site asks for a username and password, a browser window opens and you log in yourself, by hand. I never ask for or handle credentials. Even so, use a TEST account, never a production one. The crawler is read-only — it never deletes, edits or submits forms."*
3. **Never** ask for username/password over chat. You don't need to know in advance whether the site has a login: the engine detects it on its own and, if there is one, opens the browser so you can log in manually.

> Security: the engine **does not accept credentials** (there are no user/pass flags or env vars). The only login path is manual, in the visible window. This is intentional.

## 2. Capture (deterministic, read-only, manual login)

Always run **with `--no-headless`** (the browser must be visible in case a manual login appears):
```bash
npm --prefix "SKILL_DIR" run capture -- \
  --url "<URL>" --out "PROJECT/redesigner-artifacts" --max-pages 25 --no-headless
```
Launch it in the **background** (the browser stays open waiting for you to log in if there's a login). If the site asks for login, a Chromium window appears: tell the user to **log in by hand**; the engine detects on its own when they're in and continues the crawl (no need to touch the terminal). Useful flags: `--login-url`, `--max-pages`, `--viewport`.

When it finishes, read `redesigner-artifacts/manifest.json` (pages, `auth`, `warnings`, `skippedDestructive`). If `auth` is `failed: ...`, state the reason (e.g. manual-login timeout) and offer to retry.

## 3. Cheap scrape review (preview.html)

**Before spending context on images**, open the preview to eyeball what was captured:
```bash
open "PROJECT/redesigner-artifacts/preview.html"
```
It's a basic gallery (viewport screenshots + links to each page's HTML/full). Look there at what was surveyed. Only load specific screenshots with Read when you need fine visual detail — don't read them all.

## 4. Navigable mock of the surveyed site — via SUBAGENT

**Before analyzing and before asking for decisions**, generate a **navigable mock** of the site exactly as Playwright captured it, so the user can walk through what was surveyed view by view. **Delegate it to a subagent** (Agent tool) with a clean context. Pass it only the `redesigner-artifacts` path. The subagent must:

- Read `redesigner-artifacts/manifest.json` and the `screenshots/*.full.png`.
- Write `redesigner-artifacts/site-mock/index.html`: a **self-contained, navigable** HTML file (no server, just JS + relative paths to `../screenshots/*.full.png`). Simple structure: a side panel (or topbar) with the list of pages (by `title`/`slug` from the manifest) and a main area showing the **full screenshot** of the selected view; clicking a page in the list changes the view (a "view by view" mock). Lightweight and clear, no frameworks.
- Return a short summary (which pages it included), NOT the HTML dump.

Then open it for the user:
```bash
open "PROJECT/redesigner-artifacts/site-mock/index.html"
```
Tell them they can walk through the surveyed site view by view there.

## 5. Write the analysis reports

Fill in the skeletons in `redesigner-artifacts/reports/` (they already exist with TODOs):
- `site-overview.md` — what the site is/does (from HTML + screenshots).
- `visual-style.md` — layout, color, typography, density, motion language (look at `css/transitions.json`, `css/animations.json`, `css/hover-states.json`).
- `design-tokens.md` — note palette/scale roles from `tokens.json`.

## 6. Logo (VLM)

Look at `redesigner-artifacts/logo/logo.png` and `logo/candidates/` with Read. Complete `reports/logo-analysis.md`: type (wordmark/icon/combined), quality, **is it basic/generic?** (yes/no + why).

If it's **basic**:
1. `AskUserQuestion`: ask the user to explain the brand (values, audience, what sets it apart).
2. Compose a **refined prompt for gpt-image** (concept, style, palette from `tokens.json`, transparent background, variations) and write it to `reports/logo-prompt.md`. Show it to them: **the user runs it by hand** in gpt-image/ChatGPT (no API call). They'll drop the resulting logo into `redesign/src/assets/`.

## 7. Expert UX audit — via SUBAGENT

**Before asking the user for decisions**, add an expert eye. **Delegate to a subagent** (Agent tool) that acts as a **senior UI/UX and product designer**. Pass it the `redesigner-artifacts` paths (full screenshots + the `reports/*.md` already written). The subagent must:

- Review the screens and reports and produce an **actionable audit** in `redesigner-artifacts/reports/uiux-expert-review.md`, covering: Nielsen's heuristics, visual hierarchy, consistency (buttons/spacing/color), accessibility and contrast, density and legibility, navigation patterns, states (empty/loading/error), and **quick wins** vs **redesign opportunities**.
- Prioritize the recommendations (impact × effort) and, where applicable, map concrete problems to design solutions.
- Return a **short summary** (top findings and recommendations) — NOT the whole file.

Read `reports/uiux-expert-review.md` (or the summary) and **incorporate its recommendations** into your decisions and the step-9 brief.

## 8. Redesign questions

`AskUserQuestion` (multi if applicable):
- **Type**: full revamp vs refinement.
- **Style**: minimal / corporate / playful / dark / etc.
- **Priority**: which pages/components matter most.

With the answers + the UX audit, complete `reports/redesign-brief.md`: concrete improvements, component inventory, and the **motion plan** (map transitions/keyframes to `motion` variants).

## 9. Claude design (ALWAYS first) — via SUBAGENT

Generate the project base:
```bash
npm --prefix "SKILL_DIR" run scaffold -- --out "PROJECT" --artifacts "PROJECT/redesigner-artifacts"
```
This creates `PROJECT/redesign/` (React 19 + Vite 8 + Tailwind v4 + `motion@12`, tokens in `src/styles/theme.css`, variants in `src/lib/motion.ts`, component/page stubs).

The scaffold also generates the embedded **split mode**: `src/CompareShell.tsx`, a shell that **wraps the app** (`main.tsx` mounts `<CompareShell><App/></CompareShell>`). It compares the **original** site (the "before" side, an iframe served **offline** from `public/_original/` — copied from the `html/`, `assets/`, `css/` artifacts; page list in `src/lib/original.ts`) against the **real redesign** (the "after" side, the `App` itself rendered), with a curtain that by **default follows the mouse** and can be **pinned** (🖱️ button in the bar or click on the ⇔ handle; when pinned, the handle is draggable and hover/click over the redesign is freed). **Scroll** and the **view** (dropdown ↔ redesign route, via `route` in `src/lib/original.ts`) are synced between both sides. By **default** it shows the split; **double click** = only the new design fullscreen (hides the bar), another double click returns to the split. The subagent must NOT break the `CompareShell` mount or `public/_original/`.

Then **delegate the redesign build to a subagent** (Agent tool) to save context. The subagent must:
- Use the `frontend-design` skill.
- Read `reports/redesign-brief.md`, `visual-style.md`, `design-tokens.md`, `uiux-expert-review.md` and the relevant screenshots from the preview.
- Complete the components and pages in `PROJECT/redesign/`, using Tailwind v4 (`@theme`) and Framer Motion (`motion/react`) generously (entrance with `fadeUp`/`staggerContainer`, hover/tap with `hoverLift`, page transitions with `AnimatePresence`).
- Verify with `npm install && npm run build` inside `redesign/`.
- Return a short summary (what it built, what's left), NOT all the files.

`redesign/` is the **source of truth** for the exports.

## 9b. Show + iterate (MILESTONE — mandatory gate before exporting)

**Don't export until the user approves the redesign.** After the subagent builds:

1. **Show the redesign**. Bring up the project and take screenshots of the key screens:
   ```bash
   cd "PROJECT/redesign" && npm run dev   # (in background) or npm run build && npm run preview
   ```
   Take captures (with the skill's own Playwright or the `run` skill) of the main views on desktop and mobile, and show them to the user with Read. Otherwise, tell them the local URL (`http://localhost:5173`) so they can look at it.
1c. **Before/after split.** With the redesign running (`http://localhost:5173`), the `CompareShell` comparator is already embedded: the app starts by showing the **split** over the redesign.
   Explain to the user: **Split** is the default mode and the curtain by **default follows the mouse**; with the 🖱️ button (or clicking the ⇔ handle) you **pin** it to hover/click over the redesign, and you reposition it by **dragging** the handle. The `[Before] [Split] [After]` buttons pin one side (in Before the original stays interactive); **double click** shows only the new design fullscreen and another double click returns to Split; the dropdown picks which original page to compare and **navigates the redesign too**. **Scroll** is synced between sides. The "before" side is the original HTML copied to `redesign/public/_original/`; the "after" is the real redesign rendered. There's no separate `split.html` artifact or special route: the comparator wraps the app.
2. **Ask if they like it** (`AskUserQuestion` or open-ended): approved, or do you want changes?
3. **If they want changes**: take their prompt/feedback and **delegate to the subagent again** (step 9) with that feedback + what's already built. Repeat the *build → show → feedback* cycle as many times as needed.
4. **Only when the user approves**, move on to exports.

This iteration loop is central: the user must see and refine the redesign by prompt before exporting.

## 10. Derived exports (optional, ONLY after approval) — via clean-context SUBAGENT

`AskUserQuestion` multi-select: which exports do you want besides the React project? (HTML mock, Figma, Pencil.)

**Delegate ALL exports to a dedicated subagent (Agent tool) with a clean context.** This subagent does NOT need the conversation history: pass it only the paths (`PROJECT`, `redesigner-artifacts`, `redesign/`) and the chosen export list. It must:

- **Static HTML mock**: run `npm --prefix "SKILL_DIR" run scaffold -- --out "PROJECT" --artifacts "PROJECT/redesigner-artifacts" --target html` → generates `redesign-html/index.html` + `tokens.figma.json`.
- **Figma**: leave `redesign-html/index.html` ready (importable with the **html.to.design** plugin) and `tokens.figma.json` (the **Tokens Studio** plugin); report those two paths to the user.
- **Pencil (.pen)**: with the `pencil` MCP — `get_editor_state({include_schema:true})` + `get_guidelines`, then `batch_design` to recreate the redesign's key screens as a .pen design (using `redesign/` and the screenshots as reference); verify with `get_screenshot`.
- Return a short summary of what it exported and where each thing ended up.

This keeps this conversation's context clean: the navigable mock (step 4), the UX audit (step 7), the redesign build (step 9) and the exports (step 10) run in subagents.

## M. Mobile capture (native app via Maestro)

Use this **instead of steps 0–6** when the source is a native app. It drives the app on a real device/emulator with Maestro (you author the flows; Maestro does the taps/waits), captures a screenshot per screen, and derives tokens/logo from the **pixels** (mobile has no DOM/CSS). Then continue with the **shared** steps 4, 5–6, 7, 8, 9–9b, 10 against the same `redesigner-artifacts/`.

The engine is a thin CLI; call it via Bash and parse the **one JSON line** it prints on stdout (progress goes to stderr).

### M.0 Setup + preflight
1. If `SKILL_DIR/node_modules` is missing: `npm --prefix "SKILL_DIR" install`.
2. `npm --prefix "SKILL_DIR" run mobile-doctor`. Confirm `maestro` and `java` are present and a device is available (`androidDevices` non-empty on Windows, or `bootedSimulators` on Mac). If something's missing, tell the user exactly what to install (Maestro needs Java 17+; Android needs adb + an AVD/USB device; iOS needs macOS) and stop.

### M.1 Security (deliver in the user's language)
**ALWAYS warn:** *"Login is MANUAL on the device — I never receive or handle your username/password. If the app needs login, log in by hand on the phone (the `--watch` mirror helps). Use a TEST account. The survey is read-only: flows only navigate and screenshot; they never delete, submit, pay or log out."* There are no credential flags by design (an optional `--creds <group>` only injects values from a local gitignored `.qa.secrets.json` as Maestro `--env`).

### M.2 Authoring + running flows (the loop)
You need the app's **appId** (Android package / iOS bundleId) — ask, or read it from the project (`app.config.*`, `AndroidManifest`, etc.). Flows are small YAML files you author under a working dir (e.g. `PROJECT/redesigner-flows/`). Run with `--watch` so the human can see the device and do the manual login.

1. **Inspect first (read-only, no flow).** Before authoring anything, dump the **current** screen's view hierarchy + a screenshot so you can read the real labels/ids and author reliable selectors in ONE pass instead of guessing:
   ```bash
   npm --prefix "SKILL_DIR" run mobile-inspect -- --platform android|ios --out "PROJECT/redesigner-artifacts"
   ```
   It writes `screens/_inspect.png` + `screens/_inspect.hierarchy.json` and prints one JSON line (`{ ok, device, screenshot, hierarchy, warnings }`). Read the hierarchy to pick text/id selectors. Re-run it whenever you reach a new screen and aren't sure what's tappable. If `_inspect.png` is a splash/login, ask the user to get the app to the screen to survey (log in / land on home), then continue.
2. **Survey the screens.** Author a flow that walks the main navigation, a `takeScreenshot` per screen. **Selector ladder** (use the most stable one the hierarchy offers; fall back only as needed):
   1. **`id`/accessibility id** — `tapOn: { id: "tab_pending" }` (most stable; RN `testID` surfaces here).
   2. **Visible text** — `tapOn: "Pendientes"`.
   3. **Relative selectors** for ambiguous/icon-only controls — `tapOn: { below: "Header" }`, `childOf`, `containsDescendants` (read these straight off `_inspect.hierarchy.json`).
   4. **Relative point** — `tapOn: { point: "17%, 8%" }` — **last resort only** (it breaks across screen sizes). Put reliable text/id taps first and risky point taps last (Maestro saves screenshots taken before any failing step).
3. **READ-ONLY — never tap destructive items**: no "Log out / Cerrar Sesión", delete, pay/checkout, submit. Skip them and tell the user.
4. **Resume, don't reset.** Don't use `clearState` — it would drop the manual login. `launchApp` resumes; a flow with just `takeScreenshot` captures whatever is on screen.
5. **Iterate:** run → Read the new screenshots → expand/fix the flow → run again. Re-running accumulates screenshots in `screens/` (the manifest rescans the folder); delete a screen file (e.g. a loading splash) if it pollutes the palette.

### M.3 Capture command
```bash
npm --prefix "SKILL_DIR" run mobile-capture -- \
  --app <appId> --platform android|ios \
  --flows "<flow .yaml or dir>" --out "PROJECT/redesigner-artifacts" --watch
```
Response: `{ ok, exitCode, outAbs, screensCount, screenshots:[...], warnings }`. It writes `manifest.json` (`source:"mobile"`, `screens[]`, plus a `pages[]` alias), `screens/NNN_<label>.png`, `tokens.json` (palette from pixels: `dominantBackground`, `primaryText`, `accentCandidates`), `logo/logo.png` (a header crop), `preview.html` and the report skeletons. Open `preview.html` to eyeball the survey cheaply.

### M.4 Continue with the shared steps (mobile lens)
- **Step 4 (navigable mock)**: the subagent reads `manifest.json` + `screens/*.png` (use `screenshot` paths; there's no `*.full.png`).
- **Steps 5–6 (analysis + logo)**: fill the reports by **VLM from the screenshots** (no CSS). `logo/logo.png` is a header crop — judge the brand mark from it.
- **Step 7 (UX audit)**: tell the subagent to use a **mobile lens** — touch-target sizes, thumb reach/zones, safe areas, native navigation patterns (tabs/stack/drawer), gestures, empty/loading/error states.
- **Step 8 (questions)**: confirm direction/style and, in `redesign-brief.md`, set the **target stack**. Default for a native app is **React Native / Expo** (use M.5). Mobile-first React web is only for a web mockup.

### M.5 Mobile redesign scaffold (React Native / Expo) — then build via SUBAGENT
Generate the Expo base seeded with the mobile tokens:
```bash
npm --prefix "SKILL_DIR" run mobile-scaffold -- --out "PROJECT" --artifacts "PROJECT/redesigner-artifacts"
```
This creates `PROJECT/redesign-mobile/` — **Expo Router + React Native + TypeScript**, with `theme.ts` (colors from `tokens.json`: background/surface/text/primary/accent + palette), one screen stub per surveyed screen under `app/` (`app/index.tsx` = home), and base `components/`. Then **delegate the build to a subagent** (Agent tool): use the `frontend-design` skill, read `reports/redesign-brief.md` + `visual-style.md` + the screenshots, and rebuild each `app/*.tsx` screen with React Native primitives (no Tailwind/DOM — use `StyleSheet` and `theme.ts`; animations via `react-native-reanimated` if added). Verify with `npm install` inside `redesign-mobile/`. Return a short summary.

### M.6 Show + iterate on the device (mandatory gate before exports)
**Don't export until the user approves.** Run the redesign on the device and screenshot it with the **same** engine:
1. In `redesign-mobile/`: `npm install` then `npx expo start` (the user runs it on the device via Expo Go or a dev build).
2. Author a small Maestro flow that walks the redesign and re-capture it: `mobile-capture --app <redesign app id> --flows <flow> --out PROJECT/redesign-artifacts-after`. Read those screenshots and show them next to the original survey screens (`redesigner-artifacts/screens/`).
3. Ask if they approve or want changes; on changes, re-delegate to the subagent with the feedback. Repeat build → show → feedback until approved. Only then move to exports (M.7).

### M.7 Mobile exports (optional, ONLY after approval) — via clean-context SUBAGENT
`AskUserQuestion`: which exports? For a native app the main target is **Pencil (.pen)** as phone frames. Delegate to a subagent with a clean context (pass only the paths: `PROJECT`, `redesigner-artifacts`, `redesign-mobile/`).

- **Pencil (.pen)**: needs a `.pen` file **open in the Pencil editor** (the user opens/creates one; the MCP can't operate without it). Then with the `pencil` MCP: `get_editor_state({include_schema:true})` + `get_guidelines` (load a guide compatible with mobile app frames), `set_variables` with the theme colors from `tokens.json` (background/surface/text/primary/accent), then `batch_design` to recreate the key redesign screens as **phone-sized frames**, using `redesign-mobile/` + the survey screenshots (`screens/`) as reference. Verify with `get_screenshot` on a frame (not the whole document).
- **Figma**: there's no DOM HTML for a native app, so the practical path is to import the Pencil frames or the screenshots; report the screenshot/`.pen` paths to the user.
- Return a short summary of what it exported and where.

## Rules

- The crawler is **strictly read-only**: never ask the engine to delete/edit/submit anything.
- **No credentials**: the engine never receives or asks for username/password. Login, if any, is **manual** in the visible browser (`--no-headless`) or **on the device** (mobile). Never ask for credentials over chat.
- **Mobile is read-only too**: flows only navigate and screenshot. Never author taps on log out / delete / pay / submit; never use `clearState` on an app the user logged into by hand.
- Prefer `preview.html` / the navigable mock over loading many images into context.
- The navigable mock, the UX audit, the redesign build and the exports go **via subagent**.
- The **split** (before/after comparison) is **embedded in `redesign/`** via `CompareShell` wrapping the app, not a separate artifact: it uses the original HTML copied to `public/_original/` (with the `assets/` downloaded during capture) and the real redesign as "after". It needs the redesign server running (`npm run dev`).
