import process from "node:process";
import { maestroCmd, maestroInstalled } from "./driver/maestro.js";
import { adbPath, run, which } from "./driver/exec.js";
import { listAndroidDevices, listAvds } from "./driver/android.js";
import { emulatorPath } from "./driver/exec.js";
import { listBootedSimulators } from "./driver/ios.js";

/**
 * Preflight for the mobile pipeline: Maestro + Java + adb/devices (Android) and, on macOS,
 * booted simulators (iOS). Returns a plain object; the CLI emits it as one JSON line.
 */
export async function runMobileDoctor(): Promise<Record<string, unknown>> {
  const checks: Record<string, unknown> = {};
  checks.node = process.version;
  checks.platform = process.platform;
  checks.maestro = (await maestroInstalled())
    ? maestroCmd()
    : "not found — install from https://maestro.dev (needs Java 17+)";
  checks.java = (await which("java")) ? "yes" : "no — Maestro needs Java 17+";

  const adbOk = (await run(adbPath(), ["version"])).code === 0;
  checks.adb = adbOk ? adbPath() : "not found";
  const androidDevices = adbOk ? await listAndroidDevices() : [];
  checks.androidDevices = androidDevices;

  // No device attached? Surface the offline AVDs + the exact command to boot one, so setup
  // doesn't stall on "no device" (the user runs the boot command — the engine never does).
  if (adbOk && androidDevices.length === 0) {
    const avds = await listAvds();
    checks.avds = avds;
    checks.hint =
      avds.length > 0
        ? `No device attached. Boot one with: ${emulatorPath()} -avd ${avds[0]}`
        : "No device attached and no AVDs found. Create one in Android Studio (Device Manager) or with avdmanager, then re-run mobile-doctor.";
  }

  if (process.platform === "darwin") {
    checks.xcrun = (await which("xcrun")) ? "yes" : "no — install Xcode";
    checks.bootedSimulators = await listBootedSimulators();
  } else {
    checks.ios = "skipped — iOS automation requires macOS";
  }
  return checks;
}
