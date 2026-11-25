// Converts OpenStreetMap extracts (Overpass JSON, `out geom`) into the compact
// city files the glider game loads. Run: node --import tsx scripts/build-cities.ts <osm-dir>
// Data © OpenStreetMap contributors, ODbL. The output keeps that attribution.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type LatLon = { lat: number; lon: number };
interface Element {
  type: "way" | "relation" | "node";
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: { role: string; geometry?: LatLon[] }[];
}
interface Spec {
  id: "dubai" | "bengaluru" | "delhi";
  name: string;
  /** Crop, south-west and north-east corners. */
  bounds: [number, number, number, number];
  /** Facade styles: 0 glass tower, 1 residential tower, 2 office glass, 3 Indian mid-rise. */
  style: (h: number, area: number, tags: Record<string, string>, r: number) => number;
  /** Height when OpenStreetMap has none. */
  fallback: (area: number, tags: Record<string, string>, r: number) => number;
}

const SPECS: Spec[] = [
  {
    id: "dubai",
    name: "Dubai Marina",
    bounds: [25.066, 55.124, 25.094, 55.156],
    style: (h, _a, t, r) => (h > 70 ? (r < 0.55 || /office|commercial/.test(t.building) ? 0 : 1) : 1),
    fallback: (area, t, r) => (/house|villa|garage|roof/.test(t.building) ? 7 : area > 1500 ? 18 + r * 30 : 9 + r * 9),
  },
  {
    id: "bengaluru",
    name: "Bengaluru",
    bounds: [12.966, 77.602, 12.986, 77.624],
    style: (h, _a, t, r) => (h > 32 ? (r < 0.6 ? 2 : 1) : /commercial|office|retail/.test(t.building) && r < 0.4 ? 2 : 3),
    fallback: (area, _t, r) => (area > 2500 ? 14 + r * 16 : area > 600 ? 8 + r * 8 : 5 + r * 5),
  },
  {
    id: "delhi",
    name: "Delhi NCR · Cyber City",
    bounds: [28.486, 77.078, 28.504, 77.099],
    style: (h, _a, _t, r) => (h > 30 ? (r < 0.75 ? 2 : 0) : r < 0.5 ? 1 : 3),
    // Cyber City's office blocks are 15–25 storeys; footprints are the best hint OSM gives.
    fallback: (area, t, r) => (/office|commercial/.test(t.building) || area > 3000 ? 40 + r * 45 : area > 900 ? 14 + r * 16 : 6 + r * 6),
  },
];

const ROADS: Record<string, number> = {
  motorway: 26, trunk: 22, primary: 16, secondary: 12, tertiary: 10, motorway_link: 8, trunk_link: 8, primary_link: 8,
  residential: 7, unclassified: 7, service: 4,
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

function build(spec: Spec, dir: string) {
  const raw = JSON.parse(readFileSync(join(dir, `${spec.id}.json`), "utf8")) as { elements: Element[] };
  const [s, w, n, e] = spec.bounds;
  const lat0 = (s + n) / 2;
  const lon0 = (w + e) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const kz = 110540;
  // x east, z south (north is -z), metres from the centre.
  const local = (p: LatLon) => [(p.lon - lon0) * kx, -(p.lat - lat0) * kz];
  const half = [((e - w) / 2) * kx, ((n - s) / 2) * kz];
  const inside = (q: number[]) => Math.abs(q[0]) <= half[0] && Math.abs(q[1]) <= half[1];
  const flat = (ring: number[][]) => ring.flatMap(([x, z]) => [Math.round(x), Math.round(z)]);
  /** Joins open member ways end to end into closed rings. */
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
  const members = (el: Element, role: string) => stitch((el.members ?? []).filter((m) => m.role === role && m.geometry).map((m) => m.geometry!));
  const rings = (el: Element) => (el.type === "way" ? (el.geometry ? [el.geometry] : []) : members(el, "outer"));
  const closedRing = (g: LatLon[]) => {
    const pts = g.map(local);
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]) < 0.5) pts.pop();
    return pts;
  };

  const buildings: number[][] = [];
  const water: number[][] = [];
  const green: number[][] = [];
  const sand: number[][] = [];
  const roads: number[][] = [];
  const coast: number[][][] = [];
  const islands: number[][] = [];
  for (const el of raw.elements) {
    const t = el.tags ?? {};
    if (t.building) {
      if (Number(t.layer) < 0 || t.location === "underground" || t.building === "roof") continue;
      for (const g of rings(el)) {
        let ring = simplify(closedRing(g), 0.8);
        if (ring.length < 3 || !ring.some(inside)) continue;
        const a = Math.abs(area(ring));
        if (a < 40) continue;
        if (area(ring) < 0) ring = ring.reverse(); // counter-clockwise in x/z
        const r = hash(String(g[0].lat) + String(g[0].lon));
        const tagged = metres(t.height) || (Number(t["building:levels"]) ? Number(t["building:levels"]) * 3.4 + 3 : NaN);
        const h = Math.round(Math.min(450, Number.isFinite(tagged) && tagged > 2 ? tagged : spec.fallback(a, t, r)));
        buildings.push([h, spec.style(h, a, t, r), ...flat(ring)]);
      }
      continue;
    }
    if (t.highway && el.geometry) {
      const width = ROADS[t.highway];
      const line = el.geometry.map(local);
      if (width && line.some(inside)) roads.push([width, ...flat(simplify(line, 1))]);
      continue;
    }
    if (t.natural === "coastline" && el.geometry) {
      coast.push(el.geometry.map(local));
      continue;
    }
    if ((t.natural === "water" || t.waterway === "riverbank") && el.type === "relation") {
      for (const g of members(el, "outer")) {
        const ring = simplify(closedRing(g), 1);
        if (ring.length >= 3 && ring.some(inside)) water.push(flat(ring));
      }
      for (const g of members(el, "inner")) {
        const ring = simplify(closedRing(g), 1);
        if (ring.length >= 3 && ring.some(inside)) islands.push(flat(ring));
      }
      continue;
    }
    const target = t.natural === "water" || t.waterway === "riverbank" ? water
      : t.natural === "beach" || t.natural === "sand" ? sand
      : t.leisure || t.landuse || t.natural ? green : null;
    if (!target) continue;
    for (const g of rings(el)) {
      const ring = simplify(closedRing(g), 1);
      if (ring.length >= 3 && ring.some(inside)) target.push(flat(ring));
    }
  }

  // The coastline is shipped as lines; the game floods the sea from a point known to be open water.
  const coastLines = coast.filter((c) => c.some(inside)).map((c) => flat(simplify(c, 1)));

  const out = {
    id: spec.id,
    name: spec.name,
    half: half.map(Math.round),
    attribution: "Map data © OpenStreetMap contributors (ODbL)",
    buildings,
    water,
    islands,
    coast: coastLines,
    seaSeed: spec.id === "dubai" ? [-Math.round(half[0]) + 40, -Math.round(half[1]) + 40] : null,
    green,
    sand,
    roads,
  };
  mkdirSync("public/assets/sky", { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(`public/assets/sky/${spec.id}.json`, json);
  const heights = buildings.map((b) => b[0]).sort((a, b) => b - a);
  console.log(`${spec.id}: ${buildings.length} buildings (tallest ${heights.slice(0, 3).join(", ")} m), ${water.length} water, ${islands.length} islands, ${coastLines.length} coast, ${green.length} green, ${roads.length} roads, ${(json.length / 1024).toFixed(0)} KB`);
}

const dir = process.argv[2];
if (!dir) throw new Error("Pass the folder holding <city>.json Overpass extracts");
for (const spec of SPECS) build(spec, dir);
