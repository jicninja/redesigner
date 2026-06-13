export type Platform = "android" | "ios";

/** One captured app screen (mobile analog of a web "page"). */
export interface CapturedScreen {
  /** Milestone label = screenshot filename without extension (e.g. "001_home"). */
  label: string;
  /** Screenshot path relative to the artifacts dir (e.g. "screens/001_home.png"). */
  screenshot: string;
  /** View-hierarchy dump path, if captured (best-effort, see capture.ts). */
  hierarchy?: string;
}

/**
 * Mobile capture manifest. Tagged `source:"mobile"` so downstream steps can branch.
 * `pages` is a web-shaped alias of `screens` so the existing preview/navigable-mock
 * (which read `pages` + screenshots) keep working with minimal changes.
 */
export interface MobileManifest {
  source: "mobile";
  appId: string;
  platform: Platform;
  device: string;
  /** "manual-on-device" | "credentials-injected" | "failed: ..." */
  auth: string;
  startedAt: string;
  finishedAt: string;
  flows: string[];
  screens: CapturedScreen[];
  pages: { url: string; slug: string; title: string }[];
  warnings: string[];
}
