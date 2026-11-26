// Converts OpenStreetMap extracts (Overpass JSON, `out tags geom`) into
// tiled binary city maps (SKY1) + index.json for the glider game.
// Run: node --import tsx scripts/build-cities.ts <osm-dir> [dubai|bengaluru|delhi]
// Data © OpenStreetMap contributors, ODbL. The output keeps that attribution.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  TILE_SIZE,
  encodeTile,
  encodeRle,
  type CityId,
  type CityIndex,
  type CityLandmark,
  type LandmarkKind,
  type TileBuildingInput,
  type TileInput,
  type TileRailInput,
  type TileRoadInput,
} from "../src/sky/tileformat";

type LatLon = { lat: number; lon: number };
interface Element {
  type: "way" | "relation" | "node";
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: { role: string; geometry?: LatLon[] }[];
}

interface LandmarkSpec {
  name: string;
  lat: number;
  lon: number;
  height: number;
  radius: number;
  kind: LandmarkKind;
  color: number;
  yaw?: number;
  /** Keep underlying OSM buildings (e.g. around Connaught Place / Stadium) if false */
  clearFootprint?: boolean;
}

interface Spec {
  id: CityId;
  name: string;
  /** Crop, south-west and north-east corners [s, w, n, e]. */
  bounds: [number, number, number, number];
  /** Exact scenic launch point [lat, lon, headingDeg]. */
  spawnLatLon: [number, number, number];
  /** Facade styles: 0 glass tower, 1 residential tower, 2 office glass, 3 Indian mid-rise. */
  style: (h: number, area: number, tags: Record<string, string>, r: number) => number;
  /** Height when OpenStreetMap has none. */
  fallback: (area: number, tags: Record<string, string>, r: number, lat: number, lon: number) => number;
  landmarks: LandmarkSpec[];
}

/** True when (lat, lon) lies inside one of Dubai's high-rise skyscraper corridors. */
function inDubaiSkyscraperZone(lat: number, lon: number): number {
  // Dubai Marina & JBR (supertall cluster)
  if (lat >= 25.069 && lat <= 25.093 && lon >= 55.128 && lon <= 55.153) return 1.0;
  // JLT (Jumeirah Lakes Towers)
  if (lat >= 25.068 && lat <= 25.083 && lon >= 55.138 && lon <= 55.160) return 0.85;
  // Downtown Dubai & Business Bay
  if (lat >= 25.180 && lat <= 25.204 && lon >= 55.252 && lon <= 55.284) return 1.0;
  // Sheikh Zayed Road / DIFC corridor (diagonal spine from Media City to Trade Centre)
  const t = (lat - 25.09) / (25.204 - 25.09);
  if (t >= 0 && t <= 1) {
    const spineLon = 55.155 + t * (55.278 - 55.155);
    if (Math.abs(lon - spineLon) < 0.008) return 0.8;
  }
  return 0;
}

const SPECS: Spec[] = [
  {
    id: "dubai",
    name: "Dubai",
    bounds: [25.068, 55.128, 25.204, 55.284],
    spawnLatLon: [25.0755, 55.1315, 44], // Right off JBR/Marina entrance facing NE into Marina supertalls, Palm, Burj Al Arab & Burj Khalifa!
    style: (h, _a, t, r) => (h > 65 ? (r < 0.62 || /office|commercial|hotel/.test(t.building ?? "") ? 0 : 1) : h > 28 ? (r < 0.45 ? 2 : 1) : 1),
    fallback: (area, t, r, lat, lon) => {
      if (/house|villa|garage|roof|shed/.test(t.building ?? "")) return 8 + r * 4;
      const zone = inDubaiSkyscraperZone(lat, lon);
      if (zone > 0 && area >= 220 && area <= 6500) {
        return Math.round((85 + r * r * 165) * zone);
      }
      return area > 2000 ? 22 + r * 35 : area > 800 ? 12 + r * 14 : 8 + r * 6;
    },
    landmarks: [
      { name: "Burj Khalifa", lat: 25.1972, lon: 55.2744, height: 828, radius: 58, kind: "burj", color: 0xd6e4f0 },
      { name: "Burj Al Arab", lat: 25.1412, lon: 55.1852, height: 321, radius: 42, kind: "sail", color: 0xf8f6f0, yaw: 0.6 },
      { name: "Ain Dubai", lat: 25.0796, lon: 55.1225, height: 250, radius: 36, kind: "wheel", color: 0xf5f5f2, yaw: 0.7 },
      { name: "Cayan Tower", lat: 25.0869, lon: 55.1453, height: 306, radius: 24, kind: "twist", color: 0xc5d6e6 },
      { name: "Princess Tower", lat: 25.0887, lon: 55.1469, height: 413, radius: 25, kind: "spire", color: 0xd0e0ee },
      { name: "Atlantis The Palm", lat: 25.1304, lon: 55.1171, height: 98, radius: 75, kind: "atlantis", color: 0xe8b49a, yaw: -0.75 },
      { name: "Museum of the Future", lat: 25.2032, lon: 55.2815, height: 78, radius: 44, kind: "torus", color: 0xdde5ec, yaw: 0.5 },
      { name: "JW Marriott Marquis", lat: 25.1856, lon: 55.2581, height: 355, radius: 26, kind: "spire", color: 0xaec4d8 },
    ],
  },
  {
    id: "bengaluru",
    name: "Bengaluru",
    bounds: [12.926, 77.566, 13.016, 77.656],
    spawnLatLon: [12.9742, 77.6055, -72], // MG Road / Chinnaswamy looking straight across Cubbon Park at Red High Court, Vidhana Soudha & UB City!
    style: (h, _a, t, r) => (h > 28 ? (r < 0.65 ? 2 : 0) : /commercial|office|retail/.test(t.building ?? "") && r < 0.5 ? 2 : 3),
    fallback: (area, t, r, lat, lon) => {
      const cbd = lat >= 12.966 && lat <= 12.984 && lon >= 77.592 && lon <= 77.620;
      if (cbd && (/office|commercial|hotel/.test(t.building ?? "") || area > 1400)) return 32 + r * 48;
      return area > 2200 ? 18 + r * 22 : area > 550 ? 10 + r * 11 : 6 + r * 6;
    },
    landmarks: [
      { name: "Vidhana Soudha", lat: 12.9796, lon: 77.5907, height: 52, radius: 75, kind: "vidhana", color: 0xf0eadc, yaw: 0.35 },
      { name: "Karnataka High Court", lat: 12.9776, lon: 77.5928, height: 24, radius: 58, kind: "highcourt", color: 0xb83b2b, yaw: 0.35 },
      { name: "Chinnaswamy Stadium", lat: 12.9788, lon: 77.5996, height: 38, radius: 88, kind: "stadium", color: 0xf2efe9 },
      { name: "UB City", lat: 12.9716, lon: 77.5960, height: 128, radius: 38, kind: "spire", color: 0xdccbb2 },
      { name: "Public Utility Building", lat: 12.9746, lon: 77.6119, height: 106, radius: 24, kind: "spire", color: 0xc2ccd4 },
    ],
  },
  {
    id: "delhi",
    name: "Delhi",
    bounds: [28.574, 77.176, 28.664, 77.274],
    spawnLatLon: [28.6126, 77.2368, -88], // East of India Gate looking straight through the Arch down Kartavya Path to Rashtrapati Bhavan & CP!
    style: (h, _a, t, r) => (h > 30 ? (r < 0.7 ? 2 : 0) : /commercial|office/.test(t.building ?? "") && r < 0.45 ? 2 : r < 0.35 ? 1 : 3),
    fallback: (area, t, r, lat, lon) => {
      const cp = Math.hypot(lat - 28.6315, lon - 77.2197) < 0.012;
      if (cp && area > 900) return 22 + r * 38;
      return /office|commercial/.test(t.building ?? "") || area > 2800 ? 22 + r * 28 : area > 850 ? 12 + r * 12 : 8 + r * 6;
    },
    landmarks: [
      { name: "India Gate", lat: 28.6129, lon: 77.2295, height: 44, radius: 28, kind: "indiagate", color: 0xd99b66 },
      { name: "Rashtrapati Bhavan", lat: 28.6143, lon: 77.1994, height: 58, radius: 95, kind: "rashtrapati", color: 0xc97b53 },
      { name: "Parliament House", lat: 28.6172, lon: 77.2082, height: 30, radius: 82, kind: "parliament", color: 0xd8a878 },
      { name: "Connaught Place", lat: 28.6315, lon: 77.2197, height: 22, radius: 165, kind: "connaught", color: 0xf5f2ea, clearFootprint: false },
      { name: "Jama Masjid", lat: 28.6507, lon: 77.2334, height: 44, radius: 55, kind: "mosque", color: 0xc45c44 },
      { name: "Red Fort", lat: 28.6562, lon: 77.2410, height: 34, radius: 95, kind: "redfort", color: 0xb54434 },
      { name: "Humayun's Tomb", lat: 28.5933, lon: 77.2507, height: 47, radius: 52, kind: "tomb", color: 0xc86448 },
      { name: "Civic Centre", lat: 28.6426, lon: 77.2275, height: 112, radius: 24, kind: "spire", color: 0xa8bcc9 },
    ],
  },
];

const ROADS: Record<string, { width: number; kind: number }> = {
  motorway: { width: 24, kind: 2 },
  trunk: { width: 20, kind: 2 },
  primary: { width: 15, kind: 2 },
  secondary: { width: 12, kind: 1 },
  tertiary: { width: 10, kind: 1 },
  motorway_link: { width: 9, kind: 1 },
  trunk_link: { width: 9, kind: 1 },
  primary_link: { width: 8, kind: 1 },
  residential: { width: 7, kind: 0 },
  unclassified: { width: 7, kind: 0 },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function metres(tag?: string) {
  if (!tag) return NaN;
  const n = parseFloat(tag.replace(",", "."));
  return /ft|'/.test(tag) ? n * 0.3048 : n;
}

function area(ring: number[][]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** Ramer–Douglas–Peucker in metres. */
function simplify(points: number[][], tolerance: number): number[][] {
  if (points.length < 4) return points;
  const [a, b] = [points[0], points.at(-1)!];
  let max = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, pz] = points[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const d = Math.abs(dz * px - dx * pz + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) [max, index] = [d, i];
  }
  if (max <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

/** Sutherland–Hodgman polygon clip against axis-aligned rectangle [minX, minZ, maxX, maxZ]. */
function clipPolygonRect(ring: number[][], minX: number, minZ: number, maxX: number, maxZ: number): number[][] {
  let pts = ring;
  const clipEdge = (inside: (p: number[]) => boolean, intersect: (a: number[], b: number[]) => number[]) => {
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const aIn = inside(a);
      const bIn = inside(b);
      if (aIn && bIn) out.push(b);
      else if (aIn && !bIn) out.push(intersect(a, b));
      else if (!aIn && bIn) out.push(intersect(a, b), b);
    }
    pts = out;
  };
  clipEdge((p) => p[0] >= minX, (a, b) => [minX, a[1] + ((b[1] - a[1]) * (minX - a[0])) / (b[0] - a[0] || 1e-9)]);
  if (pts.length < 3) return [];
  clipEdge((p) => p[0] <= maxX, (a, b) => [maxX, a[1] + ((b[1] - a[1]) * (maxX - a[0])) / (b[0] - a[0] || 1e-9)]);
  if (pts.length < 3) return [];
  clipEdge((p) => p[1] >= minZ, (a, b) => [a[0] + ((b[0] - a[0]) * (minZ - a[1])) / (b[1] - a[1] || 1e-9), minZ]);
  if (pts.length < 3) return [];
  clipEdge((p) => p[1] <= maxZ, (a, b) => [a[0] + ((b[0] - a[0]) * (maxZ - a[1])) / (b[1] - a[1] || 1e-9), maxZ]);
  return pts.length >= 3 ? pts : [];
}

/** Clip a polyline to a rectangle, returning 0 or more clipped sub-polylines. */
function clipPolylineRect(line: number[][], minX: number, minZ: number, maxX: number, maxZ: number): number[][][] {
  const out: number[][][] = [];
  let cur: number[][] = [];
  const code = (x: number, z: number) =>
    (x < minX ? 1 : x > maxX ? 2 : 0) | (z < minZ ? 4 : z > maxZ ? 8 : 0);

  for (let i = 0; i + 1 < line.length; i++) {
    let [x0, z0] = line[i];
    let [x1, z1] = line[i + 1];
    let c0 = code(x0, z0);
    let c1 = code(x1, z1);
    let accept = false;
    while (true) {
      if (!(c0 | c1)) {
        accept = true;
        break;
      }
      if (c0 & c1) break;
      const cOut = c0 || c1;
      let x = 0;
      let z = 0;
      if (cOut & 8) {
        x = x0 + ((x1 - x0) * (maxZ - z0)) / (z1 - z0 || 1e-9);
        z = maxZ;
      } else if (cOut & 4) {
        x = x0 + ((x1 - x0) * (minZ - z0)) / (z1 - z0 || 1e-9);
        z = minZ;
      } else if (cOut & 2) {
        z = z0 + ((z1 - z0) * (maxX - x0)) / (x1 - x0 || 1e-9);
        x = maxX;
      } else {
        z = z0 + ((z1 - z0) * (minX - x0)) / (x1 - x0 || 1e-9);
        x = minX;
      }
      if (cOut === c0) {
        x0 = x; z0 = z; c0 = code(x0, z0);
      } else {
        x1 = x; z1 = z; c1 = code(x1, z1);
      }
    }
    if (accept) {
      if (!cur.length) {
        cur.push([x0, z0], [x1, z1]);
      } else {
        const last = cur.at(-1)!;
        if (Math.hypot(last[0] - x0, last[1] - z0) < 0.5) cur.push([x1, z1]);
        else {
          if (cur.length >= 2) out.push(cur);
          cur = [[x0, z0], [x1, z1]];
        }
      }
    } else if (cur.length >= 2) {
      out.push(cur);
      cur = [];
    } else {
      cur = [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

function pointInFlatRing(x: number, z: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1];
    const xj = ring[j], zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function floodSeaMask(half: [number, number], coastLines: number[][][], seaSeed: [number, number]) {
  const cell = 10; // 10 m grid -> preserves narrow 35 m Marina canal mouths & Palm Jumeirah fronds!
  const cols = Math.ceil((half[0] * 2) / cell);
  const rows = Math.ceil((half[1] * 2) / cell);
  const wall = new Uint8Array(cols * rows);
  const toCell = (x: number, z: number) => [Math.floor((x + half[0]) / cell), Math.floor((z + half[1]) / cell)];
  for (const line of coastLines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (cell * 0.45)) + 1;
      let prevC = -1, prevR = -1;
      for (let s = 0; s <= steps; s++) {
        const [c, r] = toCell(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
        if (c >= 0 && r >= 0 && c < cols && r < rows) wall[r * cols + c] = 1;
        // 4-connected corner bridge so diagonal steps never leak without bloating wall width to 32 m
        if (prevC >= 0 && c !== prevC && r !== prevR) {
          if (prevC >= 0 && r >= 0 && prevC < cols && r < rows) wall[r * cols + prevC] = 1;
        }
        prevC = c; prevR = r;
      }
    }
  }
  const mask = new Uint8Array(cols * rows);
  const [sc, sr] = toCell(seaSeed[0], seaSeed[1]);
  const stack: number[] = [];
  if (sc >= 0 && sr >= 0 && sc < cols && sr < rows) stack.push(sr * cols + sc);
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
  for (let i = 0; i < mask.length; i++) {
    if (wall[i] && (mask[i - 1] || mask[i + 1] || mask[i - cols] || mask[i + cols])) mask[i] = 2;
  }
  for (let i = 0; i < mask.length; i++) if (mask[i] === 2) mask[i] = 1;
  return { cell, cols, rows, mask };
}

function build(spec: Spec, dir: string) {
  const raw = JSON.parse(readFileSync(join(dir, `${spec.id}.json`), "utf8")) as { elements: Element[] };
  const [s, w, n, e] = spec.bounds;
  const lat0 = (s + n) / 2;
  const lon0 = (w + e) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const kz = 110540;
  const local = (p: LatLon): [number, number] => [(p.lon - lon0) * kx, -(p.lat - lat0) * kz];
  const half: [number, number] = [Math.round(((e - w) / 2) * kx), Math.round(((n - s) / 2) * kz)];
  const inside = (q: number[]) => Math.abs(q[0]) <= half[0] && Math.abs(q[1]) <= half[1];
  const flat = (ring: number[][]) => ring.flatMap(([x, z]) => [Math.round(x * 4) / 4, Math.round(z * 4) / 4]);

  const stitch = (parts: LatLon[][]) => {
    const same = (a: LatLon, b: LatLon) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
    const pool = parts.map((p) => [...p]);
    const out: LatLon[][] = [];
    while (pool.length) {
      let ring = pool.shift()!;
      for (let grew = true; grew && !same(ring[0], ring.at(-1)!); ) {
        grew = false;
        for (let i = 0; i < pool.length; i++) {
          const c = pool[i];
          if (same(ring.at(-1)!, c[0])) ring = [...ring, ...c.slice(1)];
          else if (same(ring.at(-1)!, c.at(-1)!)) ring = [...ring, ...[...c].reverse().slice(1)];
          else if (same(ring[0], c.at(-1)!)) ring = [...c, ...ring.slice(1)];
          else if (same(ring[0], c[0])) ring = [...[...c].reverse(), ...ring.slice(1)];
          else continue;
          pool.splice(i, 1);
          grew = true;
          break;
        }
      }
      if (same(ring[0], ring.at(-1)!)) out.push(ring);
    }
    return out;
  };
  const members = (el: Element, role: string) =>
    stitch((el.members ?? []).filter((m) => m.role === role && m.geometry).map((m) => m.geometry!));
  const rings = (el: Element) => (el.type === "way" ? (el.geometry ? [el.geometry] : []) : members(el, "outer"));
  const closedRing = (g: LatLon[]) => {
    const pts = g.map(local);
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]) < 0.5) pts.pop();
    return pts;
  };

  const tileMap = new Map<string, TileInput>();
  const getTile = (tx: number, tz: number) => {
    const key = `${tx},${tz}`;
    let t = tileMap.get(key);
    if (!t) {
      t = { tx, tz, buildings: [], roads: [], rails: [], water: [], islands: [], green: [], sand: [], flags: 0 };
      tileMap.set(key, t);
    }
    return t;
  };

  const minTx = Math.floor(-half[0] / TILE_SIZE);
  const maxTx = Math.floor((half[0] - 1) / TILE_SIZE);
  const minTz = Math.floor(-half[1] / TILE_SIZE);
  const maxTz = Math.floor((half[1] - 1) / TILE_SIZE);

  // Landmarks in local coordinates
  const landmarks: CityLandmark[] = spec.landmarks.map((lm) => {
    const [x, z] = local({ lat: lm.lat, lon: lm.lon });
    return {
      name: lm.name,
      x: Math.round(x),
      z: Math.round(z),
      height: lm.height,
      radius: lm.radius,
      kind: lm.kind,
      color: lm.color,
      yaw: lm.yaw,
    };
  });
  const clearLandmarks = spec.landmarks
    .map((lm, i) => ({ lm, local: landmarks[i] }))
    .filter(({ lm }) => lm.clearFootprint !== false)
    .map(({ local: l }) => l);

  // Track all buildings for spatial grid (thermals / legs / obstacles)
  const allBuildings: { h: number; x0: number; z0: number; x1: number; z1: number }[] = [];
  const allWater: number[][] = [];
  const allIslands: number[][] = [];
  const coast: number[][][] = [];
  let tallest = 0;

  for (const lm of landmarks) {
    tallest = Math.max(tallest, lm.height);
    allBuildings.push({
      h: lm.height,
      x0: lm.x - lm.radius,
      z0: lm.z - lm.radius,
      x1: lm.x + lm.radius,
      z1: lm.z + lm.radius,
    });
  }

  for (const el of raw.elements) {
    const t = el.tags ?? {};
    if (t.building) {
      if (Number(t.layer) < 0 || t.location === "underground" || t.building === "roof") continue;
      for (const g of rings(el)) {
        let ring = simplify(closedRing(g), 1.1);
        if (ring.length < 3 || !ring.some(inside)) continue;
        const a = Math.abs(area(ring));
        if (a < 55) continue; // skip tiny shacks/garages to keep tiles lean
        if (area(ring) < 0) ring = ring.reverse(); // counter-clockwise in x/z
        let cx = 0, cz = 0;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const [x, z] of ring) {
          cx += x; cz += z;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        cx /= ring.length; cz /= ring.length;
        // Skip generic OSM footprints directly under a procedural hero landmark so they don't z-fight
        if (clearLandmarks.some((lm) => Math.hypot(cx - lm.x, cz - lm.z) < lm.radius * 0.85)) continue;

        const r = hash(String(g[0].lat) + String(g[0].lon));
        const tagged = metres(t.height) || (Number(t["building:levels"]) ? Number(t["building:levels"]) * 3.4 + 3 : NaN);
        const h = Math.round(Math.min(500, Number.isFinite(tagged) && tagged > 2 ? tagged : spec.fallback(a, t, r, g[0].lat, g[0].lon)));
        tallest = Math.max(tallest, h);
        const style = spec.style(h, a, t, r);
        const roofType = h > 55 ? 1 : 0; // parapet/stepped roof on towers
        const tint = Math.floor(r * 8) & 7;
        const tx = Math.floor(cx / TILE_SIZE);
        const tz = Math.floor(cz / TILE_SIZE);
        if (tx < minTx || tx > maxTx || tz < minTz || tz > maxTz) continue;
        const bInput: TileBuildingInput = { height: h, style, roofType, tint, ring: flat(ring) };
        getTile(tx, tz).buildings.push(bInput);
        allBuildings.push({ h, x0, z0, x1, z1 });
      }
      continue;
    }

    if (t.highway && el.geometry) {
      const roadSpec = ROADS[t.highway];
      if (!roadSpec) continue;
      const line = simplify(el.geometry.map(local), roadSpec.kind === 0 ? 2.5 : 1.5);
      if (line.length < 2 || !line.some(inside)) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of line) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      const tX0 = Math.max(minTx, Math.floor(x0 / TILE_SIZE));
      const tX1 = Math.min(maxTx, Math.floor(x1 / TILE_SIZE));
      const tZ0 = Math.max(minTz, Math.floor(z0 / TILE_SIZE));
      const tZ1 = Math.min(maxTz, Math.floor(z1 / TILE_SIZE));
      for (let tx = tX0; tx <= tX1; tx++) {
        for (let tz = tZ0; tz <= tZ1; tz++) {
          const rx0 = tx * TILE_SIZE - 8;
          const rz0 = tz * TILE_SIZE - 8;
          const rx1 = (tx + 1) * TILE_SIZE + 8;
          const rz1 = (tz + 1) * TILE_SIZE + 8;
          for (const seg of clipPolylineRect(line, rx0, rz0, rx1, rz1)) {
            const roadIn: TileRoadInput = { width: roadSpec.width, kind: roadSpec.kind, points: flat(seg) };
            getTile(tx, tz).roads.push(roadIn);
          }
        }
      }
      continue;
    }

    if (t.railway && el.geometry) {
      const elevated = t.railway === "monorail" || t.bridge === "yes" || Number(t.layer) > 0;
      const line = simplify(el.geometry.map(local), 2);
      if (line.length < 2 || !line.some(inside)) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of line) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      const tX0 = Math.max(minTx, Math.floor(x0 / TILE_SIZE));
      const tX1 = Math.min(maxTx, Math.floor(x1 / TILE_SIZE));
      const tZ0 = Math.max(minTz, Math.floor(z0 / TILE_SIZE));
      const tZ1 = Math.min(maxTz, Math.floor(z1 / TILE_SIZE));
      for (let tx = tX0; tx <= tX1; tx++) {
        for (let tz = tZ0; tz <= tZ1; tz++) {
          const rx0 = tx * TILE_SIZE - 8;
          const rz0 = tz * TILE_SIZE - 8;
          const rx1 = (tx + 1) * TILE_SIZE + 8;
          const rz1 = (tz + 1) * TILE_SIZE + 8;
          for (const seg of clipPolylineRect(line, rx0, rz0, rx1, rz1)) {
            const railIn: TileRailInput = { width: elevated ? 8 : 5, kind: elevated ? 1 : 0, points: flat(seg) };
            getTile(tx, tz).rails.push(railIn);
          }
        }
      }
      continue;
    }

    if (t.natural === "coastline" && el.geometry) {
      coast.push(el.geometry.map(local));
      continue;
    }

    const addPolygonToTiles = (ring: number[][], bucket: "water" | "islands" | "green" | "sand") => {
      if (ring.length < 3 || !ring.some(inside)) return;
      if (Math.abs(area(ring)) < 150) return;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of ring) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      const tX0 = Math.max(minTx, Math.floor(x0 / TILE_SIZE));
      const tX1 = Math.min(maxTx, Math.floor(x1 / TILE_SIZE));
      const tZ0 = Math.max(minTz, Math.floor(z0 / TILE_SIZE));
      const tZ1 = Math.min(maxTz, Math.floor(z1 / TILE_SIZE));
      for (let tx = tX0; tx <= tX1; tx++) {
        for (let tz = tZ0; tz <= tZ1; tz++) {
          const clipped = clipPolygonRect(ring, tx * TILE_SIZE - 2, tz * TILE_SIZE - 2, (tx + 1) * TILE_SIZE + 2, (tz + 1) * TILE_SIZE + 2);
          if (clipped.length >= 3 && Math.abs(area(clipped)) >= 80) {
            getTile(tx, tz)[bucket].push(flat(clipped));
          }
        }
      }
    };

    if ((t.natural === "water" || t.waterway === "riverbank") && el.type === "relation") {
      for (const g of members(el, "outer")) {
        const ring = simplify(closedRing(g), 2);
        if (ring.length >= 3 && ring.some(inside)) {
          allWater.push(flat(ring));
          addPolygonToTiles(ring, "water");
        }
      }
      for (const g of members(el, "inner")) {
        const ring = simplify(closedRing(g), 2);
        if (ring.length >= 3 && ring.some(inside)) {
          allIslands.push(flat(ring));
          addPolygonToTiles(ring, "islands");
        }
      }
      continue;
    }

    const bucket =
      t.natural === "water" || t.waterway === "riverbank" ? "water"
      : t.natural === "beach" || t.natural === "sand" ? "sand"
      : t.leisure || t.landuse || t.natural ? "green" : null;
    if (!bucket) continue;
    for (const g of rings(el)) {
      const ring = simplify(closedRing(g), 2);
      if (bucket === "water" && ring.length >= 3 && ring.some(inside)) allWater.push(flat(ring));
      addPolygonToTiles(ring, bucket);
    }
  }

  // Sea flood mask for Dubai
  const seaSeed: [number, number] | null = spec.id === "dubai" ? [-half[0] + 200, -half[1] + 200] : null;
  const sea = seaSeed && coast.length ? floodSeaMask(half, coast, seaSeed) : null;

  // Spatial roof grid for thermals + autopilot legs
  const GRID = 80;
  const bGrid = new Map<string, number[]>();
  allBuildings.forEach((b, idx) => {
    for (let gx = Math.floor(b.x0 / GRID); gx <= Math.floor(b.x1 / GRID); gx++) {
      for (let gz = Math.floor(b.z0 / GRID); gz <= Math.floor(b.z1 / GRID); gz++) {
        const k = `${gx},${gz}`;
        if (!bGrid.has(k)) bGrid.set(k, []);
        bGrid.get(k)!.push(idx);
      }
    }
  });
  const roofAt = (x: number, z: number, radius: number) => {
    let top = 0;
    const seen = new Set<number>();
    for (let gx = Math.floor((x - radius) / GRID); gx <= Math.floor((x + radius) / GRID); gx++) {
      for (let gz = Math.floor((z - radius) / GRID); gz <= Math.floor((z + radius) / GRID); gz++) {
        for (const i of bGrid.get(`${gx},${gz}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = allBuildings[i];
          const dx = Math.max(b.x0 - x, 0, x - b.x1);
          const dz = Math.max(b.z0 - z, 0, z - b.z1);
          if (dx * dx + dz * dz <= radius * radius) top = Math.max(top, b.h);
        }
      }
    }
    return top;
  };
  const isWater = (x: number, z: number) => {
    if (sea) {
      const c = Math.floor((x + half[0]) / sea.cell);
      const r = Math.floor((z + half[1]) / sea.cell);
      if (c >= 0 && r >= 0 && c < sea.cols && r < sea.rows && sea.mask[r * sea.cols + c]) return true;
    }
    return allWater.some((w) => pointInFlatRing(x, z, w)) && !allIslands.some((w) => pointInFlatRing(x, z, w));
  };

  // Spawn coordinates
  const [spawnX, spawnZ] = local({ lat: spec.spawnLatLon[0], lon: spec.spawnLatLon[1] });
  const spawnHeading = (spec.spawnLatLon[2] * Math.PI) / 180;

  // Exact breeze matching src/sky/citydata.ts so thermalCore(t0, launchY) lands right on (spawnX, spawnZ)!
  const CITY_BREEZE: Record<CityId, [number, number]> = {
    dubai: [3.2, 3.2],
    bengaluru: [3, 0.6],
    delhi: [2.2, 1.6],
  };
  const [bx, bz] = CITY_BREEZE[spec.id];
  const t0Strength = 4.8;
  // Target scenic launch altitude (~240 m in Dubai Marina, ~175 m in Bengaluru & Delhi)
  const targetLaunchY = Math.max(spec.id === "dubai" ? 245 : 175, roofAt(spawnX, spawnZ, 75) + 55);
  const rise0 = targetLaunchY / t0Strength;
  const t0Base: [number, number] = [spawnX - bx * rise0, spawnZ - bz * rise0];

  // Second thermal: ~850 m ahead along the exact scenic spawnHeading so Frame 1 points dead at the landmarks!
  const fwdX = Math.sin(spawnHeading);
  const fwdZ = -Math.cos(spawnHeading);
  const t1Target: [number, number] = [t0Base[0] + fwdX * 850, t0Base[1] + fwdZ * 850];

  const candidates: [number, number][] = [];
  const inset = 500;
  for (let x = -half[0] + inset; x <= half[0] - inset; x += 200) {
    for (let z = -half[1] + inset; z <= half[1] - inset; z += 200) {
      if (!isWater(x, z) && roofAt(x, z, 95) < 40) candidates.push([x, z]);
    }
  }
  const sites: [number, number][] = [t0Base, t1Target];
  if (candidates.length) {
    while (sites.length < 22) {
      let best: [number, number] | null = null;
      let bestD = 0;
      for (const c of candidates) {
        const d = Math.min(...sites.map((st) => Math.hypot(st[0] - c[0], st[1] - c[1])));
        if (d > bestD) [best, bestD] = [c, d];
      }
      if (!best || bestD < 750) break;
      sites.push(best);
    }
  }
  const tour = [sites[0], sites[1]];
  const left = sites.slice(2);
  while (left.length) {
    const last = tour.at(-1)!;
    left.sort((a, b) => Math.hypot(a[0] - last[0], a[1] - last[1]) - Math.hypot(b[0] - last[0], b[1] - last[1]));
    tour.push(left.shift()!);
  }
  const path = tour.length > 2 ? [...tour, ...tour.slice(1, -1).reverse()] : tour;
  const legs = path.map((from, i) => {
    const to = path[(i + 1) % path.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    let clear = 0;
    for (let d = 0; d <= length; d += 25) {
      const f = length ? d / length : 0;
      // Check clearance along the downwind-drifted glide line (around ~220 m height)
      const drift = 220 / t0Strength;
      clear = Math.max(clear, roofAt(from[0] + bx * drift + (to[0] - from[0]) * f, from[1] + bz * drift + (to[1] - from[1]) * f, 65));
    }
    const depart = i === 0 ? Math.max(targetLaunchY - 20, clear + 35 + length / 7) : Math.min(440, clear + 38 + length / 6.2);
    return {
      from: [Math.round(from[0]), Math.round(from[1])] as [number, number],
      to: [Math.round(to[0]), Math.round(to[1])] as [number, number],
      depart: Math.round(depart),
    };
  });
  const thermalTop = Math.max(Math.min(tallest, 480) + 140, ...legs.map((l) => l.depart + 90));
  const thermals = sites.map(([x, z], i) => ({
    x: Math.round(x),
    z: Math.round(z),
    radius: 220,
    strength: +(4.8 + (i % 3) * 0.4).toFixed(1),
    top: Math.round(thermalTop),
  }));

  // Top 220 tall obstacles (> 45 m) for ridge lift
  const topObstacles = allBuildings
    .filter((b) => b.h > 45)
    .sort((a, b) => b.h - a.h)
    .slice(0, 220);
  const obstacles: number[] = [];
  for (const b of topObstacles) {
    obstacles.push(
      Math.round((b.x0 + b.x1) / 2),
      Math.round((b.z0 + b.z1) / 2),
      Math.round(b.x1 - b.x0),
      Math.round(b.z1 - b.z0),
      Math.round(b.h),
    );
  }

  // Write binary tiles
  const outDir = join("public/assets/sky", spec.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const tileKeys: string[] = [];
  let totalRaw = 0;
  let totalGz = 0;
  let totalBld = 0;
  let totalRoads = 0;
  let totalRails = 0;
  let maxTileGz = 0;

  for (const [key, tile] of tileMap.entries()) {
    const empty =
      !tile.buildings.length && !tile.roads.length && !tile.rails.length &&
      !tile.water.length && !tile.islands.length && !tile.green.length && !tile.sand.length;
    if (empty) continue;
    const bin = encodeTile(tile, TILE_SIZE);
    const gz = gzipSync(bin, { level: 9 }).length;
    writeFileSync(join(outDir, `t_${tile.tx}_${tile.tz}.bin`), bin);
    tileKeys.push(key);
    totalRaw += bin.length;
    totalGz += gz;
    maxTileGz = Math.max(maxTileGz, gz);
    totalBld += tile.buildings.length;
    totalRoads += tile.roads.length;
    totalRails += tile.rails.length;
  }

  const index: CityIndex = {
    version: 2,
    id: spec.id,
    name: spec.name,
    attribution: "Map data © OpenStreetMap contributors (ODbL)",
    half,
    tileSize: TILE_SIZE,
    minTx,
    maxTx,
    minTz,
    maxTz,
    tallest: Math.round(tallest),
    spawn: [Math.round(spawnX), Math.round(spawnZ), +spawnHeading.toFixed(3)],
    tiles: tileKeys.sort(),
    thermals,
    legs,
    obstacles,
    landmarks,
    sea: sea ? { cell: sea.cell, cols: sea.cols, rows: sea.rows, rle: encodeRle(sea.mask) } : null,
  };

  // Postcards: named places worth a detour — heritage, monuments, places of
  // worship, museums, stadiums, big parks, named towers — spread across the map.
  const picks: { name: string; x: number; z: number; radius: number; height: number; kind: string; score: number }[] = [];
  for (const el of raw.elements) {
    const t = el.tags ?? {};
    const name = (t["name:en"] ?? t.name ?? "").trim();
    if (!name || !/^[A-Z0-9][\x20-\x7E]+$/.test(name) || name.length > 34) continue;
    if (/^(mosque|masjid|temple|church|park|garden|stadium|mandir)$/i.test(name)) continue;
    const pts: LatLon[] = el.geometry ?? el.members?.flatMap((m) => m.geometry ?? []) ?? [];
    if (pts.length < 3) continue;
    const loc = pts.map(local);
    const xs = loc.map((q) => q[0]);
    const zs = loc.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    if (Math.abs(cx) > half[0] - 300 || Math.abs(cz) > half[1] - 300) continue;
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
    const levels = Number(t["building:levels"]) || 0;
    const height = Number.parseFloat(t.height ?? "") || levels * 3.4 || 0;
    const classify = (): [string, number] | null => {
      if (t.historic && t.historic !== "yes") return ["heritage", 7];
      if (/^(attraction|museum|viewpoint|zoo|theme_park|gallery|aquarium)$/.test(t.tourism ?? "")) return ["sight", 6];
      if (t.amenity === "place_of_worship" || /^(temple|mosque|church|cathedral|gurudwara)$/.test(t.building ?? "")) return ["worship", 5];
      if (t.leisure === "stadium") return ["stadium", 5];
      if (/^(park|garden|nature_reserve)$/.test(t.leisure ?? "") && span > 160) return ["park", 3 + Math.min(3, span / 400)];
      if (height >= 250 || (height >= 120 && (t.wikidata || t.wikipedia))) return ["tower", 3 + Math.min(3, height / 200)];
      if (t.shop === "mall") return ["market", 3];
      return null;
    };
    const found = classify();
    if (!found) continue;
    const kind = found[0];
    let score = found[1];
    if (t.wikidata || t.wikipedia) score += 3;
    if (kind === "worship" && !(t.wikidata || t.wikipedia)) score -= 2.5;
    picks.push({ name, x: Math.round(cx), z: Math.round(cz), radius: Math.round(Math.min(160, Math.max(30, span))), height: Math.round(Math.max(height, kind === "park" ? 0 : 25)), kind, score });
  }
  picks.sort((a, b) => b.score - a.score);
  const postcards: typeof picks = [];
  const perKind = new Map<string, number>();
  for (const p of picks) {
    if (postcards.length >= 32) break;
    if ((perKind.get(p.kind) ?? 0) >= 9 || p.score < 3) continue;
    const near = [...postcards, ...landmarks.map((l) => ({ ...l, score: 0, kind: "" }))].some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 420 || q.name === p.name);
    if (!near) {
      postcards.push(p);
      perKind.set(p.kind, (perKind.get(p.kind) ?? 0) + 1);
    }
  }
  index.postcards = postcards.map((p) => ({ name: p.name, x: p.x, z: p.z, radius: p.radius, height: p.height, kind: p.kind }));

  const indexJson = JSON.stringify(index);
  writeFileSync(join(outDir, "index.json"), indexJson);
  const indexGz = gzipSync(indexJson, { level: 9 }).length;
  console.log(
    `${spec.id}: ${(half[0] * 2 / 1000).toFixed(1)}×${(half[1] * 2 / 1000).toFixed(1)} km, ` +
    `${tileKeys.length} tiles, ${totalBld} buildings (tallest ${tallest} m), ${totalRoads} road segs, ${totalRails} rail segs, ` +
    `${landmarks.length} landmarks, ${index.postcards?.length ?? 0} postcards, index ${(indexGz / 1024).toFixed(1)} KB gz, ` +
    `tiles ${(totalRaw / 1024).toFixed(0)} KB raw / ${(totalGz / 1024).toFixed(0)} KB gz (avg ${(totalGz / Math.max(1, tileKeys.length) / 1024).toFixed(1)} KB gz, max ${(maxTileGz / 1024).toFixed(1)} KB gz)`,
  );
}

const dir = process.argv[2];
if (!dir) throw new Error("Pass the folder holding <city>.json Overpass extracts");
const filter = process.argv.slice(3);
const list = filter.length ? SPECS.filter((s) => filter.includes(s.id)) : SPECS;
for (const spec of list) build(spec, dir);
