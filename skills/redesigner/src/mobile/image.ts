import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export interface Decoded {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Buffer;
}

/** Decode a PNG to an RGBA buffer (pure JS, no browser). */
export function decodePng(file: string): Decoded {
  const png = PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
}

/** Crop a vertical band [y0frac, y1frac) of a PNG (full width) to destFile. */
export function cropBand(srcFile: string, destFile: string, y0frac: number, y1frac: number): void {
  const src = PNG.sync.read(readFileSync(srcFile));
  const y0 = Math.max(0, Math.floor(src.height * y0frac));
  const y1 = Math.min(src.height, Math.ceil(src.height * y1frac));
  const h = Math.max(1, y1 - y0);
  const out = new PNG({ width: src.width, height: h });
  PNG.bitblt(src, out, 0, y0, src.width, h, 0, 0);
  writeFileSync(destFile, PNG.sync.write(out));
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

/** Perceptual luminance on 0–255 (sRGB-weighted, no gamma). */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** HSL saturation on 0–1. 0 = grayscale. */
export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}
