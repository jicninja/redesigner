import { run } from "./exec.js";

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
}

/** List booted iOS simulators via `xcrun simctl`. macOS only. */
export async function listBootedSimulators(): Promise<SimctlDevice[]> {
  const { stdout, code } = await run("xcrun", ["simctl", "list", "devices", "booted", "--json"]);
  if (code !== 0) return [];
  const parsed = JSON.parse(stdout) as { devices: Record<string, SimctlDevice[]> };
  return Object.values(parsed.devices)
    .flat()
    .filter((d) => d.state === "Booted");
}

/** Resolve an iOS device udid: explicit value, or the single booted simulator if "auto". */
export async function resolveIosDevice(requested: string): Promise<string> {
  if (requested && requested !== "auto") return requested;
  const sims = await listBootedSimulators();
  if (sims.length === 0) {
    throw new Error(
      "No booted iOS simulator. Boot one with `xcrun simctl boot <udid>` (or open Simulator.app).",
    );
  }
  if (sims.length > 1) {
    throw new Error(`Multiple booted simulators (${sims.map((s) => s.name).join(", ")}). Pass --device <udid>.`);
  }
  return sims[0].udid;
}
