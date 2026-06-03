import { adbPath, emulatorPath, run } from "./exec.js";

/** List attached Android devices/emulators (state == "device"). */
export async function listAndroidDevices(): Promise<string[]> {
  const { stdout } = await run(adbPath(), ["devices"]);
  return stdout
    .split(/\r?\n/)
    .slice(1) // skip "List of devices attached"
    .map((l) => l.trim())
    .filter((l) => l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]);
}

/** List installed AVDs (offline emulators) via `emulator -list-avds`. */
export async function listAvds(): Promise<string[]> {
  const { stdout, code } = await run(emulatorPath(), ["-list-avds"]);
  if (code !== 0) return [];
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("INFO"));
}

/** Resolve a device udid: explicit value, or the single attached one if "auto". */
export async function resolveAndroidDevice(requested: string): Promise<string> {
  if (requested && requested !== "auto") return requested;
  const devices = await listAndroidDevices();
  if (devices.length === 0) {
    throw new Error(
      "No Android device/emulator attached. Start an AVD or connect a device with USB debugging.",
    );
  }
  if (devices.length > 1) {
    throw new Error(`Multiple Android devices attached (${devices.join(", ")}). Pass --device <udid>.`);
  }
  return devices[0];
}
