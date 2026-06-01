import path from "node:path";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { CaptureConfig } from "../config.js";
import { ensureDir } from "../util/fs.js";
import { log } from "../util/log.js";

export interface Session {
  browser: Browser;
  context: BrowserContext;
  storageStatePath: string;
}

/** Antigüedad máxima del storageState reutilizable (ms): 12 horas. */
const STORAGE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function storageStatePath(config: CaptureConfig): string {
  return path.join(config.outAbs, ".auth", "storageState.json");
}

async function isFreshStorageState(p: string): Promise<boolean> {
  if (!existsSync(p)) return false;
  try {
    const s = await stat(p);
    return Date.now() - s.mtimeMs < STORAGE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Lanza Chromium con un contexto realista. Reutiliza el storageState previo
 * si existe y es reciente (evita re-login y captchas repetidos).
 */
export async function launchSession(config: CaptureConfig): Promise<Session> {
  const ssPath = storageStatePath(config);
  await ensureDir(path.dirname(ssPath));

  const browser = await chromium.launch({
    headless: config.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const reuse = await isFreshStorageState(ssPath);
  if (reuse) log.info("Reutilizando sesión guardada (storageState).");

  const context = await browser.newContext({
    viewport: config.viewport,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    storageState: reuse ? ssPath : undefined,
  });

  context.setDefaultTimeout(config.pageTimeout);
  context.setDefaultNavigationTimeout(config.pageTimeout);

  // Shim: tsx/esbuild inyecta llamadas a `__name` al stringificar funciones
  // nombradas que se pasan a page.evaluate. Lo definimos en el navegador.
  await context.addInitScript(() => {
    // @ts-expect-error definido en el contexto del navegador
    window.__name = window.__name || ((fn) => fn);
  });

  return { browser, context, storageStatePath: ssPath };
}

export async function saveStorageState(session: Session): Promise<void> {
  await session.context.storageState({ path: session.storageStatePath });
}

export async function closeSession(session: Session): Promise<void> {
  await session.context.close().catch(() => {});
  await session.browser.close().catch(() => {});
}
