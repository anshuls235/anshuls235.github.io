// Real cities from OpenStreetMap, prepared for tiled flight. Pure data work, no DOM:
// decodes the compact CityIndex, manages per-tile building/water collision grids as
// tiles stream in and out, and exposes hits(), roofAt(), isWater() for flight & course.
import type { Obstacle, Thermal } from "./glider";
import { decodeRle, type CityId, type CityIndex, type CityLandmark, type DecodedTile, type TileBuilding } from "./tileformat";

export type { CityId, CityIndex, CityLandmark, DecodedTile };

export interface Leg {
  from: [number, number];
  to: [number, number];
  /** Height that clears everything within reach of the leg, plus what the glide will cost. */
  depart: number;
}

export interface City {
  index: CityIndex;
  /** Compatibility summary matching previous City.data fields */
  data: {
    id: CityId;
    name: string;
    half: [number, number];
    attribution: string;
  };
  breeze: { x: number; z: number };
  thermals: Thermal[];
  obstacles: Obstacle[];
  landmarks: CityLandmark[];
  tallest: number;
  legs: Leg[];
  sea: { cell: number; cols: number; rows: number; mask: Uint8Array } | null;
  tileSet: Set<string>;
  /** Register a decoded tile's buildings & inland water for collision / roofAt queries. */
  addTile(tile: DecodedTile): void;
  /** Unregister a tile when it streams out of range. */
  removeTile(tx: number, tz: number): void;
  hasTile(tx: number, tz: number): boolean;
  /** True when (x, y, z) is inside a building or landmark. */
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

export function pointInRing(x: number, z: number, ring: ArrayLike<number>, offset = 0) {
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

interface TileCollision {
  buildings: TileBuilding[];
  grid: Map<string, number[]>;
  water: Float32Array[];
  islands: Float32Array[];
}

const CELL = 50;

export function prepareCity(index: CityIndex): City {
  const sea = index.sea
    ? {
        cell: index.sea.cell,
        cols: index.sea.cols,
        rows: index.sea.rows,
        mask: decodeRle(index.sea.rle, index.sea.cols * index.sea.rows),
      }
    : null;

  const obstacles: Obstacle[] = [];
  for (let i = 0; i + 4 < index.obstacles.length; i += 5) {
    obstacles.push({
      x: index.obstacles[i],
      z: index.obstacles[i + 1],
      w: index.obstacles[i + 2],
      d: index.obstacles[i + 3],
      h: index.obstacles[i + 4],
    });
  }

  const tileSize = index.tileSize;
  const tileSet = new Set<string>(index.tiles);
  const loaded = new Map<string, TileCollision>();

  function addTile(tile: DecodedTile) {
    const key = `${tile.tx},${tile.tz}`;
    if (loaded.has(key)) return;
    const grid = new Map<string, number[]>();
    tile.buildings.forEach((b, i) => {
      const [x0, z0, x1, z1] = b.bbox;
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
        for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
          const ck = `${gx},${gz}`;
          let list = grid.get(ck);
          if (!list) {
            list = [];
            grid.set(ck, list);
          }
          list.push(i);
        }
      }
    });
    loaded.set(key, {
      buildings: tile.buildings,
      grid,
      water: tile.water,
      islands: tile.islands,
    });
  }

  function removeTile(tx: number, tz: number) {
    loaded.delete(`${tx},${tz}`);
  }

  function hasTile(tx: number, tz: number) {
    return loaded.has(`${tx},${tz}`);
  }

  function hits(x: number, y: number, z: number): boolean {
    // Check procedural hero landmarks first
    for (const lm of index.landmarks) {
      if (y < lm.height) {
        const dx = x - lm.x;
        const dz = z - lm.z;
        // Taper radius for tall spires / Burj Khalifa
        const frac = Math.max(0, y / lm.height);
        const r = lm.kind === "burj" || lm.kind === "spire" ? lm.radius * (1 - frac * 0.72) : lm.radius;
        if (dx * dx + dz * dz <= r * r) return true;
      }
    }
    const tx = Math.floor(x / tileSize);
    const tz = Math.floor(z / tileSize);
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    const ck = `${gx},${gz}`;
    // Check current tile and immediate neighbours (for buildings straddling tile edges)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const tc = loaded.get(`${tx + dx},${tz + dz}`);
        if (!tc) continue;
        const list = tc.grid.get(ck);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const b = tc.buildings[list[k]];
          if (y < b.height && x >= b.bbox[0] && x <= b.bbox[2] && z >= b.bbox[1] && z <= b.bbox[3] && pointInRing(x, z, b.ring, 0)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function roofAt(x: number, z: number, radius: number): number {
    let top = 0;
    for (const lm of index.landmarks) {
      if (Math.hypot(x - lm.x, z - lm.z) <= radius + lm.radius) {
        top = Math.max(top, lm.height);
      }
    }
    const minTx = Math.floor((x - radius) / tileSize) - 1;
    const maxTx = Math.floor((x + radius) / tileSize) + 1;
    const minTz = Math.floor((z - radius) / tileSize) - 1;
    const maxTz = Math.floor((z + radius) / tileSize) + 1;
    const r2 = radius * radius;
    const gx0 = Math.floor((x - radius) / CELL);
    const gx1 = Math.floor((x + radius) / CELL);
    const gz0 = Math.floor((z - radius) / CELL);
    const gz1 = Math.floor((z + radius) / CELL);

    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        const tc = loaded.get(`${tx},${tz}`);
        if (!tc) continue;
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gz = gz0; gz <= gz1; gz++) {
            const list = tc.grid.get(`${gx},${gz}`);
            if (!list) continue;
            for (let k = 0; k < list.length; k++) {
              const b = tc.buildings[list[k]];
              const dx = Math.max(b.bbox[0] - x, 0, x - b.bbox[2]);
              const dz = Math.max(b.bbox[1] - z, 0, z - b.bbox[3]);
              if (dx * dx + dz * dz <= r2 && b.height > top) top = b.height;
            }
          }
        }
      }
    }
    return top;
  }

  function isWater(x: number, z: number): boolean {
    if (sea) {
      const c = Math.floor((x + index.half[0]) / sea.cell);
      const r = Math.floor((z + index.half[1]) / sea.cell);
      if (c >= 0 && r >= 0 && c < sea.cols && r < sea.rows && sea.mask[r * sea.cols + c]) return true;
    }
    const tx = Math.floor(x / tileSize);
    const tz = Math.floor(z / tileSize);
    const tc = loaded.get(`${tx},${tz}`);
    if (!tc) return false;
    return tc.water.some((w) => pointInRing(x, z, w)) && !tc.islands.some((w) => pointInRing(x, z, w));
  }

  return {
    index,
    data: {
      id: index.id,
      name: index.name,
      half: index.half,
      attribution: index.attribution,
    },
    breeze: BREEZE[index.id],
    thermals: index.thermals,
    obstacles,
    landmarks: index.landmarks,
    tallest: index.tallest,
    legs: index.legs,
    sea,
    tileSet,
    addTile,
    removeTile,
    hasTile,
    hits,
    roofAt,
    isWater,
  };
}
