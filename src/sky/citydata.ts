// Real cities from OpenStreetMap, prepared for flight. Pure data work, no DOM:
// where the sea is, what the plane can hit, where warm air rises, and a route
// between thermals that clears every building on the way.
import type { Obstacle, Thermal } from "./glider";

export type CityId = "bengaluru" | "delhi" | "dubai";

export interface CityFile {
  id: CityId;
  name: string;
  half: [number, number];
  attribution: string;
  /** [height, style, x0, z0, x1, z1, …] in metres; x east, z south. */
  buildings: number[][];
  water: number[][];
  islands: number[][];
  coast: number[][];
  seaSeed: [number, number] | null;
  green: number[][];
  sand: number[][];
  /** [width, x0, z0, …] */
  roads: number[][];
}

export interface Leg {
  from: [number, number];
  to: [number, number];
  /** Height that clears everything within reach of the leg, plus what the glide will cost. */
  depart: number;
}

export interface City {
  data: CityFile;
  breeze: { x: number; z: number };
  thermals: Thermal[];
  obstacles: Obstacle[];
  tallest: number;
  legs: Leg[];
  sea: { cell: number; cols: number; rows: number; mask: Uint8Array } | null;
  /** True when (x, y, z) is inside a building. */
  hits(x: number, y: number, z: number): boolean;
  /** Tallest roof within `radius` metres of (x, z). */
  roofAt(x: number, z: number, radius: number): number;
  isWater(x: number, z: number): boolean;
}

export const BREEZE: Record<CityId, { x: number; z: number }> = {
  dubai: { x: 3.2, z: 3.2 }, // the afternoon sea breeze, off the Gulf to the north-west
  bengaluru: { x: 3, z: 0.6 }, // the westerly that keeps the Garden City mild
  delhi: { x: 2.2, z: 1.6 }, // the dry north-westerly
};

export function pointInRing(x: number, z: number, ring: number[], offset = 0) {
  let inside = false;
  for (let i = offset, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const zi = ring[i + 1];
    const xj = ring[j];
    const zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Floods the sea from a point known to be open water; coastlines are the walls. */
function floodSea(data: CityFile) {
  if (!data.seaSeed || !data.coast.length) return null;
  const cell = 4;
  const cols = Math.ceil((data.half[0] * 2) / cell);
  const rows = Math.ceil((data.half[1] * 2) / cell);
  const wall = new Uint8Array(cols * rows);
  const toCell = (x: number, z: number) => [Math.floor((x + data.half[0]) / cell), Math.floor((z + data.half[1]) / cell)];
  for (const line of data.coast) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      const steps = Math.ceil(Math.hypot(line[i + 2] - line[i], line[i + 3] - line[i + 1]) / (cell / 2)) + 1;
      for (let s = 0; s <= steps; s++) {
        const [c, r] = toCell(line[i] + ((line[i + 2] - line[i]) * s) / steps, line[i + 1] + ((line[i + 3] - line[i + 1]) * s) / steps);
        // A two-cell-thick wall so the fill cannot slip through a diagonal.
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1]]) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) wall[rr * cols + cc] = 1;
        }
      }
    }
  }
  const mask = new Uint8Array(cols * rows);
  const [sc, sr] = toCell(...data.seaSeed);
  const stack = [sr * cols + sc];
  while (stack.length) {
    const i = stack.pop()!;
    if (mask[i] || wall[i]) continue;
    mask[i] = 1;
    const c = i % cols;
    const r = (i - c) / cols;
    if (c > 0) stack.push(i - 1);
    if (c < cols - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - cols);
    if (r < rows - 1) stack.push(i + cols);
  }
  // The coastline itself is water's edge: fold wall cells that touch the sea into it.
  for (let i = 0; i < mask.length; i++) if (wall[i] && (mask[i - 1] || mask[i + 1] || mask[i - cols] || mask[i + cols])) mask[i] = 2;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 2) mask[i] = 1;
  return { cell, cols, rows, mask };
}

export function prepareCity(data: CityFile): City {
  const GRID = 40;
  const grid = new Map<string, number[]>();
  const boxes = data.buildings.map((b) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 2; i < b.length; i += 2) {
      x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]);
      z0 = Math.min(z0, b[i + 1]); z1 = Math.max(z1, b[i + 1]);
    }
    return [x0, z0, x1, z1];
  });
  boxes.forEach(([x0, z0, x1, z1], index) => {
    for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++)
      for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++) {
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(index);
      }
  });
  const near = (x: number, z: number) => grid.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) ?? [];
  const hits = (x: number, y: number, z: number) =>
    near(x, z).some((i) => {
      const b = data.buildings[i];
      const box = boxes[i];
      return y < b[0] && x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3] && pointInRing(x, z, b, 2);
    });
  const roofAt = (x: number, z: number, radius: number) => {
    let top = 0;
    const seen = new Set<number>();
    for (let gx = Math.floor((x - radius) / GRID); gx <= Math.floor((x + radius) / GRID); gx++)
      for (let gz = Math.floor((z - radius) / GRID); gz <= Math.floor((z + radius) / GRID); gz++)
        for (const i of grid.get(`${gx},${gz}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const [x0, z0, x1, z1] = boxes[i];
          const dx = Math.max(x0 - x, 0, x - x1);
          const dz = Math.max(z0 - z, 0, z - z1);
          if (dx * dx + dz * dz <= radius * radius) top = Math.max(top, data.buildings[i][0]);
        }
    return top;
  };
  const sea = floodSea(data);
  const isWater = (x: number, z: number) => {
    if (sea) {
      const c = Math.floor((x + data.half[0]) / sea.cell);
      const r = Math.floor((z + data.half[1]) / sea.cell);
      if (c >= 0 && r >= 0 && c < sea.cols && r < sea.rows && sea.mask[r * sea.cols + c]) return true;
    }
    return data.water.some((w) => pointInRing(x, z, w)) && !data.islands.some((w) => pointInRing(x, z, w));
  };
  const tallest = Math.max(...data.buildings.map((b) => b[0]));

  // Thermals: open, sun-heated ground well away from tall buildings and water.
  const candidates: [number, number][] = [];
  const inset = 260;
  for (let x = -data.half[0] + inset; x <= data.half[0] - inset; x += 50)
    for (let z = -data.half[1] + inset; z <= data.half[1] - inset; z += 50)
      if (!isWater(x, z) && roofAt(x, z, 75) < 30) candidates.push([x, z]);
  const sites: [number, number][] = [];
  if (candidates.length) {
    sites.push(candidates.reduce((a, b) => (Math.hypot(...b) < Math.hypot(...a) ? b : a)));
    while (sites.length < 9) {
      let best: [number, number] | null = null;
      let bestD = 0;
      for (const c of candidates) {
        const d = Math.min(...sites.map((s) => Math.hypot(s[0] - c[0], s[1] - c[1])));
        if (d > bestD) [best, bestD] = [c, d];
      }
      if (!best || bestD < 260) break;
      sites.push(best);
    }
  }
  // The tour visits each thermal once, nearest first, then flies back the same way,
  // so every leg is a short hop between neighbours.
  const tour = sites.length ? [sites[0]] : [];
  const left = sites.slice(1);
  while (left.length) {
    const last = tour.at(-1)!;
    left.sort((a, b) => Math.hypot(a[0] - last[0], a[1] - last[1]) - Math.hypot(b[0] - last[0], b[1] - last[1]));
    tour.push(left.shift()!);
  }
  const path = tour.length > 2 ? [...tour, ...tour.slice(1, -1).reverse()] : tour;
  const legs: Leg[] = path.map((from, i) => {
    const to = path[(i + 1) % path.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    let clear = 0;
    for (let s = 0; s <= length; s += 20) {
      const t = length ? s / length : 0;
      clear = Math.max(clear, roofAt(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 45));
    }
    // Leave with enough height to clear the leg after a pessimistic glide into wind.
    return { from, to, depart: clear + 35 + length / 5 };
  });
  // Thermals reach comfortably above the highest departure any leg needs.
  const top = Math.max(tallest + 120, ...legs.map((l) => l.depart + 90));
  const thermals: Thermal[] = sites.map(([x, z], i) => ({ x, z, radius: 200, strength: 4.6 + (i % 3) * 0.4, top }));

  const obstacles: Obstacle[] = data.buildings
    .map((b, i) => ({ b, box: boxes[i] }))
    .filter(({ b }) => b[0] > 45)
    .map(({ b, box }) => ({ x: (box[0] + box[2]) / 2, z: (box[1] + box[3]) / 2, w: box[2] - box[0], d: box[3] - box[1], h: b[0] }));

  return { data, breeze: BREEZE[data.id], thermals, obstacles, tallest, legs, sea, hits, roofAt, isWater };
}
