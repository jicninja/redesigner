import type { Platform } from "../types.js";
import { resolveAndroidDevice } from "./android.js";
import { resolveIosDevice } from "./ios.js";

/**
 * Guard: iOS automation requires macOS (Maestro drives iOS via idb under the hood).
 * Android runs anywhere adb runs.
 */
export function assertPlatformSupported(platform: Platform): void {
  if (platform === "ios" && process.platform !== "darwin") {
    throw new Error(
      "iOS automation requires macOS. This host is " +
        `${process.platform}. Run iOS targets on a Mac; Android works here.`,
    );
  }
}

export async function resolveDevice(platform: Platform, requested: string): Promise<string> {
  assertPlatformSupported(platform);
  return platform === "android"
    ? resolveAndroidDevice(requested)
    : resolveIosDevice(requested);
}
