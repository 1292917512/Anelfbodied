/** Packed opacity samples in normalized model-surface coordinates. */
export interface HitMask {
  width: number;
  height: number;
  bits: Uint8Array;
}

export function alphaMask(pixels: Uint8ClampedArray, width: number, height: number): HitMask {
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  for (let i = 0; i < width * height; i++) {
    if (pixels[i * 4 + 3]! >= 32) bits[i >> 3]! |= 1 << (i & 7);
  }
  return { width, height, bits };
}

export function maskContains(mask: HitMask, x: number, y: number): boolean {
  if (!(x >= 0 && y >= 0 && x < 1 && y < 1)) return false;
  const index = Math.floor(y * mask.height) * mask.width + Math.floor(x * mask.width);
  return !!(mask.bits[index >> 3]! & (1 << (index & 7)));
}
