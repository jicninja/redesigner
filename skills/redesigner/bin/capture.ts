#!/usr/bin/env -S npx tsx
import { Command } from "commander";
import { buildCaptureConfig, formatConfigError } from "../src/config.js";
import { log } from "../src/util/log.js";

const program = new Command();

program
  .name("redesigner")
  .description(
    "Surveys a website with Playwright (read-only) and prepares its redesign.",
  );

program
  .command("capture")
  .description("Logs in, crawls (non-destructive) and saves the site's artifacts.")
  .requiredOption("--url <url>", "URL of the site to survey")
  .option("--login-url <url>", "login URL if it differs from --url")
  .option("--out <dir>", "output directory", "./redesigner-artifacts")
  .option("--max-pages <n>", "maximum number of pages to crawl", "25")
  .option("--viewport <WxH>", "viewport size", "1440x900")
  .option("--no-headless", "open the browser (required if the site asks for login: it is manual)")
  .option("--capture-trace", "record a Playwright trace (heavy)", false)
  .option("--page-timeout <ms>", "timeout per page", "30000")
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
      log.error("Invalid configuration or error during capture:\n" + formatConfigError(err));
      process.exitCode = 1;
    }
  });

program
  .command("scaffold")
  .description("Generates the redesign's base project (React + Tailwind + motion).")
  .requiredOption("--out <dir>", "project directory (where redesigner-artifacts lives)")
  .option(
    "--artifacts <dir>",
    "artifacts directory",
    "./redesigner-artifacts",
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
      log.error("Error during scaffold: " + String(err));
      process.exitCode = 1;
    }
  });

program.parseAsync();
