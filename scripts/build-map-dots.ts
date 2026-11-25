// Precomputes the journey map's landmass as a dot matrix (Natural Earth 1:50m
// land, public domain). Land only: no political borders are drawn.
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";
import type { Topology } from "topojson-specification";

export const MAP_BOUNDS = { lon: [44, 84], lat: [6, 34] } as const;
const STEP = 0.45; // degrees between dots
const topo = JSON.parse(readFileSync("node_modules/world-atlas/land-50m.json", "utf8")) as Topology;
const land = feature(topo, topo.objects.land);
const dots: [number, number][] = [];
for (let lat = MAP_BOUNDS.lat[1]; lat >= MAP_BOUNDS.lat[0]; lat -= STEP)
  for (let lon = MAP_BOUNDS.lon[0]; lon <= MAP_BOUNDS.lon[1]; lon += STEP)
    if (geoContains(land, [lon, lat])) dots.push([Math.round(lon * 100) / 100, Math.round(lat * 100) / 100]);
writeFileSync("src/content/map-dots.json", JSON.stringify({ bounds: MAP_BOUNDS, step: STEP, dots: [] }) + "\n");
// The dots ship as a static image the journey map draws once, not as live SVG.
const W = 800;
const H = 560;
const d = dots
  .map(([lon, lat]) => `M${(((lon - MAP_BOUNDS.lon[0]) / (MAP_BOUNDS.lon[1] - MAP_BOUNDS.lon[0])) * W).toFixed(1)} ${(((MAP_BOUNDS.lat[1] - lat) / (MAP_BOUNDS.lat[1] - MAP_BOUNDS.lat[0])) * H).toFixed(1)}h0`)
  .join("");
writeFileSync("public/assets/journey-land.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#857d6b" stroke-opacity=".55" stroke-width="4.2" stroke-linecap="round"/></svg>\n`);
console.log(`${dots.length} land dots`);
