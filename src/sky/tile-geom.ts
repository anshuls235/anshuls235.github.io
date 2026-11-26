// Pure geometry builder for streamed 1 km city tiles (zero DOM / Three.js deps).
// Runs inside the Web Worker and returns transferable typed arrays per LOD.
import type { CityId, DecodedTile, TileBuilding } from "./tileformat";

export type TileLod = 0 | 1 | 2;

export interface WallBuffers {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  color: Float32Array; // RGB tint * base AO
}

export interface SimpleMeshBuffers {
  pos: Float32Array;
  nrm: Float32Array;
  color: Float32Array;
}

export interface FlatColorBuffers {
  pos: Float32Array;
  color: Float32Array;
}

export interface BuiltTileData {
  tx: number;
  tz: number;
  lod: TileLod;
  /** Up to 4 merged wall buffers, one per real photographic facade style (native RepeatWrapping). */
  wallsByStyle?: (WallBuffers | null)[];
  roofs?: SimpleMeshBuffers;
  midBuildings?: SimpleMeshBuffers;
  roads?: FlatColorBuffers;
  roadMarks?: Float32Array; // dashed lane markings + night glow strips
  rails?: FlatColorBuffers;
  ground?: FlatColorBuffers; // parks + sand
  water?: Float32Array; // inland rivers/lakes/canals
  /** Packed [x, z, scale, yaw, colorIdx] * N */
  trees?: Float32Array;
}

// Facade world-metre repeat scale matching the 4 photographic textures:
// 0: glass-tower, 1: residential-tower, 2: office-glass, 3: indian-midrise
const FACADE_SCALE: [number, number][] = [
  [16, 14], // glass-tower
  [14, 3.6], // residential-tower
  [14, 4.0], // office-glass
  [12, 3.4], // indian-midrise
];

// Subtle architectural colour tints (linear-ish RGB multipliers)
const WALL_TINTS: [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [0.94, 0.96, 1.0],
  [1.0, 0.96, 0.91],
  [0.91, 0.94, 0.97],
  [0.97, 0.93, 0.88],
  [0.88, 0.92, 0.96],
  [0.98, 0.95, 0.92],
  [0.92, 0.91, 0.89],
];

// Mid/Far LOD building base colours by facade style
const STYLE_BASE_COLOR: [number, number, number][] = [
  [0.52, 0.62, 0.72], // glass-tower
  [0.78, 0.74, 0.67], // residential
  [0.48, 0.58, 0.66], // office-glass
  [0.74, 0.67, 0.59], // indian-midrise
];

const ROOF_COLORS: [number, number, number][] = [
  [0.56, 0.55, 0.53],
  [0.48, 0.50, 0.53],
  [0.62, 0.58, 0.52],
  [0.44, 0.44, 0.46],
  [0.58, 0.54, 0.49],
  [0.51, 0.53, 0.55],
  [0.64, 0.60, 0.54],
  [0.46, 0.47, 0.48],
];

function seeded(seed: number) {
  let s = (Math.abs(seed) % 2147483646) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Fast 2D ear-clipping triangulator for simple polygons (flat [x0, z0, x1, z1, ...]). */
export function triangulateFlat(ring: Float32Array): number[] {
  const n = ring.length >> 1;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Ensure CCW winding in (x, z) so signed area > 0
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  const idx: number[] = new Array(n);
  if (signedArea >= 0) {
    for (let i = 0; i < n; i++) idx[i] = i;
  } else {
    for (let i = 0; i < n; i++) idx[i] = n - 1 - i;
  }

  const out: number[] = [];
  const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
    (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

  const pointInTri = (px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => {
    const c1 = cross(ax, az, bx, bz, px, pz);
    const c2 = cross(bx, bz, cx, cz, px, pz);
    const c3 = cross(cx, cz, ax, az, px, pz);
    return c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6;
  };

  let guard = n * n;
  let m = n;
  let i = 0;
  while (m > 3 && guard-- > 0) {
    const prev = idx[(i + m - 1) % m];
    const curr = idx[i % m];
    const next = idx[(i + 1) % m];
    const ax = ring[prev * 2], az = ring[prev * 2 + 1];
    const bx = ring[curr * 2], bz = ring[curr * 2 + 1];
    const cx = ring[next * 2], cz = ring[next * 2 + 1];

    if (cross(ax, az, bx, bz, cx, cz) > 1e-6) {
      let ear = true;
      for (let k = 0; k < m; k++) {
        const vi = idx[k];
        if (vi === prev || vi === curr || vi === next) continue;
        if (pointInTri(ring[vi * 2], ring[vi * 2 + 1], ax, az, bx, bz, cx, cz)) {
          ear = false;
          break;
        }
      }
      if (ear) {
        out.push(prev, curr, next);
        idx.splice(i % m, 1);
        m--;
        i = 0;
        continue;
      }
    }
    i = (i + 1) % m;
  }
  if (m === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

function pushRibbon(
  pts: Float32Array,
  halfW: number,
  y: number,
  r: number,
  g: number,
  b: number,
  pos: number[],
  col: number[],
) {
  const count = pts.length >> 1;
  if (count < 2) return;
  for (let i = 0; i < count - 1; i++) {
    const x0 = pts[i * 2], z0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2], z1 = pts[(i + 1) * 2 + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const nx = (-dz / len) * halfW;
    const nz = (dx / len) * halfW;
    // Slight endcap extension to hide miter gaps at road bends
    const ex = (dx / len) * Math.min(halfW * 0.35, 1.8);
    const ez = (dz / len) * Math.min(halfW * 0.35, 1.8);
    const ax = x0 - ex + nx, az = z0 - ez + nz;
    const bx = x0 - ex - nx, bz = z0 - ez - nz;
    const cx = x1 + ex + nx, cz = z1 + ez + nz;
    const dx2 = x1 + ex - nx, dz2 = z1 + ez - nz;
    // Two triangles facing +Y
    pos.push(ax, y, az, cx, y, cz, bx, y, bz, bx, y, bz, cx, y, cz, dx2, y, dz2);
    for (let k = 0; k < 6; k++) col.push(r, g, b);
  }
}

function pushRoadDashes(pts: Float32Array, y: number, marks: number[]) {
  const count = pts.length >> 1;
  if (count < 2) return;
  const hw = 0.35;
  const dashLen = 6;
  const gapLen = 9;
  let accum = 0;
  for (let i = 0; i < count - 1; i++) {
    const x0 = pts[i * 2], z0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2], z1 = pts[(i + 1) * 2 + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const ux = dx / len, uz = dz / len;
    const nx = -uz * hw, nz = ux * hw;
    let s = 0;
    while (s < len) {
      const cycle = (accum + s) % (dashLen + gapLen);
      if (cycle < dashLen) {
        const end = Math.min(len, s + (dashLen - cycle));
        if (end - s > 1.2) {
          const sx = x0 + ux * s, sz = z0 + uz * s;
          const ex = x0 + ux * end, ez = z0 + uz * end;
          marks.push(
            sx + nx, y, sz + nz, ex + nx, y, ez + nz, sx - nx, y, sz - nz,
            sx - nx, y, sz - nz, ex + nx, y, ez + nz, ex - nx, y, ez - nz,
          );
        }
        s = end + gapLen;
      } else {
        s += dashLen + gapLen - cycle;
      }
    }
    accum += len;
  }
}

function pointInRingF32(x: number, z: number, ring: Float32Array): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1];
    const xj = ring[j], zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function pushBoxBuilding(
  b: TileBuilding,
  pos: number[],
  nrm: number[],
  col: number[],
) {
  const [x0, z0, x1, z1] = b.bbox;
  const h = b.height;
  const base = STYLE_BASE_COLOR[b.style] ?? STYLE_BASE_COLOR[1];
  const tint = WALL_TINTS[b.tint & 7];
  const br = base[0] * tint[0];
  const bg = base[1] * tint[1];
  const bb = base[2] * tint[2];
  const ao = 0.48;
  // 4 walls
  const faces: [number, number, number, number, number, number][] = [
    [x0, z0, x1, z0, 0, -1],
    [x1, z0, x1, z1, 1, 0],
    [x1, z1, x0, z1, 0, 1],
    [x0, z1, x0, z0, -1, 0],
  ];
  for (const [ax, az, bx, bz, nx, nz] of faces) {
    pos.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, 0, az, bx, h, bz, ax, h, az);
    for (let k = 0; k < 6; k++) nrm.push(nx, 0, nz);
    col.push(
      br * ao, bg * ao, bb * ao,
      br * ao, bg * ao, bb * ao,
      br, bg, bb,
      br * ao, bg * ao, bb * ao,
      br, bg, bb,
      br, bg, bb,
    );
  }
  // Roof
  const rc = ROOF_COLORS[b.tint & 7];
  pos.push(x0, h, z0, x0, h, z1, x1, h, z1, x0, h, z0, x1, h, z1, x1, h, z0);
  for (let k = 0; k < 6; k++) {
    nrm.push(0, 1, 0);
    col.push(rc[0], rc[1], rc[2]);
  }
}

export function buildTileGeometry(tile: DecodedTile, cityId: CityId, lod: TileLod): BuiltTileData {
  const out: BuiltTileData = { tx: tile.tx, tz: tile.tz, lod };

  // ---------- LOD 2 (Far): merged silhouettes of taller buildings (>= 16 m) ----------
  if (lod === 2) {
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    for (const b of tile.buildings) {
      if (b.height < 16) continue;
      pushBoxBuilding(b, pos, nrm, col);
    }
    if (pos.length) {
      out.midBuildings = {
        pos: new Float32Array(pos),
        nrm: new Float32Array(nrm),
        color: new Float32Array(col),
      };
    }
    return out;
  }

  // ---------- Ground (parks + sand) & Water (shared for LOD 0 and LOD 1) ----------
  const gPos: number[] = [];
  const gCol: number[] = [];
  const parkPalette: [number, number, number][] =
    cityId === "dubai"
      ? [[0.34, 0.49, 0.25], [0.39, 0.53, 0.28]]
      : cityId === "bengaluru"
        ? [[0.23, 0.42, 0.18], [0.28, 0.47, 0.21], [0.20, 0.37, 0.16]]
        : [[0.29, 0.45, 0.20], [0.34, 0.49, 0.23]];

  tile.green.forEach((ring, idx) => {
    const tris = triangulateFlat(ring);
    const c = parkPalette[idx % parkPalette.length];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], d = tris[i + 2];
      // CCW in (x, z) -> reverse to face +Y in Three.js
      gPos.push(ring[a * 2], 0.9, ring[a * 2 + 1], ring[d * 2], 0.9, ring[d * 2 + 1], ring[b * 2], 0.9, ring[b * 2 + 1]);
      gCol.push(c[0], c[1], c[2], c[0], c[1], c[2], c[0], c[1], c[2]);
    }
  });
  for (const ring of tile.sand) {
    const tris = triangulateFlat(ring);
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], d = tris[i + 2];
      gPos.push(ring[a * 2], 0.65, ring[a * 2 + 1], ring[d * 2], 0.65, ring[d * 2 + 1], ring[b * 2], 0.65, ring[b * 2 + 1]);
      gCol.push(0.84, 0.77, 0.61, 0.84, 0.77, 0.61, 0.84, 0.77, 0.61);
    }
  }
  if (gPos.length) out.ground = { pos: new Float32Array(gPos), color: new Float32Array(gCol) };

  const wPos: number[] = [];
  for (const ring of tile.water) {
    const tris = triangulateFlat(ring);
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], d = tris[i + 2];
      wPos.push(ring[a * 2], 1.15, ring[a * 2 + 1], ring[d * 2], 1.15, ring[d * 2 + 1], ring[b * 2], 1.15, ring[b * 2 + 1]);
    }
  }
  if (wPos.length) out.water = new Float32Array(wPos);

  // ---------- Roads & Rail ----------
  const rPos: number[] = [];
  const rCol: number[] = [];
  const rMarks: number[] = [];
  for (const road of tile.roads) {
    if (lod === 1 && road.kind === 0) continue; // mid LOD skips minor residential streets
    const y = road.kind === 2 ? 1.85 : road.kind === 1 ? 1.65 : 1.45;
    const shade = road.kind === 2 ? 0.20 : road.kind === 1 ? 0.24 : 0.29;
    pushRibbon(road.points, road.width * 0.5, y, shade, shade, shade + 0.02, rPos, rCol);
    if (lod === 0 && road.kind === 2) {
      pushRoadDashes(road.points, 2.08, rMarks);
    }
  }
  if (rPos.length) out.roads = { pos: new Float32Array(rPos), color: new Float32Array(rCol) };
  if (rMarks.length) out.roadMarks = new Float32Array(rMarks);

  if (lod === 0 && tile.rails.length) {
    const railPos: number[] = [];
    const railCol: number[] = [];
    for (const rail of tile.rails) {
      const y = rail.kind === 1 ? 8.0 : 2.28;
      const c = rail.kind === 1 ? 0.62 : 0.34;
      pushRibbon(rail.points, rail.width * 0.5, y, c, c, c + 0.02, railPos, railCol);
    }
    if (railPos.length) out.rails = { pos: new Float32Array(railPos), color: new Float32Array(railCol) };
  }

  // ---------- LOD 1 (Mid): flat-coloured boxes with base AO ----------
  if (lod === 1) {
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    for (const b of tile.buildings) {
      pushBoxBuilding(b, pos, nrm, col);
    }
    if (pos.length) {
      out.midBuildings = {
        pos: new Float32Array(pos),
        nrm: new Float32Array(nrm),
        color: new Float32Array(col),
      };
    }
    return out;
  }

  // ---------- LOD 0 (Near): full extruded footprints grouped by the 4 real photographic facades ----------
  const buckets = Array.from({ length: 4 }, () => ({
    pos: [] as number[],
    nrm: [] as number[],
    uv: [] as number[],
    col: [] as number[],
  }));

  const roofPos: number[] = [];
  const roofNrm: number[] = [];
  const roofCol: number[] = [];

  for (const b of tile.buildings) {
    const h = b.height;
    const style = b.style & 3;
    const [fw, fh] = FACADE_SCALE[style];
    const w = buckets[style];
    const tint = WALL_TINTS[b.tint & 7];
    const aoBottom = 0.48;
    const aoH = Math.min(h, 14);
    const aoTop = aoH < h ? 1.0 : aoBottom + (1 - aoBottom) * (h / 14);

    const ring = b.ring;
    const n = ring.length >> 1;
    let along = 0;

    for (let i = 0; i < n; i++) {
      const x0 = ring[i * 2], z0 = ring[i * 2 + 1];
      const ni = (i + 1) % n;
      const x1 = ring[ni * 2], z1 = ring[ni * 2 + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nx = (z1 - z0) / len;
      const nz = -(x1 - x0) / len;
      const u0 = along / fw;
      const u1 = (along + len) / fw;
      const v1 = h / fh;

      if (h > 18) {
        const vm = aoH / fh;
        // Lower AO band: 0 .. aoH
        w.pos.push(x0, 0, z0, x1, 0, z1, x1, aoH, z1, x0, 0, z0, x1, aoH, z1, x0, aoH, z0);
        w.uv.push(u0, 0, u1, 0, u1, vm, u0, 0, u1, vm, u0, vm);
        for (let k = 0; k < 6; k++) w.nrm.push(nx, 0, nz);
        w.col.push(
          tint[0] * aoBottom, tint[1] * aoBottom, tint[2] * aoBottom,
          tint[0] * aoBottom, tint[1] * aoBottom, tint[2] * aoBottom,
          tint[0], tint[1], tint[2],
          tint[0] * aoBottom, tint[1] * aoBottom, tint[2] * aoBottom,
          tint[0], tint[1], tint[2],
          tint[0], tint[1], tint[2],
        );
        // Upper band: aoH .. h
        w.pos.push(x0, aoH, z0, x1, aoH, z1, x1, h, z1, x0, aoH, z0, x1, h, z1, x0, h, z0);
        w.uv.push(u0, vm, u1, vm, u1, v1, u0, vm, u1, v1, u0, v1);
        for (let k = 0; k < 6; k++) {
          w.nrm.push(nx, 0, nz);
          w.col.push(tint[0], tint[1], tint[2]);
        }
      } else {
        w.pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0);
        w.uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1);
        for (let k = 0; k < 6; k++) w.nrm.push(nx, 0, nz);
        w.col.push(
          tint[0] * aoBottom, tint[1] * aoBottom, tint[2] * aoBottom,
          tint[0] * aoBottom, tint[1] * aoBottom, tint[2] * aoBottom,
          tint[0] * aoTop, tint[1] * aoTop, tint[2] * aoTop,
          tint[0] * aoBottom, tint[1] * aoBottom, tint[2] * aoBottom,
          tint[0] * aoTop, tint[1] * aoTop, tint[2] * aoTop,
          tint[0] * aoTop, tint[1] * aoTop, tint[2] * aoTop,
        );
      }
      along += len;
    }

    // Roof triangulation
    const tris = triangulateFlat(ring);
    const rc = ROOF_COLORS[b.tint & 7];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], c = tris[i + 1], d = tris[i + 2];
      roofPos.push(ring[a * 2], h, ring[a * 2 + 1], ring[d * 2], h, ring[d * 2 + 1], ring[c * 2], h, ring[c * 2 + 1]);
      for (let k = 0; k < 3; k++) {
        roofNrm.push(0, 1, 0);
        roofCol.push(rc[0], rc[1], rc[2]);
      }
    }

    // Mechanical penthouse / crown cap on taller towers so roofs aren't sterile slabs
    if (b.roofType === 1 && h > 50) {
      const [bx0, bz0, bx1, bz1] = b.bbox;
      const bw = bx1 - bx0, bd = bz1 - bz0;
      if (bw > 16 && bd > 16) {
        const cx = (bx0 + bx1) * 0.5, cz = (bz0 + bz1) * 0.5;
        const pw = Math.min(bw * 0.28, 12), pd = Math.min(bd * 0.28, 12);
        const ph = Math.min(7, h * 0.05);
        const px0 = cx - pw, px1 = cx + pw, pz0 = cz - pd, pz1 = cz + pd;
        const pr = rc[0] * 0.82, pg = rc[1] * 0.82, pb = rc[2] * 0.82;
        const pFaces: [number, number, number, number, number, number][] = [
          [px0, pz0, px1, pz0, 0, -1],
          [px1, pz0, px1, pz1, 1, 0],
          [px1, pz1, px0, pz1, 0, 1],
          [px0, pz1, px0, pz0, -1, 0],
        ];
        for (const [fx0, fz0, fx1, fz1, fnx, fnz] of pFaces) {
          roofPos.push(fx0, h, fz0, fx1, h, fz1, fx1, h + ph, fz1, fx0, h, fz0, fx1, h + ph, fz1, fx0, h + ph, fz0);
          for (let k = 0; k < 6; k++) {
            roofNrm.push(fnx, 0, fnz);
            roofCol.push(pr, pg, pb);
          }
        }
        roofPos.push(px0, h + ph, pz0, px0, h + ph, pz1, px1, h + ph, pz1, px0, h + ph, pz0, px1, h + ph, pz1, px1, h + ph, pz0);
        for (let k = 0; k < 6; k++) {
          roofNrm.push(0, 1, 0);
          roofCol.push(rc[0] * 0.9, rc[1] * 0.9, rc[2] * 0.9);
        }
      }
    }
  }

  const wallsByStyle = buckets.map((w) =>
    w.pos.length
      ? {
          pos: new Float32Array(w.pos),
          nrm: new Float32Array(w.nrm),
          uv: new Float32Array(w.uv),
          color: new Float32Array(w.col),
        }
      : null,
  );
  if (wallsByStyle.some(Boolean)) out.wallsByStyle = wallsByStyle;
  if (roofPos.length) {
    out.roofs = {
      pos: new Float32Array(roofPos),
      nrm: new Float32Array(roofNrm),
      color: new Float32Array(roofCol),
    };
  }

  // ---------- Trees (parks + boulevards, capped per tile so instance count stays sleek) ----------
  const rand = seeded(tile.tx * 73856093 ^ tile.tz * 19349663 ^ cityId.length * 83492791);
  const maxTrees = cityId === "bengaluru" ? 320 : cityId === "delhi" ? 220 : 140;
  const treeSpots: number[] = [];

  const clearOfBuildings = (x: number, z: number) => {
    for (const b of tile.buildings) {
      const [x0, z0, x1, z1] = b.bbox;
      if (x >= x0 - 2 && x <= x1 + 2 && z >= z0 - 2 && z <= z1 + 2) return false;
    }
    return true;
  };

  // Park trees first (lush green clusters)
  for (const ring of tile.green) {
    if (treeSpots.length / 5 >= maxTrees * 0.65) break;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < x0) x0 = ring[i]; if (ring[i] > x1) x1 = ring[i];
      if (ring[i + 1] < z0) z0 = ring[i + 1]; if (ring[i + 1] > z1) z1 = ring[i + 1];
    }
    const count = Math.min(80, Math.floor(((x1 - x0) * (z1 - z0)) / (cityId === "dubai" ? 1400 : 480)));
    for (let k = 0; k < count && treeSpots.length / 5 < maxTrees * 0.65; k++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (pointInRingF32(x, z, ring) && clearOfBuildings(x, z)) {
        treeSpots.push(x, z, 0.8 + rand() * 0.75, rand() * 6.283, Math.floor(rand() * 5));
      }
    }
  }

  // Boulevard trees along medium & major roads
  const spacing = cityId === "bengaluru" ? 22 : cityId === "delhi" ? 28 : 34;
  for (const road of tile.roads) {
    if (treeSpots.length / 5 >= maxTrees) break;
    if (road.kind === 0) continue;
    const pts = road.points;
    for (let i = 0; i + 3 < pts.length && treeSpots.length / 5 < maxTrees; i += 2) {
      const dx = pts[i + 2] - pts[i], dz = pts[i + 3] - pts[i + 1];
      const len = Math.hypot(dx, dz);
      if (len < spacing) continue;
      for (let s = rand() * spacing; s < len && treeSpots.length / 5 < maxTrees; s += spacing) {
        const side = rand() < 0.5 ? -1 : 1;
        const off = road.width * 0.5 + 4;
        const x = pts[i] + (dx * s) / len + (-dz / len) * off * side;
        const z = pts[i + 1] + (dz * s) / len + (dx / len) * off * side;
        if (clearOfBuildings(x, z)) {
          treeSpots.push(x, z, 0.75 + rand() * 0.55, rand() * 6.283, Math.floor(rand() * 5));
        }
      }
    }
  }
  if (treeSpots.length) out.trees = new Float32Array(treeSpots);

  return out;
}
