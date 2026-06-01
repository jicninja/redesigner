#!/usr/bin/env -S npx tsx
import { Command } from "commander";
import { buildCaptureConfig, formatConfigError } from "../src/config.js";
import { log } from "../src/util/log.js";

const program = new Command();

program
  .name("redisgner")
  .description(
    "Releva una web con Playwright (solo lectura) y prepara su rediseño.",
  );

program
  .command("capture")
  .description("Loguea, crawlea (no destructivo) y guarda artefactos del sitio.")
  .requiredOption("--url <url>", "URL del sitio a relevar")
  .option("--login-url <url>", "URL de login si difiere de --url")
  .option("--out <dir>", "directorio de salida", "./redisgner-artifacts")
  .option("--max-pages <n>", "máximo de páginas a crawlear", "25")
  .option("--viewport <WxH>", "tamaño del viewport", "1440x900")
  .option("--no-headless", "abrir el navegador (necesario si el sitio pide login: es manual)")
  .option("--capture-trace", "grabar un trace de Playwright (pesado)", false)
  .option("--page-timeout <ms>", "timeout por página", "30000")
  .action(async (opts) => {
    try {
      const config = buildCaptureConfig({
        url: opts.url,
        loginUrl: opts.loginUrl,
        out: opts.out,
        maxPages: opts.maxPages,
        viewport: opts.viewport,
        headless: opts.headless,
        captureTrace: opts.captureTrace,
        pageTimeout: opts.pageTimeout,
      });
      const { runCapture } = await import("../src/capture/index.js");
      await runCapture(config);
    } catch (err) {
      log.error("Configuración inválida o error en la captura:\n" + formatConfigError(err));
      process.exitCode = 1;
    }
  });

program
  .command("scaffold")
  .description("Genera el proyecto base del rediseño (React + Tailwind + motion).")
  .requiredOption("--out <dir>", "directorio del proyecto (donde está redisgner-artifacts)")
  .option(
    "--artifacts <dir>",
    "directorio de artefactos",
    "./redisgner-artifacts",
  )
  .option("--target <target>", "react | html", "react")
  .action(async (opts) => {
    try {
      const { runScaffold } = await import("../src/scaffold/scaffold.js");
      await runScaffold({
        out: opts.out,
        artifacts: opts.artifacts,
        target: opts.target,
      });
    } catch (err) {
      log.error("Error en el scaffold: " + String(err));
      process.exitCode = 1;
    }
  });

program.parseAsync();
