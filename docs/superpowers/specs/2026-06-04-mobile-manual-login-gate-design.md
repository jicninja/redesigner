# Mobile manual-login gate (auto-detect)

**Date:** 2026-06-04
**Branch:** mobile-redesign
**Status:** approved (pending spec review)

## Problem

The web capture flow (`src/capture/login.ts`) opens a *visible* Playwright browser,
detects a login screen by a visible `input[type="password"]`, prints a box, and
**polls every 2s until the password field disappears** — the user logs in by hand,
the engine auto-detects completion, and continues the read-only crawl. The engine
never handles credentials or asks the user to touch the terminal.

The mobile capture flow (`src/mobile/capture.ts`) has **no equivalent gate**. It
merely *assumes* the user logged in by hand beforehand, and the only automated path
is `--creds` (credential injection as Maestro `--env`, i.e. login "por prompting").

Goal: give mobile the same behavior as web — **detect login screen → pause → the
user logs in by hand on the device/emulator → auto-continue** — without the engine
ever handling credentials.

## Decisions (confirmed with user)

- **Completion signal:** auto-detect, polling the Maestro view hierarchy (mirror web).
- **App launch:** the engine launches the app itself before gating, so the login
  screen is guaranteed on-screen before polling (mirror web's `page.goto(url)`).

## Design

### New module `src/mobile/login.ts`

Mobile mirror of `capture/login.ts`. Single responsibility: pause mobile capture
until the user has logged in by hand, detecting completion from the view hierarchy.

```ts
type MobileLoginResult =
  | { status: "public" }                 // no login screen → continue silently
  | { status: "ok"; method: "manual" }   // login screen cleared by the user
  | { status: "failed"; reason: string };

loginGate(device: string, config: MobileConfig): Promise<MobileLoginResult>
```

Gate flow (parallels `capture/login.ts` step for step):

1. **Launch the app** via an ephemeral Maestro `launchApp` run for `config.app`,
   so the app is foregrounded and visible. Reuses the existing Maestro driver — no
   raw `adb`/`xcrun` and no new dependency. A launch failure → `failed`.
2. **Probe once** with `runHierarchy(device)`. If it does NOT look like a login
   screen → `return { status: "public" }` and continue silently (active session /
   no auth), exactly like web's "No login screen detected."
3. If it **does** look like login → `log.box(...)` with the same wording as web:
   *"MANUAL login: complete it on the device/emulator. The engine detects on its own
   when you're in — no need to touch the terminal."*
4. **Poll every 2s**, deadline 5 min (reuse the web constant value
   `MANUAL_LOGIN_TIMEOUT_MS = 5 * 60 * 1000`), calling `runHierarchy` until the
   login heuristic no longer matches → `return { status: "ok", method: "manual" }`.
   On timeout → `failed` with a clear reason.

### `looksLikeLoginPage(hierarchy: string): boolean`

Mobile's fuzzier equivalent of web's `input[type="password"]`. The Maestro
`hierarchy` output is JSON; to stay robust to schema differences across
Maestro/Android/iOS, match against the **raw hierarchy string** (case-insensitive):

- a password signal — `/password|passwd|contrase|passwort/i`
  (covers EN "password", ES "contraseña", DE "passwort"), OR
- a login-action signal — `/log\s?in|sign\s?in|iniciar sesi|ingresar|acceder/i`.

Conservative on purpose: it needs a real signal to trigger, so a public app with no
auth is never gated. (Raw-string match accepts that an unrelated screen literally
containing the word "login" could trigger a one-probe gate; acceptable for a
prototype, and the 5-min timeout bounds the worst case.)

### Wiring in `src/mobile/capture.ts`

Call the gate right after `resolveDevice` + `maestroInstalled`, **before** the flow
loop:

- If `config.creds` is set (existing automated-injection path) → **skip** the gate
  (credentials mean automated login was intended).
- Else → run `loginGate`. `failed` aborts via `result({ ok: false, error })`;
  `public` / `ok` proceed. The manifest `auth` field stays `"manual-on-device"`
  (already its default when no creds).
- Skip the gate in `--continuous` authoring mode (that mode already short-circuits
  the artifact pipeline; the user is iterating selectors, not capturing).

No new CLI flag — always-on like web, and a no-op when no login screen is present.
The `survey.yaml` first step is `launchApp`, which RESUMES the now-logged-in
session (the template already forbids `clearState`).

### Docs

- Update the `survey.yaml` template comment in `src/mobile/init-flows.ts` to note the
  engine auto-gates the manual login before the flow runs.
- Update the mobile section of `SKILL.md` to document the auto-detect login gate.

## Rejected alternatives

- **Press-ENTER / hybrid signal** — user chose pure auto-detect to match web.
- **`--login-gate` opt-in flag** — unnecessary; detection makes it self-gating.
- **Launch via raw `adb`/`xcrun` in the drivers** — the ephemeral Maestro `launchApp`
  is cross-platform and reuses existing code.

## Verification (no automated tests — prototype mode)

- `npm run build` / typecheck clean.
- Manual: run `mobile-capture` against an app with a login screen → engine launches
  app, prints the box, waits; after logging in by hand the crawl proceeds. Run
  against a public app → gate returns `public` and capture proceeds with no pause.
