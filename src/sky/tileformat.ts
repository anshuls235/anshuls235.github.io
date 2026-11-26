// Compact binary tile format (SKY1) and city index schema.
// Coordinates are stored relative to each tile's centre in 0.25 m Int16 units,
// delta-encoded within each polygon/polyline so gzip compresses them tightly.
// Pure TypeScript, zero DOM/Three.js dependencies (shared by build script, worker, and runtime).

export type CityId = "bengaluru" | "delhi" | "dubai";
export type LandmarkKind = "burj" | "spire" | "arch" | "dome" | "sail";

export const TILE_MAGIC = 0x534b5931; // "SKY1"
export const TILE_SIZE = 1000; // 1 km tiles
export const COORD_SCALE = 4; // 0.25 m quantization

export interface CityLandmark {
  name: string;
  x: number;
  z: number;
  height: number;
  radius: number;
  kind: LandmarkKind;
  color: number;
}

export interface CityIndex {
  version: 2;
  id: CityId;
  name: string;
  attribution: string;
  half: [number, number];
  tileSize: number;
  minTx: number;
  maxTx: number;
  minTz: number;
  maxTz: number;
  tallest: number;
  spawn: [number, number, number];
  tiles: string[];
  thermals: { x: number; z: number; radius: number; strength: number; top: number }[];
  legs: { from: [number, number]; to: [number, number]; depart: number }[];
  /** Flat array of [x, z, w, d, h, ...] for tall towers (> 45 m) used by ridge lift */
  obstacles: number[];
  landmarks: CityLandmark[];
  sea?: {
    cell: number;
    cols: number;
    rows: number;
    /** Run-length encoded alternating 0 (land) and 1 (sea) runs, starting with 0 */
    rle: number[];
  } | null;
}

export interface TileBuildingInput {
  height: number;
  style: number;
  roofType: number;
  tint: number;
  ring: number[]; // flat [x0, z0, x1, z1, ...] in world metres
}

export interface TileRoadInput {
  width: number;
  kind: number; // 0=minor, 1=medium, 2=major
  points: number[]; // flat [x0, z0, ...] in world metres
}

export interface TileRailInput {
  width: number;
  kind: number; // 0=surface rail, 1=elevated metro
  points: number[];
}

export interface TileInput {
  tx: number;
  tz: number;
  buildings: TileBuildingInput[];
  roads: TileRoadInput[];
  rails: TileRailInput[];
  water: number[][];
  islands: number[][];
  green: number[][];
  sand: number[][];
  flags: number;
}

export interface TileBuilding {
  height: number;
  style: number;
  roofType: number;
  tint: number;
  /** World-space flat [x0, z0, x1, z1, ...] */
  ring: Float32Array;
  bbox: [number, number, number, number]; // [x0, z0, x1, z1]
}

export interface TileRoad {
  width: number;
  kind: number;
  points: Float32Array;
}

export interface TileRail {
  width: number;
  kind: number;
  points: Float32Array;
}

export interface DecodedTile {
  tx: number;
  tz: number;
  originX: number;
  originZ: number;
  buildings: TileBuilding[];
  roads: TileRoad[];
  rails: TileRail[];
  water: Float32Array[];
  islands: Float32Array[];
  green: Float32Array[];
  sand: Float32Array[];
  flags: number;
}

export function tileOrigin(tx: number, tz: number, tileSize = TILE_SIZE): [number, number] {
  return [(tx + 0.5) * tileSize, (tz + 0.5) * tileSize];
}

const clampI16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v)));

function writeDeltaCoords(view: DataView, off: number, pts: number[], ox: number, oz: number): number {
  let prevX = 0;
  let prevZ = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const qx = clampI16((pts[i] - ox) * COORD_SCALE);
    const qz = clampI16((pts[i + 1] - oz) * COORD_SCALE);
    view.setInt16(off, clampI16(qx - prevX), true);
    view.setInt16(off + 2, clampI16(qz - prevZ), true);
    off += 4;
    prevX = qx;
    prevZ = qz;
  }
  return off;
}

function readDeltaCoords(view: DataView, off: number, count: number, ox: number, oz: number): { arr: Float32Array; next: number } {
  const arr = new Float32Array(count * 2);
  let qx = 0;
  let qz = 0;
  for (let i = 0; i < count; i++) {
    qx += view.getInt16(off, true);
    qz += view.getInt16(off + 2, true);
    off += 4;
    arr[i * 2] = ox + qx / COORD_SCALE;
    arr[i * 2 + 1] = oz + qz / COORD_SCALE;
  }
  return { arr, next: off };
}

export function encodeTile(tile: TileInput, tileSize = TILE_SIZE): Uint8Array {
  const [ox, oz] = tileOrigin(tile.tx, tile.tz, tileSize);
  // Compute exact byte size
  let size = 28; // header
  for (const b of tile.buildings) size += 6 + (b.ring.length / 2) * 4;
  for (const r of tile.roads) size += 4 + (r.points.length / 2) * 4;
  for (const r of tile.rails) size += 4 + (r.points.length / 2) * 4;
  for (const list of [tile.water, tile.islands, tile.green, tile.sand]) {
    for (const poly of list) size += 2 + (poly.length / 2) * 4;
  }

  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  let off = 0;
  view.setUint32(off, TILE_MAGIC, true); off += 4;
  view.setInt16(off, tile.tx, true); off += 2;
  view.setInt16(off, tile.tz, true); off += 2;
  view.setUint16(off, tile.buildings.length, true); off += 2;
  view.setUint16(off, tile.roads.length, true); off += 2;
  view.setUint16(off, tile.rails.length, true); off += 2;
  view.setUint16(off, tile.water.length, true); off += 2;
  view.setUint16(off, tile.islands.length, true); off += 2;
  view.setUint16(off, tile.green.length, true); off += 2;
  view.setUint16(off, tile.sand.length, true); off += 2;
  view.setUint16(off, 0, true); off += 2; // reserved
  view.setUint32(off, tile.flags, true); off += 4;

  for (const b of tile.buildings) {
    view.setUint16(off, Math.max(1, Math.min(65535, Math.round(b.height * 10))), true); off += 2;
    view.setUint8(off, b.style & 0xff); off += 1;
    view.setUint8(off, ((b.roofType & 0x0f) << 4) | (b.tint & 0x0f)); off += 1;
    view.setUint16(off, b.ring.length / 2, true); off += 2;
    off = writeDeltaCoords(view, off, b.ring, ox, oz);
  }
  for (const r of tile.roads) {
    view.setUint8(off, Math.max(1, Math.min(255, Math.round(r.width)))); off += 1;
    view.setUint8(off, r.kind & 0xff); off += 1;
    view.setUint16(off, r.points.length / 2, true); off += 2;
    off = writeDeltaCoords(view, off, r.points, ox, oz);
  }
  for (const r of tile.rails) {
    view.setUint8(off, Math.max(1, Math.min(255, Math.round(r.width)))); off += 1;
    view.setUint8(off, r.kind & 0xff); off += 1;
    view.setUint16(off, r.points.length / 2, true); off += 2;
    off = writeDeltaCoords(view, off, r.points, ox, oz);
  }
  for (const list of [tile.water, tile.islands, tile.green, tile.sand]) {
    for (const poly of list) {
      view.setUint16(off, poly.length / 2, true); off += 2;
      off = writeDeltaCoords(view, off, poly, ox, oz);
    }
  }
  return new Uint8Array(buf);
}

export function decodeTile(buffer: ArrayBuffer, tileSize = TILE_SIZE): DecodedTile {
  const view = new DataView(buffer);
  let off = 0;
  const magic = view.getUint32(off, true); off += 4;
  if (magic !== TILE_MAGIC) throw new Error(`Invalid tile magic: 0x${magic.toString(16)}`);
  const tx = view.getInt16(off, true); off += 2;
  const tz = view.getInt16(off, true); off += 2;
  const buildingCount = view.getUint16(off, true); off += 2;
  const roadCount = view.getUint16(off, true); off += 2;
  const railCount = view.getUint16(off, true); off += 2;
  const waterCount = view.getUint16(off, true); off += 2;
  const islandCount = view.getUint16(off, true); off += 2;
  const greenCount = view.getUint16(off, true); off += 2;
  const sandCount = view.getUint16(off, true); off += 2;
  off += 2; // reserved
  const flags = view.getUint32(off, true); off += 4;

  const [originX, originZ] = tileOrigin(tx, tz, tileSize);

  const buildings: TileBuilding[] = new Array(buildingCount);
  for (let i = 0; i < buildingCount; i++) {
    const height = view.getUint16(off, true) / 10; off += 2;
    const style = view.getUint8(off); off += 1;
    const meta = view.getUint8(off); off += 1;
    const roofType = (meta >> 4) & 0x0f;
    const tint = meta & 0x0f;
    const vertCount = view.getUint16(off, true); off += 2;
    const { arr, next } = readDeltaCoords(view, off, vertCount, originX, originZ);
    off = next;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < arr.length; k += 2) {
      const x = arr[k];
      const z = arr[k + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    buildings[i] = { height, style, roofType, tint, ring: arr, bbox: [x0, z0, x1, z1] };
  }

  const roads: TileRoad[] = new Array(roadCount);
  for (let i = 0; i < roadCount; i++) {
    const width = view.getUint8(off); off += 1;
    const kind = view.getUint8(off); off += 1;
    const vertCount = view.getUint16(off, true); off += 2;
    const { arr, next } = readDeltaCoords(view, off, vertCount, originX, originZ);
    off = next;
    roads[i] = { width, kind, points: arr };
  }

  const rails: TileRail[] = new Array(railCount);
  for (let i = 0; i < railCount; i++) {
    const width = view.getUint8(off); off += 1;
    const kind = view.getUint8(off); off += 1;
    const vertCount = view.getUint16(off, true); off += 2;
    const { arr, next } = readDeltaCoords(view, off, vertCount, originX, originZ);
    off = next;
    rails[i] = { width, kind, points: arr };
  }

  const readPolys = (count: number) => {
    const out: Float32Array[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const vertCount = view.getUint16(off, true); off += 2;
      const { arr, next } = readDeltaCoords(view, off, vertCount, originX, originZ);
      off = next;
      out[i] = arr;
    }
    return out;
  };

  const water = readPolys(waterCount);
  const islands = readPolys(islandCount);
  const green = readPolys(greenCount);
  const sand = readPolys(sandCount);

  return { tx, tz, originX, originZ, buildings, roads, rails, water, islands, green, sand, flags };
}

export function encodeRle(mask: Uint8Array): number[] {
  const rle: number[] = [];
  let cur = 0;
  let run = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0;
    if (v === cur) {
      run++;
    } else {
      rle.push(run);
      cur = v;
      run = 1;
    }
  }
  rle.push(run);
  return rle;
}

export function decodeRle(rle: number[], total: number): Uint8Array {
  const mask = new Uint8Array(total);
  let idx = 0;
  let val = 0;
  for (let i = 0; i < rle.length; i++) {
    const count = rle[i];
    if (val === 1) mask.fill(1, idx, Math.min(total, idx + count));
    idx += count;
    val ^= 1;
  }
  return mask;
}
