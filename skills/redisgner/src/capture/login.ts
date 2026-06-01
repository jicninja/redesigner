import type { Page } from "playwright";
import type { CaptureConfig } from "../config.js";
import { log } from "../util/log.js";

export type LoginResult =
  | { status: "ok"; method: "reused" | "manual" }
  | { status: "public" }
  | { status: "failed"; reason: string };

/**
 * Heurística: ¿la página parece estar pidiendo login? (hay un input password
 * visible). Si no, asumimos que ya estamos autenticados o es público.
 */
async function looksLikeLoginPage(page: Page): Promise<boolean> {
  const pwd = page.locator('input[type="password"]:visible');
  return (await pwd.count()) > 0;
}

/** Cuánto espera (ms) a que el usuario resuelva el login manual. */
const MANUAL_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Acceso al sitio. Por SEGURIDAD el motor NUNCA maneja credenciales: si detecta
 * una pantalla de login, abre el navegador visible y espera a que el usuario
 * loguee a mano (lo detecta solo, sin tocar la terminal). Orden:
 *   sesión reutilizada / sitio público → login manual (si hay pantalla de login).
 */
export async function login(
  page: Page,
  config: CaptureConfig,
): Promise<LoginResult> {
  const target = config.loginUrl ?? config.url;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  // Si ya estamos autenticados (sesión reutilizada) o es público: seguimos.
  if (!(await looksLikeLoginPage(page))) {
    log.info("No se detectó pantalla de login (sesión activa o sitio público).");
    return { status: "public" };
  }

  // Hay login. El login SIEMPRE es manual → necesitamos el navegador visible.
  if (config.headless) {
    return {
      status: "failed",
      reason:
        "se detectó una pantalla de login pero el navegador está en modo headless. " +
        "Re-ejecutá con --no-headless para loguear a mano (el motor nunca recibe credenciales).",
    };
  }

  log.box(
    "Login MANUAL: resolvé el login (y 2FA/captcha si hay) en la ventana del navegador.\n" +
      "El crawler detecta solo cuando entrás — no hace falta tocar la terminal.",
  );

  // Polling: esperamos a que desaparezca la pantalla de login.
  const deadline = Date.now() + MANUAL_LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await looksLikeLoginPage(page))) {
      log.info("Login detectado — continúo con el crawl.");
      return { status: "ok", method: "manual" };
    }
    await page.waitForTimeout(2000);
  }
  return {
    status: "failed",
    reason: `timeout esperando el login manual (${MANUAL_LOGIN_TIMEOUT_MS / 60000} min)`,
  };
}
