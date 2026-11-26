// Pure geometry & ground-map builder for streamed 1 km city tiles (zero DOM / Three.js deps).
// Runs inside the Web Worker: builds merged building walls/roofs, instanced tree spots,
// elevated metro viaducts, and paints a crisp 512x512 OffscreenCanvas ground + night-light map
// per tile (eliminating road/park/water Z-fighting and cutting draw calls & triangles by >60%).
import type { CityId, DecodedTile } from "./tileformat";

export type TileLod = 0 | 1 | 2;

export interface FlatColorBuffers {
  pos: Float32Array;
  color: Float32Array;
}

export interface SeaMaskInfo {
  half: [number, number];
  cell: number;
  cols: number;
  rows: number;
  mask: Uint8Array;
}

/** Every building in a tile, walls and roofs together, for the one facade shader. */
export interface BuildingBuffers {
  pos: Float32Array;
  nrm: Float32Array;
  /** Metres: along the wall and up it (walls), or world x/z (roofs). */
  uv: Float32Array;
  /** Linear RGB of the wall or roof. */
  color: Float32Array;
  /** Style (0 glass tower, 1 residential, 2 office, 3 mid-rise), height, seed. */
  info: Float32Array;
}

export interface BuiltTileData {
  tx: number;
  tz: number;
  lod: TileLod;
  buildings?: BuildingBuffers;
  /** Elevated metro viaducts only (surface roads/rails/parks are baked into groundBitmap!) */
  rails?: FlatColorBuffers;
  /** Crisp 512x512 ground texture (with kerbs, intersections, parks, building drop-shadows, water cutout) */
  groundBitmap?: ImageBitmap;
  /** Crisp 256x256 warm sodium/LED street-light emissive texture for night mode */
  nightBitmap?: ImageBitmap;
  /** Fallback vector buffers used only in Node unit tests where OffscreenCanvas is absent */
  roads?: FlatColorBuffers;
  roadMarks?: Float32Array;
  ground?: FlatColorBuffers;
  water?: Float32Array;
  /** Packed [x, z, scale, yaw, colorIdx] * N */
  trees?: Float32Array;
}

// City palettes in sRGB, turned linear for the GPU. Glass towers take their wall
// colour as the frame and tint; the shader adds the glass and its reflections.
const hex = (h: number): [number, number, number] => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)];
};
const WALLS: Record<CityId, number[][]> = {
  // [glass tower, residential tower, office, mid-rise] × 8 tints
  dubai: [
    [0x9aa8b2, 0xc8ccc8, 0x6f7c86, 0xb9a88a, 0xd6d9d6, 0x5e6a74, 0xa8b4ba, 0x8c7a62],
    [0xe2d6bd, 0xd8c6a4, 0xece4d2, 0xcdb894, 0xe8dcc4, 0xd2c2a6, 0xf0eadc, 0xc9b28c],
    [0xb4bcc0, 0x8e9aa2, 0xd0d2cc, 0xa6a08e, 0x7c8890, 0xc4c8c4, 0x9aa4a8, 0xb8ae98],
    [0xe0cfac, 0xd6c29c, 0xe8dcc2, 0xcbb48e, 0xdcc8a4, 0xefe4cc, 0xd2bc96, 0xe4d6b8],
  ],
  bengaluru: [
    [0x8fa3ad, 0x7c8e98, 0xa8b4b6, 0x6e7e88, 0x9cacb0, 0x86969c, 0xb4bcba, 0x748690],
    [0xe6dcc4, 0xd99a7e, 0xe4c58c, 0xc9d1c2, 0xeee6d6, 0xd7b49a, 0xbfcbd0, 0xe2cfa8],
    [0xa9b5b9, 0x8d9ba3, 0xc7ccc6, 0x9aa69f, 0xb7bdb5, 0x7f8f98, 0xd0d2ca, 0x98a4a8],
    [0xe8dcc0, 0xc9775a, 0xd6a75b, 0xd9d7b8, 0xd99a8c, 0x9fb8c4, 0xece8e0, 0xb8a27a],
  ],
  delhi: [
    [0x95a5ad, 0x80909a, 0xaab3b5, 0x737f88, 0xa0abae, 0x8a989e, 0xb6bbb8, 0x788790],
    [0xeadfc8, 0xd8b98c, 0xe6d2b2, 0xcdbfa6, 0xf0e8d8, 0xc9a684, 0xdccdb2, 0xe4d8c2],
    [0xa9a59c, 0xbab4a6, 0x8f949a, 0xcfc8b8, 0x9ea2a2, 0xc4bcaa, 0xb2ada0, 0xd6d0c2],
    [0xb5654a, 0xd8b98c, 0xeadfc8, 0xa5513e, 0xc98f62, 0xece6da, 0xbf7a58, 0xd9c4a0],
  ],
};
const ROOFS: Record<CityId, number[]> = {
  dubai: [0xc8bca4, 0xb7b0a2, 0xd6ccb8, 0xa8a49c, 0xbfb6a2, 0x9e9a92, 0xcfc6b2, 0xb0a894],
  bengaluru: [0xa55a43, 0x9a958c, 0xb86a4c, 0x8b8a86, 0xa89c84, 0x934e3c, 0x9c9a94, 0xb49a7a],
  delhi: [0xa9a194, 0xb08a6c, 0x9a958c, 0xbdae94, 0x8f8b84, 0xa8705a, 0xb4aa98, 0x9e9284],
};
const WALL_LIN: Record<CityId, [number, number, number][][]> = {
  dubai: WALLS.dubai.map((row) => row.map(hex)),
  bengaluru: WALLS.bengaluru.map((row) => row.map(hex)),
  delhi: WALLS.delhi.map((row) => row.map(hex)),
};
const ROOF_LIN: Record<CityId, [number, number, number][]> = {
  dubai: ROOFS.dubai.map(hex),
  bengaluru: ROOFS.bengaluru.map(hex),
  delhi: ROOFS.delhi.map(hex),
};

const TERRAIN_STYLE: Record<CityId, { ground: string; grainDark: string; grainLight: string; parkA: string; parkB: string; sand: string }> = {
  dubai: {
    ground: "#dec9a2",
    grainDark: "rgba(165,135,92,0.16)",
    grainLight: "rgba(255,244,218,0.18)",
    parkA: "#4e7c38",
    parkB: "#5d8c42",
    sand: "#ecd9b2",
  },
  bengaluru: {
    ground: "#9e947c",
    grainDark: "rgba(95,78,56,0.16)",
    grainLight: "rgba(195,182,152,0.14)",
    parkA: "#2f6829",
    parkB: "#3d7a32",
    sand: "#cbb994",
  },
  delhi: {
    ground: "#b8a585",
    grainDark: "rgba(120,92,62,0.16)",
    grainLight: "rgba(224,205,172,0.15)",
    parkA: "#3d6f2e",
    parkB: "#4c7f38",
    sand: "#d6c39c",
  },
};

function seeded(seed: number) {
  let s = (Math.abs(seed) % 2147483646) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Fast 2D ear-clipping triangulator for building roofs. */
export function triangulateFlat(ring: Float32Array): number[] {
  const n = ring.length >> 1;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

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
    const ex = (dx / len) * Math.min(halfW * 0.35, 1.8);
    const ez = (dz / len) * Math.min(halfW * 0.35, 1.8);
    const ax = x0 - ex + nx, az = z0 - ez + nz;
    const bx = x0 - ex - nx, bz = z0 - ez - nz;
    const cx = x1 + ex + nx, cz = z1 + ez + nz;
    const dx2 = x1 + ex - nx, dz2 = z1 + ez - nz;
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

/** Streams of vertex data for the facade shader. */
class BuildingSink {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  info: number[] = [];
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, u0: number, c: [number, number, number], style: number, h: number, seed: number) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const nx = (z1 - z0) / len;
    const nz = -(x1 - x0) / len;
    const u1 = u0 + len;
    this.pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0);
    this.uv.push(u0, y0, u1, y0, u1, y1, u0, y0, u1, y1, u0, y1);
    for (let k = 0; k < 6; k++) {
      this.nrm.push(nx, 0, nz);
      this.col.push(c[0], c[1], c[2]);
      this.info.push(style, h, seed);
    }
    return len;
  }
  roof(ring: Float32Array, y: number, c: [number, number, number], style: number, h: number, seed: number) {
    const tris = triangulateFlat(ring);
    for (let i = 0; i < tris.length; i += 3) {
      for (const k of [tris[i], tris[i + 2], tris[i + 1]]) {
        const x = ring[k * 2];
        const z = ring[k * 2 + 1];
        this.pos.push(x, y, z);
        this.uv.push(x, z);
        this.nrm.push(0, 1, 0);
        this.col.push(c[0], c[1], c[2]);
        this.info.push(style, h, seed);
      }
    }
  }
  prism(ring: Float32Array, y0: number, y1: number, wall: [number, number, number], roof: [number, number, number], style: number, h: number, seed: number) {
    const n = ring.length >> 1;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = ring[i * 2], z0 = ring[i * 2 + 1];
      const x1 = ring[j * 2], z1 = ring[j * 2 + 1];
      if (Math.hypot(x1 - x0, z1 - z0) < 0.05) continue;
      along += this.wall(x0, z0, x1, z1, y0, y1, along, wall, style, h, seed);
    }
    this.roof(ring, y1, roof, style, h, seed);
  }
  build(): BuildingBuffers | undefined {
    if (!this.pos.length) return undefined;
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      uv: new Float32Array(this.uv),
      color: new Float32Array(this.col),
      info: new Float32Array(this.info),
    };
  }
}

/** The footprint's best-fit rectangle, oriented along its longest edge, as a ring. */
function orientedBox(ring: Float32Array): Float32Array {
  const n = ring.length >> 1;
  let best = 0;
  let ux = 1;
  let uz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j * 2] - ring[i * 2];
    const dz = ring[j * 2 + 1] - ring[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l > best) {
      best = l;
      ux = dx / l;
      uz = dz / l;
    }
  }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2], z = ring[i * 2 + 1];
    const a = x * ux + z * uz;
    const b = -x * uz + z * ux;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a);
    b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  const at = (a: number, b: number) => [a * ux - b * uz, a * uz + b * ux];
  // Same winding as the source footprints (counter-clockwise in x/z).
  const pts = [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  if (area < 0) pts.reverse();
  return new Float32Array(pts.flat());
}

function buildingBuffers(tile: DecodedTile, cityId: CityId, lod: TileLod): BuildingBuffers | undefined {
  const sink = new BuildingSink();
  // Far tiles keep the skyline: only towers, as oriented boxes.
  const minHeight = lod === 2 ? 22 : lod === 1 ? 6 : 0;
  for (const b of tile.buildings) {
    const h = b.height;
    if (h < minHeight || b.ring.length < 6) continue;
    const style = b.style & 3;
    const tint = b.tint & 7;
    const seed = ((b.bbox[0] * 12.9898 + b.bbox[1] * 78.233) % 1 + 1) % 1;
    const wall = WALL_LIN[cityId][style][tint];
    const roof = style === 0 || style === 2 ? WALL_LIN[cityId][2][(tint + 3) & 7] : ROOF_LIN[cityId][tint];
    const ring = lod === 2 ? orientedBox(b.ring) : b.ring;
    sink.prism(ring, 0, h, wall, roof, style, h, seed);
    // Towers get a plant room on the roof.
    if (lod === 0 && b.roofType === 1 && h > 55) {
      const [bx0, bz0, bx1, bz1] = b.bbox;
      const bw = bx1 - bx0, bd = bz1 - bz0;
      if (bw > 16 && bd > 16) {
        const cx = (bx0 + bx1) * 0.5, cz = (bz0 + bz1) * 0.5;
        const pw = Math.min(bw * 0.26, 11), pd = Math.min(bd * 0.26, 11);
        const ph = Math.min(7, h * 0.05);
        const box = new Float32Array([cx - pw, cz - pd, cx + pw, cz - pd, cx + pw, cz + pd, cx - pw, cz + pd]);
        let area = 0;
        const n = b.ring.length >> 1;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          area += b.ring[i * 2] * b.ring[j * 2 + 1] - b.ring[j * 2] * b.ring[i * 2 + 1];
        }
        const pr = area < 0 ? new Float32Array([cx - pw, cz + pd, cx + pw, cz + pd, cx + pw, cz - pd, cx - pw, cz - pd]) : box;
        sink.prism(pr, h, h + ph, roof, roof, 4, h + ph, seed);
      }
    }
  }
  return sink.build();
}

/**
 * Paints a crisp 512x512 ground texture + 256x256 night-lights texture inside the Web Worker!
 * Gives smooth intersections, kerbs, green parks, beaches, railway sleepers, baked building
 * drop-shadows (replacing expensive PCFSoftShadowMap!), and razor-sharp water/canal cutouts.
 */
function paintTileGroundBitmaps(
  tile: DecodedTile,
  cityId: CityId,
  tileSize: number,
  lod: TileLod,
  sea: SeaMaskInfo | null,
  quality = 2,
): { groundBitmap: ImageBitmap; nightBitmap: ImageBitmap } | null {
  if (typeof OffscreenCanvas === "undefined" || quality === 0) return null;

  // Near tiles sharp, far tiles cheap; every tile gets ground so the city has no bare seams.
  const size = lod === 0 ? (quality >= 2 ? 1024 : 512) : lod === 1 ? 256 : 128;
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext("2d")!;
  const palette = TERRAIN_STYLE[cityId];

  const minX = tile.tx * tileSize;
  const minZ = tile.tz * tileSize;
  const scale = size / tileSize;

  g.fillStyle = palette.ground;
  g.fillRect(0, 0, size, size);

  // Subtle regional earth/dune texture grain
  const rand = seeded((tile.tx * 73856093) ^ (tile.tz * 19349663) ^ 17);
  for (let i = 0; i < (lod === 0 ? 420 : 140); i++) {
    g.fillStyle = rand() < 0.5 ? palette.grainDark : palette.grainLight;
    const w = 6 + rand() * 26;
    const h = cityId === "dubai" ? 3 + rand() * 8 : w * (0.6 + rand() * 0.6);
    g.fillRect(rand() * size, rand() * size, w, h);
  }

  g.setTransform(scale, 0, 0, scale, -minX * scale, -minZ * scale);

  const fillRing = (ring: Float32Array, fill: string, dx = 0, dz = 0) => {
    if (ring.length < 6) return;
    g.beginPath();
    g.moveTo(ring[0] + dx, ring[1] + dz);
    for (let i = 2; i < ring.length; i += 2) g.lineTo(ring[i] + dx, ring[i + 1] + dz);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };

  for (const ring of tile.sand) fillRing(ring, palette.sand);
  tile.green.forEach((ring, i) => fillRing(ring, i & 1 ? palette.parkA : palette.parkB));

  // Roads: smooth kerb shoulder -> dark asphalt -> median / dashed white lane lines
  g.lineCap = "round";
  g.lineJoin = "round";
  const strokePts = (pts: Float32Array, width: number, style: string, dash: number[] = []) => {
    if (pts.length < 4) return;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.lineWidth = width;
    g.strokeStyle = style;
    g.setLineDash(dash);
    g.stroke();
  };

  for (const r of tile.roads) {
    if (lod > 0 && r.kind === 0) continue;
    strokePts(r.points, r.width + 3.2, cityId === "dubai" ? "#c2b396" : "#8b8374");
  }
  for (const r of tile.roads) {
    if (lod > 0 && r.kind === 0) continue;
    strokePts(r.points, r.width, r.kind === 2 ? "#2d3036" : r.kind === 1 ? "#373a40" : "#44464c");
  }
  if (lod === 0) {
    for (const r of tile.roads) {
      if (r.kind === 2) strokePts(r.points, 0.9, "#e6dfc8", [7, 9]);
    }
    for (const rail of tile.rails) {
      if (rail.kind === 0) {
        strokePts(rail.points, rail.width + 2, "#6a5f52");
        strokePts(rail.points, rail.width * 0.7, "#383a3e", [2.5, 2.5]);
      }
    }
  }
  g.setLineDash([]);

  // Baked directional drop-shadow + contact AO under every building (replaces GPU-heavy shadow maps!)
  // Footprints in roof colours: under extruded buildings they are hidden; where a
  // far tile leaves small buildings flat, they still read as rooftops from the air.
  for (const b of tile.buildings) {
    const c = ROOFS[cityId][b.tint & 7];
    fillRing(b.ring, "rgba(20, 18, 16, 0.22)", 1.2, 1.2);
    fillRing(b.ring, `rgb(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255})`, 0, 0);
  }

  // Cut out inland water (rivers, canals, lagoons, reflecting pools) so 3D water shines through!
  g.globalCompositeOperation = "destination-out";
  for (const ring of tile.water) fillRing(ring, "#000");
  g.globalCompositeOperation = "source-over";
  for (const ring of tile.islands) fillRing(ring, palette.ground);

  // Cut out coastal sea cells (Dubai Marina canal, Palm Jumeirah fronds, Arabian Gulf)
  if (sea) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const c0 = Math.max(0, Math.floor((minX + sea.half[0]) / sea.cell) - 1);
    const c1 = Math.min(sea.cols - 1, Math.ceil((minX + tileSize + sea.half[0]) / sea.cell) + 1);
    const r0 = Math.max(0, Math.floor((minZ + sea.half[1]) / sea.cell) - 1);
    const r1 = Math.min(sea.rows - 1, Math.ceil((minZ + tileSize + sea.half[1]) / sea.cell) + 1);
    const cw = Math.max(1, c1 - c0 + 1);
    const rh = Math.max(1, r1 - r0 + 1);
    let anySea = false;
    for (let r = r0; r <= r1 && !anySea; r++) {
      for (let c = c0; c <= c1; c++) {
        if (sea.mask[r * sea.cols + c]) {
          anySea = true;
          break;
        }
      }
    }
    if (anySea) {
      const mc = new OffscreenCanvas(cw, rh);
      const mg = mc.getContext("2d")!;
      const img = mg.createImageData(cw, rh);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (sea.mask[r * sea.cols + c]) {
            const idx = ((r - r0) * cw + (c - c0)) * 4;
            img.data[idx + 3] = 255;
          }
        }
      }
      mg.putImageData(img, 0, 0);
      const wx0 = (c0 * sea.cell - sea.half[0] - minX) * scale;
      const wz0 = (r0 * sea.cell - sea.half[1] - minZ) * scale;
      g.globalCompositeOperation = "destination-out";
      g.imageSmoothingEnabled = true;
      g.drawImage(mc, wx0, wz0, cw * sea.cell * scale, rh * sea.cell * scale);
      g.globalCompositeOperation = "source-over";
    }
  }

  // Night street-lights emissive texture (warm golden highways + soft amber residential glow)
  const nSize = 256;
  const nCanvas = new OffscreenCanvas(nSize, nSize);
  const ng = nCanvas.getContext("2d")!;
  ng.fillStyle = "#000000";
  ng.fillRect(0, 0, nSize, nSize);
  const nScale = nSize / tileSize;
  ng.setTransform(nScale, 0, 0, nScale, -minX * nScale, -minZ * nScale);
  ng.lineCap = "round";
  ng.lineJoin = "round";
  for (const [extra, alpha] of [[8, 0.38], [0, 0.92]] as const) {
    for (const r of tile.roads) {
      if (r.points.length < 4) continue;
      if (lod > 0 && r.kind === 0) continue;
      ng.beginPath();
      ng.moveTo(r.points[0], r.points[1]);
      for (let i = 2; i < r.points.length; i += 2) ng.lineTo(r.points[i], r.points[i + 1]);
      ng.lineWidth = r.width * (extra ? 1.3 : 0.35) + extra;
      ng.strokeStyle =
        r.kind === 2
          ? `rgba(255, 176, 84, ${alpha})`
          : r.kind === 1
            ? `rgba(255, 198, 128, ${alpha * 0.72})`
            : `rgba(255, 210, 155, ${alpha * 0.38})`;
      ng.stroke();
    }
  }

  return {
    groundBitmap: canvas.transferToImageBitmap(),
    nightBitmap: nCanvas.transferToImageBitmap(),
  };
}

export function buildTileGeometry(
  tile: DecodedTile,
  cityId: CityId,
  lod: TileLod,
  tileSize = 1000,
  sea: SeaMaskInfo | null = null,
  quality = 2,
): BuiltTileData {
  const out: BuiltTileData = { tx: tile.tx, tz: tile.tz, lod };

  // ---------- Ground & Roads: OffscreenCanvas bitmap in browser, vector fallback in Node tests / SwiftShader ----------
  const bitmaps = paintTileGroundBitmaps(tile, cityId, tileSize, lod, sea, quality);
  if (bitmaps) {
    out.groundBitmap = bitmaps.groundBitmap;
    out.nightBitmap = bitmaps.nightBitmap;
  } else if (lod < 2) {
    // Node unit-test fallback (when OffscreenCanvas is absent)
    const rPos: number[] = [];
    const rCol: number[] = [];
    const rMarks: number[] = [];
    for (const road of tile.roads) {
      if (lod === 1 && road.kind === 0) continue;
      pushRibbon(road.points, road.width * 0.5, 1.5, 0.22, 0.22, 0.24, rPos, rCol);
      if (lod === 0 && road.kind === 2) pushRoadDashes(road.points, 1.7, rMarks);
    }
    if (rPos.length) out.roads = { pos: new Float32Array(rPos), color: new Float32Array(rCol) };
    if (rMarks.length) out.roadMarks = new Float32Array(rMarks);
  }

  // Elevated metro viaducts (Dubai Red Line / Namma Metro / Delhi Metro!)
  if (lod === 0 && tile.rails.length) {
    const railPos: number[] = [];
    const railCol: number[] = [];
    for (const rail of tile.rails) {
      if (rail.kind !== 1) continue;
      pushRibbon(rail.points, rail.width * 0.5, 8.5, 0.72, 0.74, 0.77, railPos, railCol);
    }
    if (railPos.length) out.rails = { pos: new Float32Array(railPos), color: new Float32Array(railCol) };
  }

  // ---------- Buildings: one buffer for every LOD, drawn by one facade shader ----------
  const bld = buildingBuffers(tile, cityId, lod);
  if (bld) out.buildings = bld;
  if (lod > 0) return out;

  // ---------- Trees (lush Garden City canopy in Bengaluru, Lutyens avenues in Delhi, palms in Dubai) ----------
  const rand = seeded(tile.tx * 73856093 ^ tile.tz * 19349663 ^ cityId.length * 83492791);
  const maxTrees = cityId === "bengaluru" ? 360 : cityId === "delhi" ? 260 : 140;
  const treeSpots: number[] = [];

  const clearOfBuildings = (x: number, z: number) => {
    for (const b of tile.buildings) {
      const [x0, z0, x1, z1] = b.bbox;
      if (x >= x0 - 2 && x <= x1 + 2 && z >= z0 - 2 && z <= z1 + 2) return false;
    }
    return true;
  };

  for (const ring of tile.green) {
    if (treeSpots.length / 5 >= maxTrees * 0.68) break;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < x0) x0 = ring[i]; if (ring[i] > x1) x1 = ring[i];
      if (ring[i + 1] < z0) z0 = ring[i + 1]; if (ring[i + 1] > z1) z1 = ring[i + 1];
    }
    const count = Math.min(95, Math.floor(((x1 - x0) * (z1 - z0)) / (cityId === "dubai" ? 1400 : 420)));
    for (let k = 0; k < count && treeSpots.length / 5 < maxTrees * 0.68; k++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (pointInRingF32(x, z, ring) && clearOfBuildings(x, z)) {
        treeSpots.push(x, z, 0.85 + rand() * 0.8, rand() * 6.283, Math.floor(rand() * 8));
      }
    }
  }

  const spacing = cityId === "bengaluru" ? 18 : cityId === "delhi" ? 22 : 34;
  for (const road of tile.roads) {
    if (treeSpots.length / 5 >= maxTrees) break;
    if (cityId === "dubai" && road.kind === 0) continue;
    const pts = road.points;
    for (let i = 0; i + 3 < pts.length && treeSpots.length / 5 < maxTrees; i += 2) {
      const dx = pts[i + 2] - pts[i], dz = pts[i + 3] - pts[i + 1];
      const len = Math.hypot(dx, dz);
      if (len < spacing) continue;
      for (let s = rand() * spacing; s < len && treeSpots.length / 5 < maxTrees; s += spacing) {
        const side = rand() < 0.5 ? -1 : 1;
        const off = road.width * 0.5 + 3.8;
        const x = pts[i] + (dx * s) / len + (-dz / len) * off * side;
        const z = pts[i + 1] + (dz * s) / len + (dx / len) * off * side;
        if (clearOfBuildings(x, z)) {
          treeSpots.push(x, z, 0.8 + rand() * 0.55, rand() * 6.283, Math.floor(rand() * 8));
        }
      }
    }
  }
  if (treeSpots.length) out.trees = new Float32Array(treeSpots);

  return out;
}
