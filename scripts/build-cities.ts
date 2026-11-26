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
}

interface Spec {
  id: CityId;
  name: string;
  /** Crop, south-west and north-east corners [s, w, n, e]. */
  bounds: [number, number, number, number];
  /** Preferred launch district [lat, lon, headingDeg]. */
  spawnLatLon: [number, number, number];
  /** Facade styles: 0 glass tower, 1 residential tower, 2 office glass, 3 Indian mid-rise. */
  style: (h: number, area: number, tags: Record<string, string>, r: number) => number;
  /** Height when OpenStreetMap has none. */
  fallback: (area: number, tags: Record<string, string>, r: number) => number;
  landmarks: LandmarkSpec[];
}

const SPECS: Spec[] = [
  {
    id: "dubai",
    name: "Dubai",
    bounds: [25.068, 55.128, 25.204, 55.284],
    spawnLatLon: [25.080, 55.140, 42], // Dubai Marina looking NE along the skyscrapers toward Palm, SZR & Burj Khalifa
    style: (h, _a, t, r) => (h > 65 ? (r < 0.6 || /office|commercial|hotel/.test(t.building ?? "") ? 0 : 1) : h > 28 ? (r < 0.45 ? 2 : 1) : 1),
    fallback: (area, t, r) => (/house|villa|garage|roof|shed/.test(t.building ?? "") ? 7 : area > 2000 ? 22 + r * 35 : area > 800 ? 12 + r * 14 : 8 + r * 6),
    landmarks: [
      { name: "Burj Khalifa", lat: 25.1972, lon: 55.2744, height: 828, radius: 52, kind: "burj", color: 0xcfdbe6 },
      { name: "Burj Al Arab", lat: 25.1412, lon: 55.1852, height: 321, radius: 34, kind: "sail", color: 0xf4f1e8 },
      { name: "Princess Tower", lat: 25.0887, lon: 55.1469, height: 413, radius: 22, kind: "spire", color: 0xb9cde0 },
      { name: "JW Marriott Marquis", lat: 25.1856, lon: 55.2581, height: 355, radius: 24, kind: "spire", color: 0xaec4d8 },
      { name: "Address Downtown", lat: 25.1944, lon: 55.2791, height: 302, radius: 22, kind: "spire", color: 0xd8cdb8 },
    ],
  },
  {
    id: "bengaluru",
    name: "Bengaluru",
    bounds: [12.926, 77.566, 13.016, 77.656],
    spawnLatLon: [12.968, 77.606, -48], // Near MG Road looking NW toward UB City, Cubbon Park & Vidhana Soudha
    style: (h, _a, t, r) => (h > 30 ? (r < 0.6 ? 2 : 1) : /commercial|office|retail/.test(t.building ?? "") && r < 0.45 ? 2 : 3),
    fallback: (area, _t, r) => (area > 2500 ? 16 + r * 18 : area > 600 ? 9 + r * 9 : 6 + r * 5),
    landmarks: [
      { name: "Vidhana Soudha", lat: 12.9796, lon: 77.5907, height: 46, radius: 64, kind: "dome", color: 0xe2d6c2 },
      { name: "UB City", lat: 12.9716, lon: 77.596, height: 123, radius: 24, kind: "spire", color: 0x9fb8cc },
      { name: "Public Utility Building", lat: 12.9746, lon: 77.6119, height: 106, radius: 20, kind: "spire", color: 0xc9c2b4 },
    ],
  },
  {
    id: "delhi",
    name: "Delhi",
    bounds: [28.574, 77.176, 28.664, 77.274],
    spawnLatLon: [28.613, 77.239, -86], // East of India Gate looking W along Kartavya Path toward Rashtrapati Bhavan & CP
    style: (h, _a, t, r) => (h > 32 ? (r < 0.7 ? 2 : 0) : /commercial|office/.test(t.building ?? "") && r < 0.4 ? 2 : r < 0.35 ? 1 : 3),
    fallback: (area, t, r) => (/office|commercial/.test(t.building ?? "") || area > 3000 ? 24 + r * 28 : area > 900 ? 12 + r * 12 : 7 + r * 5),
    landmarks: [
      { name: "India Gate", lat: 28.6129, lon: 77.2295, height: 42, radius: 26, kind: "arch", color: 0xd9b382 },
      { name: "Rashtrapati Bhavan", lat: 28.6143, lon: 77.1994, height: 54, radius: 72, kind: "dome", color: 0xc98a63 },
      { name: "Civic Centre", lat: 28.6426, lon: 77.2275, height: 112, radius: 22, kind: "spire", color: 0xa8bcc9 },
      { name: "Jama Masjid", lat: 28.6507, lon: 77.2334, height: 41, radius: 42, kind: "dome", color: 0xd6c7b4 },
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
  const cell = 16; // 16 m grid -> ~950x950 for 15 km city (~900 KB raw, ~15 KB RLE!)
  const cols = Math.ceil((half[0] * 2) / cell);
  const rows = Math.ceil((half[1] * 2) / cell);
  const wall = new Uint8Array(cols * rows);
  const toCell = (x: number, z: number) => [Math.floor((x + half[0]) / cell), Math.floor((z + half[1]) / cell)];
  for (const line of coastLines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (cell / 2)) + 1;
      for (let s = 0; s <= steps; s++) {
        const [c, r] = toCell(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1]]) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) wall[rr * cols + cc] = 1;
        }
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
    return { name: lm.name, x: Math.round(x), z: Math.round(z), height: lm.height, radius: lm.radius, kind: lm.kind, color: lm.color };
  });

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
        if (landmarks.some((lm) => Math.hypot(cx - lm.x, cz - lm.z) < lm.radius * 0.85)) continue;

        const r = hash(String(g[0].lat) + String(g[0].lon));
        const tagged = metres(t.height) || (Number(t["building:levels"]) ? Number(t["building:levels"]) * 3.4 + 3 : NaN);
        const h = Math.round(Math.min(500, Number.isFinite(tagged) && tagged > 2 ? tagged : spec.fallback(a, t, r)));
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

  // Thermals across the full city (up to 24), clustered closer near the iconic spawn district
  // so legs stay ~800-1100 m and the plane launches at dramatic skyline altitude (~170-300 m).
  const candidates: [number, number][] = [];
  const inset = 500;
  for (let x = -half[0] + inset; x <= half[0] - inset; x += 200) {
    for (let z = -half[1] + inset; z <= half[1] - inset; z += 200) {
      if (!isWater(x, z) && roofAt(x, z, 95) < 40) candidates.push([x, z]);
    }
  }
  const sites: [number, number][] = [];
  if (candidates.length) {
    // First thermal: nearest candidate to the iconic spawn point
    sites.push(candidates.reduce((a, b) => (Math.hypot(b[0] - spawnX, b[1] - spawnZ) < Math.hypot(a[0] - spawnX, a[1] - spawnZ) ? b : a)));
    // Second thermal: ~750-1100 m ahead along the scenic spawn heading
    const hx = Math.sin(spawnHeading);
    const hz = -Math.cos(spawnHeading);
    const second = candidates
      .filter((c) => {
        const d = Math.hypot(c[0] - sites[0][0], c[1] - sites[0][1]);
        return d >= 650 && d <= 1250;
      })
      .sort((a, b) => {
        const da = (a[0] - sites[0][0]) * hx + (a[1] - sites[0][1]) * hz;
        const db = (b[0] - sites[0][0]) * hx + (b[1] - sites[0][1]) * hz;
        return db - da;
      })[0];
    if (second) sites.push(second);
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
  const tour = sites.length ? [sites[0]] : [];
  const left = sites.slice(1);
  if (left.length && sites.length > 1) tour.push(left.shift()!); // keep the scenic first leg!
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
      clear = Math.max(clear, roofAt(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, 60));
    }
    return {
      from: [Math.round(from[0]), Math.round(from[1])] as [number, number],
      to: [Math.round(to[0]), Math.round(to[1])] as [number, number],
      depart: Math.round(Math.min(380, clear + 35 + length / 6.5)),
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

  const indexJson = JSON.stringify(index);
  writeFileSync(join(outDir, "index.json"), indexJson);
  const indexGz = gzipSync(indexJson, { level: 9 }).length;
  console.log(
    `${spec.id}: ${(half[0] * 2 / 1000).toFixed(1)}×${(half[1] * 2 / 1000).toFixed(1)} km, ` +
    `${tileKeys.length} tiles, ${totalBld} buildings (tallest ${tallest} m), ${totalRoads} road segs, ${totalRails} rail segs, ` +
    `${landmarks.length} landmarks, index ${(indexGz / 1024).toFixed(1)} KB gz, ` +
    `tiles ${(totalRaw / 1024).toFixed(0)} KB raw / ${(totalGz / 1024).toFixed(0)} KB gz (avg ${(totalGz / Math.max(1, tileKeys.length) / 1024).toFixed(1)} KB gz, max ${(maxTileGz / 1024).toFixed(1)} KB gz)`,
  );
}

const dir = process.argv[2];
if (!dir) throw new Error("Pass the folder holding <city>.json Overpass extracts");
const filter = process.argv.slice(3);
const list = filter.length ? SPECS.filter((s) => filter.includes(s.id)) : SPECS;
for (const spec of list) build(spec, dir);
