// Paints the facade texture array: one 512² layer per building style, packing
// glass (R), detail shading (G) and two night lighting patterns (B, A). No
// three.js here, so the tile worker can paint it off the main thread.
/** Bay width and floor height (metres) per facade style. */
export const BAYS: [number, number][] = [
  [1.6, 3.9], // glass curtain wall
  [3.4, 3.1], // residential tower
  [2.6, 3.8], // office ribbon windows
  [3.0, 3.3], // mid-rise
];
export const CELLS = 8; // each texture layer holds 8 bays × 8 floors
export const TEX = 512;

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function paintFacades(): Uint8Array<ArrayBuffer> {
  let g: Ctx;
  if (typeof OffscreenCanvas !== "undefined") g = new OffscreenCanvas(TEX, TEX).getContext("2d", { willReadFrequently: true })!;
  else {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TEX;
    g = canvas.getContext("2d", { willReadFrequently: true })!;
  }
  const layers = BAYS.length;
  const data = new Uint8Array(TEX * TEX * 4 * layers);
  let s = 11;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cell = TEX / CELLS;
  for (let layer = 0; layer < layers; layer++) {
    // Paint each channel as greyscale in turn, then pack.
    const paint = (draw: () => void) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, TEX, TEX);
      g.fillStyle = "#fff";
      draw();
      return g.getImageData(0, 0, TEX, TEX).data;
    };
    // Window rectangle within a cell: x0, x1, y0, y1 (fractions; y from the floor up).
    const win = [
      [0.05, 0.95, 0.16, 0.98],
      [0.17, 0.83, 0.3, 0.86],
      [0.02, 0.98, 0.36, 0.94],
      [0.27, 0.73, 0.3, 0.8],
    ][layer];
    // Canvas rows become texture rows bottom-up (no flip), so y here runs up a floor.
    const rectOf = (cx: number, cy: number): [number, number, number, number] => [
      cx * cell + win[0] * cell,
      cy * cell + win[2] * cell,
      (win[1] - win[0]) * cell,
      (win[3] - win[2]) * cell,
    ];
    const glass = paint(() => {
      for (let cy = 0; cy < CELLS; cy++) for (let cx = 0; cx < CELLS; cx++) g.fillRect(...rectOf(cx, cy));
    });
    const detail = paint(() => {
      g.fillStyle = "#d8d8d8";
      g.fillRect(0, 0, TEX, TEX);
      for (let cy = 0; cy < CELLS; cy++) {
        // A floor slab line at the bottom of every floor.
        g.fillStyle = "#8a8a8a";
        g.fillRect(0, cy * cell, TEX, 3);
        for (let cx = 0; cx < CELLS; cx++) {
          const v = 150 + Math.floor(rand() * 90);
          g.fillStyle = `rgb(${v},${v},${v})`;
          const [x, y, w, h] = rectOf(cx, cy);
          g.fillRect(x, y, w, h);
          if (layer === 0 || layer === 2) {
            // Mullions inside the glass.
            g.fillStyle = "#6a6a6a";
            for (const f of layer === 2 ? [0.33, 0.66] : [0.5]) g.fillRect(x + w * f - 1, y, 2, h);
          }
          if (layer === 1 && cx % 2 === 0) {
            // Balcony fronts on alternate bays.
            g.fillStyle = "#f2f2f2";
            g.fillRect(cx * cell + cell * 0.1, cy * cell + cell * 0.26, cell * 0.8, cell * 0.06);
          }
        }
      }
    });
    const lit = (busy: boolean) =>
      paint(() => {
        for (let cy = 0; cy < CELLS; cy++) {
          if (layer === 0 || layer === 2) {
            // Offices: a floor is lit or not, with the odd dark bay.
            if (rand() > (busy ? 0.5 : 0.28)) continue;
            for (let cx = 0; cx < CELLS; cx++) if (rand() > 0.08) g.fillRect(...rectOf(cx, cy));
          } else {
            // Homes: a window here, a pair there.
            for (let cx = 0; cx < CELLS; cx++) {
              if (rand() > (busy ? 0.32 : 0.16)) continue;
              const v = 150 + Math.floor(rand() * 105);
              g.fillStyle = `rgb(${v},${v},${v})`;
              g.fillRect(...rectOf(cx, cy));
              if (rand() < 0.4 && cx < CELLS - 1) g.fillRect(...rectOf(++cx, cy));
            }
            g.fillStyle = "#fff";
          }
        }
      });
    const sparse = lit(false);
    const busy = lit(true);
    const base = layer * TEX * TEX * 4;
    for (let i = 0; i < TEX * TEX; i++) {
      data[base + i * 4] = glass[i * 4];
      data[base + i * 4 + 1] = detail[i * 4];
      data[base + i * 4 + 2] = sparse[i * 4];
      data[base + i * 4 + 3] = busy[i * 4];
    }
  }
  return data;
}

export const RIPPLE = 256;
/** A tileable ripple normal map: a few octaves of waves, as RGBA bytes. */
export function paintRipples(): Uint8Array<ArrayBuffer> {
  const n = RIPPLE;
  const h = new Float32Array(n * n);
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let o = 0; o < 5; o++) {
    const f = 2 ** (o + 1);
    const waves = Array.from({ length: 6 }, () => [rand() * 6.283, Math.round(1 + rand() * 3), Math.round(rand() * 4) - 2]);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        for (const [p, kx, ky] of waves) h[y * n + x] += Math.sin(((x * kx + y * ky) * f * 6.283) / n + p) / f ** 1.2;
      }
    }
  }
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x + n - 1) % n)];
      const dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
      const i = (y * n + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 + dx * 40));
      data[i + 1] = Math.max(0, Math.min(255, 128 + dy * 40));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  return data;
}
