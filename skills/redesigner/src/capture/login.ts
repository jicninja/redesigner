import type { Page } from "playwright";
import type { CaptureConfig } from "../config.js";
import { log } from "../util/log.js";

export type LoginResult =
  | { status: "ok"; method: "reused" | "manual" }
  | { status: "public" }
  | { status: "failed"; reason: string };

/**
 * Heuristic: does the page seem to be asking for login? (there's a visible
 * password input). If not, we assume we're already authenticated or it's public.
 */
async function looksLikeLoginPage(page: Page): Promise<boolean> {
  const pwd = page.locator('input[type="password"]:visible');
  return (await pwd.count()) > 0;
}

/** How long (ms) to wait for the user to resolve the manual login. */
const MANUAL_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Site access. For SECURITY the engine NEVER handles credentials: if it detects
 * a login screen, it opens the visible browser and waits for the user to log in
 * by hand (it detects this on its own, without touching the terminal). Order:
 *   reused session / public site → manual login (if there's a login screen).
 */
export async function login(
  page: Page,
  config: CaptureConfig,
): Promise<LoginResult> {
  const target = config.loginUrl ?? config.url;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  // If we're already authenticated (reused session) or it's public: continue.
  if (!(await looksLikeLoginPage(page))) {
    log.info("No login screen detected (active session or public site).");
    return { status: "public" };
  }

  // There's a login. Login is ALWAYS manual → we need the visible browser.
  if (config.headless) {
    return {
      status: "failed",
      reason:
        "a login screen was detected but the browser is in headless mode. " +
        "Re-run with --no-headless to log in by hand (the engine never receives credentials).",
    };
  }

  log.box(
    "MANUAL login: complete the login (and 2FA/captcha if any) in the browser window.\n" +
      "The crawler detects on its own when you're in — no need to touch the terminal.",
  );

  // Polling: we wait for the login screen to disappear.
  const deadline = Date.now() + MANUAL_LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await looksLikeLoginPage(page))) {
      log.info("Login detected — continuing with the crawl.");
      return { status: "ok", method: "manual" };
    }
    await page.waitForTimeout(2000);
  }
  return {
    status: "failed",
    reason: `timeout waiting for the manual login (${MANUAL_LOGIN_TIMEOUT_MS / 60000} min)`,
  };
}
