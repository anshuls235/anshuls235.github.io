// Pure geometry & ground-map builder for streamed 1 km city tiles (zero DOM / Three.js deps).
// Runs inside the Web Worker: builds merged building walls/roofs, instanced tree spots,
// elevated metro viaducts, and paints a crisp 512x512 OffscreenCanvas ground + night-light map
// per tile (eliminating road/park/water Z-fighting and cutting draw calls & triangles by >60%).
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

export interface SeaMaskInfo {
  half: [number, number];
  cell: number;
  cols: number;
  rows: number;
  mask: Uint8Array;
}

export interface BuiltTileData {
  tx: number;
  tz: number;
  lod: TileLod;
  wallsByStyle?: (WallBuffers | null)[];
  roofs?: SimpleMeshBuffers;
  midBuildings?: SimpleMeshBuffers;
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

const FACADE_SCALE: [number, number][] = [
  [16, 14], // glass-tower
  [14, 3.6], // residential-tower
  [14, 4.0], // office-glass
  [12, 3.4], // indian-midrise
];

// City-authentic wall & roof palettes so Dubai, Bengaluru, and Delhi feel immediately distinct!
const WALL_PALETTES: Record<CityId, [number, number, number][]> = {
  dubai: [
    [0.96, 0.99, 1.04], // cool silver-ice glass
    [1.02, 0.98, 0.92], // warm champagne limestone
    [0.88, 0.95, 1.03], // gulf sapphire curtain wall
    [1.0, 0.96, 0.90], // pearl sand
    [0.92, 0.96, 1.0], // platinum tower
    [1.03, 0.95, 0.86], // desert travertine
    [0.86, 0.93, 0.99], // aqua glass
    [0.98, 0.97, 0.95], // crisp white modern
  ],
  bengaluru: [
    [1.04, 0.96, 0.86], // warm Mysore cream stucco
    [1.05, 0.84, 0.72], // terracotta-coral residential
    [0.92, 0.97, 1.02], // MG Road / Koramangala IT glass
    [1.04, 0.91, 0.76], // sandstone ochre
    [0.96, 0.98, 0.92], // garden-city lime wash
    [1.02, 0.80, 0.68], // warm brick-red midrise
    [0.89, 0.95, 0.99], // tech-park curtain wall
    [1.0, 0.94, 0.84], // warm ivory
  ],
  delhi: [
    [1.05, 0.83, 0.68], // Bharatpur red-ochre sandstone
    [1.04, 0.97, 0.88], // Lutyens white-cream stucco
    [1.02, 0.89, 0.74], // Dholpur buff sandstone
    [0.92, 0.96, 1.01], // Connaught / Nehru Place modern glass
    [1.06, 0.78, 0.64], // Old Delhi terracotta brick
    [1.02, 0.95, 0.84], // Chanakya ivory
    [0.96, 0.88, 0.78], // warm stone
    [0.90, 0.94, 0.98], // metro-corridor office
  ],
};

const ROOF_PALETTES: Record<CityId, [number, number, number][]> = {
  dubai: [
    [0.68, 0.67, 0.64],
    [0.56, 0.60, 0.65],
    [0.74, 0.70, 0.63],
    [0.52, 0.55, 0.59],
    [0.66, 0.63, 0.58],
    [0.58, 0.62, 0.66],
    [0.72, 0.68, 0.62],
    [0.54, 0.56, 0.58],
  ],
  bengaluru: [
    [0.68, 0.42, 0.32], // Mangalore / terracotta red tile roof!
    [0.64, 0.58, 0.50], // warm weathered concrete
    [0.72, 0.48, 0.36], // burnt sienna roof
    [0.52, 0.55, 0.58], // CBD office slab
    [0.70, 0.62, 0.50], // ochre lime terrace
    [0.62, 0.39, 0.31], // deep brick terrace
    [0.58, 0.60, 0.58], // cool grey slab
    [0.68, 0.56, 0.44], // sandstone terrace
  ],
  delhi: [
    [0.70, 0.48, 0.36], // sandstone red terrace
    [0.74, 0.68, 0.58], // Lutyens cream roof
    [0.64, 0.56, 0.47], // buff stone terrace
    [0.54, 0.56, 0.59], // commercial slab
    [0.68, 0.43, 0.34], // Mughal brick roof
    [0.72, 0.64, 0.52], // Dholpur buff
    [0.58, 0.55, 0.50], // weathered concrete
    [0.66, 0.54, 0.42], // ochre terrace
  ],
};

const STYLE_BASE_COLOR: Record<CityId, [number, number, number][]> = {
  dubai: [
    [0.56, 0.68, 0.78], // sleek Gulf glass tower
    [0.84, 0.80, 0.73], // limestone residential tower
    [0.52, 0.63, 0.72], // office glass
    [0.80, 0.75, 0.66], // sand midrise
  ],
  bengaluru: [
    [0.50, 0.62, 0.70],
    [0.82, 0.72, 0.62],
    [0.52, 0.61, 0.68],
    [0.78, 0.64, 0.52],
  ],
  delhi: [
    [0.52, 0.62, 0.70],
    [0.82, 0.74, 0.64],
    [0.54, 0.62, 0.68],
    [0.78, 0.62, 0.50],
  ],
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

function pushBoxBuilding(
  b: TileBuilding,
  cityId: CityId,
  pos: number[],
  nrm: number[],
  col: number[],
) {
  const [x0, z0, x1, z1] = b.bbox;
  const h = b.height;
  const baseList = STYLE_BASE_COLOR[cityId];
  const base = baseList[b.style & 3] ?? baseList[1];
  const tint = WALL_PALETTES[cityId][b.tint & 7];
  const br = Math.min(1, base[0] * tint[0]);
  const bg = Math.min(1, base[1] * tint[1]);
  const bb = Math.min(1, base[2] * tint[2]);
  const ao = 0.45;
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
  const rc = ROOF_PALETTES[cityId][b.tint & 7];
  pos.push(x0, h, z0, x0, h, z1, x1, h, z1, x0, h, z0, x1, h, z1, x1, h, z0);
  for (let k = 0; k < 6; k++) {
    nrm.push(0, 1, 0);
    col.push(rc[0], rc[1], rc[2]);
  }
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

  const size = lod === 0 && quality >= 2 ? 512 : 256;
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
  for (const b of tile.buildings) {
    const sh = Math.min(18, b.height * 0.22);
    fillRing(b.ring, "rgba(18, 20, 28, 0.34)", sh * 0.75, sh * 0.45);
    fillRing(b.ring, "rgba(15, 16, 22, 0.42)", 0, 0);
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
  const wallTints = WALL_PALETTES[cityId];
  const roofColors = ROOF_PALETTES[cityId];

  // ---------- LOD 2 (Far): merged silhouettes of taller buildings (>= 15 m) ----------
  if (lod === 2) {
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    for (const b of tile.buildings) {
      if (b.height < 15) continue;
      pushBoxBuilding(b, cityId, pos, nrm, col);
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

  // ---------- Ground & Roads: OffscreenCanvas bitmap in browser, vector fallback in Node tests / SwiftShader ----------
  const bitmaps = paintTileGroundBitmaps(tile, cityId, tileSize, lod, sea, quality);
  if (bitmaps) {
    out.groundBitmap = bitmaps.groundBitmap;
    out.nightBitmap = bitmaps.nightBitmap;
  } else {
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

  // ---------- LOD 1 (Mid): flat-coloured boxes with base AO ----------
  if (lod === 1) {
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    for (const b of tile.buildings) {
      pushBoxBuilding(b, cityId, pos, nrm, col);
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
    const tint = wallTints[b.tint & 7];
    const aoBottom = 0.46;
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

    const tris = triangulateFlat(ring);
    const rc = roofColors[b.tint & 7];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], c = tris[i + 1], d = tris[i + 2];
      roofPos.push(ring[a * 2], h, ring[a * 2 + 1], ring[d * 2], h, ring[d * 2 + 1], ring[c * 2], h, ring[c * 2 + 1]);
      for (let k = 0; k < 3; k++) {
        roofNrm.push(0, 1, 0);
        roofCol.push(rc[0], rc[1], rc[2]);
      }
    }

    if (b.roofType === 1 && h > 55) {
      const [bx0, bz0, bx1, bz1] = b.bbox;
      const bw = bx1 - bx0, bd = bz1 - bz0;
      if (bw > 16 && bd > 16) {
        const cx = (bx0 + bx1) * 0.5, cz = (bz0 + bz1) * 0.5;
        const pw = Math.min(bw * 0.28, 12), pd = Math.min(bd * 0.28, 12);
        const ph = Math.min(8, h * 0.05);
        const px0 = cx - pw, px1 = cx + pw, pz0 = cz - pd, pz1 = cz + pd;
        const pr = rc[0] * 0.85, pg = rc[1] * 0.85, pb = rc[2] * 0.85;
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
          roofCol.push(rc[0] * 0.92, rc[1] * 0.92, rc[2] * 0.92);
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
