import type { MobileConfig } from "./config.js";
import { log } from "../util/log.js";
import { launchApp, runHierarchy } from "./driver/maestro.js";

export type MobileLoginResult =
  | { status: "public" }
  | { status: "ok"; method: "manual" }
  | { status: "failed"; reason: string };

/** How long (ms) to wait for the user to resolve the manual login. Mirrors the web gate. */
const MANUAL_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** Re-probe interval while waiting for the user to finish logging in. */
const POLL_INTERVAL_MS = 2000;

// Login-screen signals, the mobile analog of the web `input[type=password]` check.
// Matched case-insensitively against the RAW hierarchy JSON so we stay robust across
// Maestro / Android / iOS schema differences (resource-id, hintText, text, a11y label…).
const PASSWORD_RE = /password|passwd|contrase|passwort/i; // EN/ES "contraseña"/DE "passwort"
const LOGIN_ACTION_RE = /log\s?in|sign\s?in|iniciar sesi|ingresar|acceder/i;

/**
 * Heuristic: does the on-screen view hierarchy look like a login screen?
 * A password field OR a login-action label is enough. Conservative on purpose — it
 * needs a real signal to trigger, so a public app with no auth is never gated.
 */
export function looksLikeLoginPage(hierarchy: string): boolean {
  return PASSWORD_RE.test(hierarchy) || LOGIN_ACTION_RE.test(hierarchy);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Mobile analog of capture/login.ts. For SECURITY the engine NEVER handles credentials:
 * it launches (foregrounds) the app, and if it detects a login screen it waits — polling
 * the view hierarchy — until the user logs in BY HAND on the device and the login screen
 * clears, then continues. It detects this on its own (no need to touch the terminal).
 */
export async function loginGate(
  device: string,
  config: MobileConfig,
): Promise<MobileLoginResult> {
  // Foreground the app so the login screen (if any) is on-screen before we probe.
  if (!(await launchApp(device, config.app))) {
    return { status: "failed", reason: `could not launch app ${config.app} on ${device}` };
  }

  const probe = await runHierarchy(device);
  // No hierarchy or no login signal → active session / app needs no login: continue.
  if (!probe || !looksLikeLoginPage(probe)) {
    log.info("No login screen detected (active session or app needs no login).");
    return { status: "public" };
  }

  log.box(
    "MANUAL login: complete the login (and 2FA/captcha if any) on the device/emulator.\n" +
      "The engine detects on its own when you're in — no need to touch the terminal.",
  );

  // Polling: we wait for the login screen to disappear.
  const deadline = Date.now() + MANUAL_LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const h = await runHierarchy(device);
    // A transient null (mid-transition) → keep waiting; only a real non-login screen exits.
    if (h && !looksLikeLoginPage(h)) {
      log.info("Login detected — continuing with the capture.");
      return { status: "ok", method: "manual" };
    }
  }
  return {
    status: "failed",
    reason: `timeout waiting for the manual login (${MANUAL_LOGIN_TIMEOUT_MS / 60000} min)`,
  };
}
