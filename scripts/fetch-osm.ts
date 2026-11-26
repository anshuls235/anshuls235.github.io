// Fetches OpenStreetMap extracts from Overpass API into tmp/osm/<city>.json
// for scripts/build-cities.ts. Data © OpenStreetMap contributors, ODbL.
// Usage: node --import tsx scripts/fetch-osm.ts [dubai|bengaluru|delhi]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface CityBounds {
  id: "dubai" | "bengaluru" | "delhi";
  bounds: [number, number, number, number]; // [s, w, n, e]
  grid: number;
}

const CITIES: CityBounds[] = [
  { id: "dubai", bounds: [25.068, 55.128, 25.204, 55.284], grid: 4 },
  { id: "bengaluru", bounds: [12.926, 77.566, 13.016, 77.656], grid: 3 },
  { id: "delhi", bounds: [28.574, 77.176, 28.664, 77.274], grid: 3 },
];

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function queryOverpass(ql: string, label: string): Promise<{ elements: Record<string, unknown>[] }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "anshuls235-portfolio-city-builder/1.0",
        },
        body: `data=${encodeURIComponent(ql)}`,
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = 2000 * (attempt + 1);
        console.log(`  [${label}] ${res.status} from ${new URL(url).host}, retrying in ${wait / 1000}s…`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { elements: Record<string, unknown>[] };
    } catch (err) {
      lastErr = err;
      const wait = 2000 * (attempt + 1);
      console.log(`  [${label}] error (${err instanceof Error ? err.message : err}), retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function tileQuery(s: number, w: number, n: number, e: number): string {
  const b = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  return `[out:json][timeout:35];
(
  way["building"](${b});
  relation["building"](${b});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|residential|unclassified)$"](${b});
  way["railway"~"^(rail|subway|light_rail|monorail)$"](${b});
  way["natural"~"^(water|coastline|beach|sand|wood|scrub|grassland)$"](${b});
  relation["natural"="water"](${b});
  way["waterway"="riverbank"](${b});
  relation["waterway"="riverbank"](${b});
  way["leisure"~"^(park|garden|golf_course|pitch|nature_reserve|stadium)$"](${b});
  relation["leisure"~"^(park|garden|golf_course|nature_reserve)$"](${b});
  way["landuse"~"^(forest|grass|meadow|recreation_ground|park|greenfield|cemetery)$"](${b});
  relation["landuse"~"^(forest|grass|meadow|recreation_ground|park)$"](${b});
);
out tags geom;`;
}

async function fetchCity(spec: CityBounds, outDir: string) {
  const outPath = join(outDir, `${spec.id}.json`);
  if (existsSync(outPath) && !process.argv.includes("--force")) {
    console.log(`${spec.id}: already exists at ${outPath}`);
    return;
  }
  const cellDir = join(outDir, "cells");
  mkdirSync(cellDir, { recursive: true });

  const [s, w, n, e] = spec.bounds;
  const g = spec.grid;
  const dLat = (n - s) / g;
  const dLon = (e - w) / g;

  const jobs: { r: number; c: number; cs: number; cw: number; cn: number; ce: number }[] = [];
  for (let r = 0; r < g; r++) {
    for (let c = 0; c < g; c++) {
      jobs.push({
        r,
        c,
        cs: s + r * dLat,
        cn: s + (r + 1) * dLat,
        cw: w + c * dLon,
        ce: w + (c + 1) * dLon,
      });
    }
  }

  console.log(`Fetching ${spec.id} (${g}×${g} = ${jobs.length} cells)…`);
  const byKey = new Map<string, Record<string, unknown>>();

  // Process 2 cells at a time
  for (let i = 0; i < jobs.length; i += 2) {
    const batch = jobs.slice(i, i + 2);
    const results = await Promise.all(
      batch.map(async (j) => {
        const cellPath = join(cellDir, `${spec.id}_${j.r}_${j.c}.json`);
        const label = `${spec.id} [${j.r + 1}/${g},${j.c + 1}/${g}]`;
        if (existsSync(cellPath)) {
          const cached = JSON.parse(readFileSync(cellPath, "utf8")) as { elements: Record<string, unknown>[] };
          console.log(`  [${label}] cached (${cached.elements.length})`);
          return cached;
        }
        const data = await queryOverpass(tileQuery(j.cs, j.cw, j.cn, j.ce), label);
        writeFileSync(cellPath, JSON.stringify(data));
        console.log(`  [${label}] fetched +${data.elements.length}`);
        return data;
      }),
    );
    for (const data of results) {
      for (const el of data.elements) {
        const key = `${el.type}:${el.id}`;
        if (!byKey.has(key)) byKey.set(key, el);
      }
    }
    await sleep(600);
  }

  const payload = JSON.stringify({ elements: [...byKey.values()] });
  writeFileSync(outPath, payload);
  console.log(`${spec.id}: saved ${byKey.size} unique elements (${(payload.length / 1048576).toFixed(1)} MB)`);
}

const outDir = "tmp/osm";
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const list = wanted.length ? CITIES.filter((c) => wanted.includes(c.id)) : CITIES;
for (const spec of list) {
  await fetchCity(spec, outDir);
}
