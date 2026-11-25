// Renders a real city from OpenStreetMap: footprints extruded to their mapped
// heights and clad in photographic facades, a physical sky that the glass
// reflects, reflective water, a ground painted from the street map, street
// trees, and a cumulus cloud capping every thermal, as real thermals are.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { thermalCore } from "./glider";
import type { City, CityId } from "./citydata";

/** Facade styles, matching scripts/build-cities.ts. */
const FACADES = [
  { file: "glass-tower", w: 16, h: 14, rough: 0.18, metal: 0.3, floors: 4 },
  { file: "residential-tower", w: 14, h: 3.6, rough: 0.82, metal: 0, floors: 1 },
  { file: "office-glass", w: 14, h: 4, rough: 0.35, metal: 0.2, floors: 1 },
  { file: "indian-midrise", w: 12, h: 3.4, rough: 0.92, metal: 0, floors: 1 },
] as const;

/** The light each city is seen in: late afternoon by day, dusk by night. */
const LIGHT: Record<CityId, { day: [number, number]; ground: string; green: string; fog: number }> = {
  dubai: { day: [9, 285], ground: "#e3d3b0", green: "#6f8f4a", fog: 0.00028 },
  bengaluru: { day: [16, 250], ground: "#b8ad92", green: "#4d7a35", fog: 0.0004 },
  delhi: { day: [12, 230], ground: "#c3b393", green: "#5e7d3c", fog: 0.0005 },
};

let facadeCache: THREE.Texture[] | null = null;
export async function loadFacades(base: string, anisotropy: number) {
  if (facadeCache) return facadeCache;
  const loader = new THREE.TextureLoader();
  facadeCache = await Promise.all(
    FACADES.map(async (f) => {
      const t = await loader.loadAsync(`${base}assets/sky/${f.file}.webp`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      return t;
    }),
  );
  return facadeCache;
}

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Street lights after dark: a warm glow along every road, brighter on the big ones. */
function streetLights(city: City, size: number) {
  const { data } = city;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const sx = size / (data.half[0] * 2);
  const sz = size / (data.half[1] * 2);
  g.setTransform(sx, 0, 0, sz, data.half[0] * sx, data.half[1] * sz);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [blur, alpha] of [[6, 0.5], [0, 0.9]] as const) {
    for (const r of data.roads) {
      g.beginPath();
      for (let i = 1; i < r.length; i += 2) (i > 1 ? g.lineTo : g.moveTo).call(g, r[i], r[i + 1]);
      g.lineWidth = r[0] * (blur ? 1.6 : 0.35) + blur;
      g.strokeStyle = r[0] >= 12 ? `rgba(255,170,90,${alpha})` : `rgba(255,200,140,${alpha * 0.6})`;
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ripples for the water: tileable noise turned into a normal map (made once). */
let ripples: THREE.CanvasTexture | null = null;
function waterNormals() {
  if (ripples) return ripples;
  const n = 256;
  const h = new Float32Array(n * n);
  const rand = seeded(5);
  for (let o = 0; o < 5; o++) {
    const f = 2 ** (o + 1);
    const phase = Array.from({ length: 6 }, () => [rand() * 6.28, rand() * 6.28, Math.round(1 + rand() * 3), Math.round(rand() * 3)]);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        for (const [p, q, kx, ky] of phase)
          h[y * n + x] += Math.sin(((x * kx * f) / n) * 6.283 + p) * Math.cos(((y * (ky + 1) * f) / n) * 6.283 + q) / f;
  }
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x + n - 1) % n)];
      const dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
      const i = (y * n + x) * 4;
      img.data[i] = 128 + dx * 60;
      img.data[i + 1] = 128 + dy * 60;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  ripples = t;
  return t;
}

/** The ground, painted from the street map. Water is cut out so the water surface shows through. */
function groundTexture(city: City, size: number, night: boolean) {
  const { data } = city;
  const palette = LIGHT[data.id];
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const sx = size / (data.half[0] * 2);
  const sz = size / (data.half[1] * 2);
  g.setTransform(sx, 0, 0, sz, data.half[0] * sx, data.half[1] * sz);
  g.fillStyle = palette.ground;
  g.fillRect(-data.half[0], -data.half[1], data.half[0] * 2, data.half[1] * 2);
  // Grain, so open ground is not a flat colour.
  const rand = seeded(17);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + rand() * 0.04})`;
    const s = 4 + rand() * 18;
    g.fillRect(-data.half[0] + rand() * data.half[0] * 2, -data.half[1] + rand() * data.half[1] * 2, s, s);
  }
  const poly = (ring: number[], fill: string) => {
    g.beginPath();
    for (let i = 0; i < ring.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, ring[i], ring[i + 1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  data.sand.forEach((r) => poly(r, "#eadbb6"));
  data.green.forEach((r, i) => poly(r, i % 3 ? palette.green : "#6a8a45"));
  // Roads: kerb, asphalt, then a centre line on the wide ones.
  const line = (r: number[], width: number, colour: string, dash: number[] = []) => {
    g.beginPath();
    for (let i = 1; i < r.length; i += 2) (i > 1 ? g.lineTo : g.moveTo).call(g, r[i], r[i + 1]);
    g.lineWidth = width;
    g.strokeStyle = colour;
    g.setLineDash(dash);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke();
  };
  data.roads.forEach((r) => line(r, r[0] + 3, "#9c968a"));
  data.roads.forEach((r) => line(r, r[0], "#3c3d40"));
  data.roads.filter((r) => r[0] >= 12).forEach((r) => line(r, 0.6, night ? "#6b6346" : "#d9d2bd", [6, 8]));
  // Street lights: a warm sodium glow along every road after dark.
  if (night) data.roads.forEach((r) => line(r, Math.max(2, r[0] * 0.55), "rgba(255,170,80,0.32)"));
  g.setLineDash([]);
  // Building footprints sit darker on the ground: contact shadow.
  data.buildings.forEach((b) => poly(b.slice(2), "rgba(40,36,30,0.3)"));
  // Water: cut out.
  g.globalCompositeOperation = "destination-out";
  data.water.forEach((r) => poly(r, "#000"));
  g.globalCompositeOperation = "source-over";
  data.islands.forEach((r) => poly(r, palette.ground));
  if (city.sea) {
    // The sea mask is small (one cell per 4 m); scale it over the texture on the GPU.
    const { cols, rows, mask } = city.sea;
    const m = document.createElement("canvas");
    m.width = cols;
    m.height = rows;
    const mg = m.getContext("2d")!;
    const img = mg.createImageData(cols, rows);
    for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = mask[i] ? 255 : 0;
    mg.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "destination-out";
    g.imageSmoothingEnabled = true;
    g.drawImage(m, 0, 0, size, size);
    g.globalCompositeOperation = "source-over";
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Walls and roofs for every building, grouped by facade. */
function buildingGeometry(city: City) {
  const walls = FACADES.map(() => ({ pos: [] as number[], uv: [] as number[], nrm: [] as number[] }));
  const roofs: number[] = [];
  for (const b of city.data.buildings) {
    const [h, style] = b;
    const f = FACADES[style] ?? FACADES[1];
    const w = walls[style] ?? walls[1];
    const n = (b.length - 2) / 2;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const x0 = b[2 + i * 2];
      const z0 = b[3 + i * 2];
      const x1 = b[2 + ((i + 1) % n) * 2];
      const z1 = b[3 + ((i + 1) % n) * 2];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.01) continue;
      // Counter-clockwise footprint in x/z, viewed from above with z south: outward normal is (dz, -dx).
      const nx = (z1 - z0) / len;
      const nz = -(x1 - x0) / len;
      const u0 = along / f.w;
      const u1 = (along + len) / f.w;
      const v1 = h / f.h;
      w.pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0);
      w.uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1);
      for (let k = 0; k < 6; k++) w.nrm.push(nx, 0, nz);
      along += len;
    }
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(b[2 + i * 2], b[3 + i * 2]));
    for (const [a, c, d] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const k of [a, d, c]) roofs.push(contour[k].x, h, contour[k].y);
    }
  }
  const wallGeometries = walls.map((w) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(w.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(w.nrm, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(w.uv, 2));
    return geo;
  });
  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute(roofs, 3));
  roof.computeVertexNormals();
  return { wallGeometries, roof };
}

/** Street trees along the roads and in the parks; date palms in Dubai. */
function trees(city: City, quality: number) {
  const { data } = city;
  const rand = seeded(31);
  const spots: [number, number, number][] = [];
  const limit = quality ? (data.id === "bengaluru" ? 5200 : 2600) : 500;
  const spacing = data.id === "bengaluru" ? 13 : data.id === "delhi" ? 18 : 22;
  const ok = (x: number, z: number) => Math.abs(x) < data.half[0] && Math.abs(z) < data.half[1] && !city.hits(x, 1, z) && !city.isWater(x, z);
  for (const r of data.roads) {
    if (r[0] > 16 || spots.length > limit * 0.7) continue;
    for (let i = 1; i + 3 < r.length; i += 2) {
      const dx = r[i + 2] - r[i];
      const dz = r[i + 3] - r[i + 1];
      const len = Math.hypot(dx, dz);
      for (let s = rand() * spacing; s < len; s += spacing) {
        for (const side of [-1, 1]) {
          const off = r[0] / 2 + 3.5;
          const x = r[i] + (dx * s) / len + (-dz / len) * off * side;
          const z = r[i + 1] + (dz * s) / len + (dx / len) * off * side;
          if (rand() < 0.8 && ok(x, z)) spots.push([x, z, 0.8 + rand() * 0.6]);
        }
      }
    }
  }
  for (const ring of data.green) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) [x0, x1, z0, z1] = [Math.min(x0, ring[i]), Math.max(x1, ring[i]), Math.min(z0, ring[i + 1]), Math.max(z1, ring[i + 1])];
    const count = Math.min(400, ((x1 - x0) * (z1 - z0)) / (data.id === "dubai" ? 900 : 260));
    for (let k = 0; k < count && spots.length < limit; k++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (ok(x, z)) spots.push([x, z, 0.8 + rand() * 0.8]);
    }
  }
  const group = new THREE.Group();
  if (!spots.length) return group;
  const palm = data.id === "dubai";
  let crown: THREE.BufferGeometry;
  let trunk: THREE.BufferGeometry;
  if (palm) {
    trunk = new THREE.CylinderGeometry(0.25, 0.35, 9, 5).translate(0, 4.5, 0);
    const fronds = Array.from({ length: 7 }, (_, i) => new THREE.ConeGeometry(0.6, 4.2, 3).rotateZ(Math.PI / 2.4).rotateY((i / 7) * Math.PI * 2).translate(0, 9, 0));
    crown = mergeGeometries(fronds.map((f) => f.toNonIndexed()))!;
  } else {
    trunk = new THREE.CylinderGeometry(0.3, 0.45, 4, 5).translate(0, 2, 0);
    const blobs = [
      new THREE.IcosahedronGeometry(3.6, 1).translate(0, 6.2, 0),
      new THREE.IcosahedronGeometry(2.6, 1).translate(1.8, 5.2, 0.6),
      new THREE.IcosahedronGeometry(2.4, 1).translate(-1.6, 5.4, -0.8),
    ];
    crown = mergeGeometries(blobs)!;
  }
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), spots.length);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: palm ? 0x8a6f4e : 0x5a4636, roughness: 1 }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const greens = palm ? [0x5f7d3a, 0x6b8a40, 0x55702f] : [0x3f6b2e, 0x4c7a33, 0x587f35, 0x365e2a, 0x6a8a3a];
  spots.forEach(([x, z, s], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.9 + rand() * 0.3), s));
    crowns.setMatrixAt(i, m);
    trunks.setMatrixAt(i, m);
    crowns.setColorAt(i, c.set(greens[i % greens.length]).offsetHSL(0, 0, (rand() - 0.5) * 0.08));
  });
  crowns.castShadow = trunks.castShadow = quality > 1;
  group.add(crowns, trunks);
  return group;
}

/** Blue hour: a deep blue sky with the afterglow of sunset low in the west, and the first stars. */
function nightSky(azimuth: number) {
  const glow = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90), THREE.MathUtils.degToRad(azimuth));
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { glow: { value: glow } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 glow; varying vec3 vDir;
      void main(){
        float h = max(vDir.y, -0.05);
        vec3 zenith = vec3(0.02, 0.035, 0.11);
        vec3 mid = vec3(0.07, 0.1, 0.27);
        vec3 horizon = vec3(0.22, 0.2, 0.42);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, zenith, smoothstep(0.15, 0.7, h));
        float toward = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), glow));
        float band = exp(-max(h, 0.0) * 9.0);
        c += vec3(0.85, 0.36, 0.2) * pow(toward, 3.0) * band * 0.9 + vec3(0.5, 0.25, 0.3) * band * 0.18;
        if (vDir.y < 0.0) c = mix(c, vec3(0.03, 0.035, 0.07), smoothstep(0.0, 0.05, -vDir.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), material);
  const stars = new THREE.BufferGeometry();
  const pts: number[] = [];
  const rand = seeded(3);
  for (let i = 0; i < 1400; i++) {
    const y = 0.15 + rand() * 0.85;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 18000, y * 18000, Math.sin(a) * r * 18000);
  }
  stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const starField = new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
  const group = new THREE.Group();
  group.add(dome, starField);
  return { group, dispose: () => [dome.geometry, material, stars, starField.material as THREE.Material].forEach((d) => d.dispose()) };
}

/** Windows light up where the facade actually has glass, chosen floor by floor and bay by bay. */
function lightWindows(material: THREE.MeshStandardMaterial, floors: number, lit: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFloors = { value: floors };
    shader.uniforms.uLit = { value: lit };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uFloors;\nuniform float uLit;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // Lights come on a few bays of a floor at a time, as offices and flats do.
        vec2 grid = vMapUv * vec2(2.0, uFloors);
        vec2 cell = floor(grid);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 texel = texture2D(map, vMapUv).rgb;
        float glass = smoothstep(0.55, 0.22, dot(texel, vec3(0.299, 0.587, 0.114)));
        float on = step(h, uLit) * glass;
        // Far away, windows are smaller than a pixel: fade to their average instead of shimmering.
        float far = smoothstep(0.18, 0.6, length(fwidth(grid)));
        on = mix(on, uLit * 0.55, far);
        vec3 warm = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.84, 0.62), fract(h * 7.0));
        totalEmissiveRadiance += warm * on * (0.5 + fract(h * 13.0) * 0.35) + texel * 0.05;`,
      );
  };
  material.customProgramCacheKey = () => `windows-${floors}-${lit}`;
}

/** A soft cumulus built from sprites. */
let cloudTexture: THREE.Texture | null = null;
function cloud(rand: () => number, night: boolean) {
  if (!cloudTexture) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.7)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    cloudTexture = new THREE.CanvasTexture(c);
  }
  const group = new THREE.Group();
  const puffs = 9 + Math.floor(rand() * 5);
  for (let i = 0; i < puffs; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTexture, color: night ? (i < puffs / 3 ? 0x2e3158 : 0x4a4a78) : i < puffs / 3 ? 0xd9d4cc : 0xffffff, transparent: true, depthWrite: false, opacity: night ? 0.75 : 0.92 });
    const s = new THREE.Sprite(mat);
    const size = 70 + rand() * 90;
    s.scale.set(size, size * 0.7, 1);
    s.position.set((rand() - 0.5) * 220, (i < puffs / 3 ? 0 : 25 + rand() * 50), (rand() - 0.5) * 140);
    group.add(s);
  }
  return group;
}

export interface BuiltWorld {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  sunDirection: THREE.Vector3;
  fog: THREE.FogExp2;
  update(time: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

/** Give the browser a turn between heavy steps, so scrolling never waits on the build. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function buildWorld(city: City, facades: THREE.Texture[], renderer: THREE.WebGLRenderer, night: boolean, quality: number): Promise<BuiltWorld> {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const id = city.data.id;
  const look = LIGHT[id];

  // Sky and sun. By day, late-afternoon sun through a physical sky; by night, blue hour.
  const [elevation, azimuth] = night ? [4, look.day[1]] : look.day;
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let env: THREE.Texture;
  if (night) {
    const dusk = nightSky(azimuth);
    group.add(dusk.group);
    keep(dusk);
    const envDusk = nightSky(azimuth);
    envDusk.group.scale.setScalar(0.05);
    envScene.add(envDusk.group);
    env = keep(pmrem.fromScene(envScene).texture);
    envDusk.dispose();
  } else {
    const sky = new Sky();
    sky.scale.setScalar(30000);
    const u = sky.material.uniforms;
    u.turbidity.value = id === "delhi" ? 7 : id === "dubai" ? 3.2 : 2.6;
    u.rayleigh.value = id === "delhi" ? 1.6 : 1.1;
    u.mieCoefficient.value = id === "delhi" ? 0.008 : 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sunDirection);
    group.add(sky);
    keep(sky.geometry);
    keep(sky.material);
    // Reflections come from the same sky.
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    Object.assign(envSky.material.uniforms, THREE.UniformsUtils.clone(sky.material.uniforms));
    envSky.material.uniforms.sunPosition.value.copy(sunDirection);
    envScene.add(envSky);
    env = keep(pmrem.fromScene(envScene).texture);
    envSky.geometry.dispose();
    envSky.material.dispose();
  }
  pmrem.dispose();

  const sunColor = night ? new THREE.Color(0xff9e7a) : new THREE.Color().setHSL(0.09, 0.8, elevation < 20 ? 0.82 : 0.92);
  const sun = new THREE.DirectionalLight(sunColor, night ? 0.9 : 4.2);
  sun.position.copy(sunDirection).multiplyScalar(800);
  sun.castShadow = quality > 1;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 50, far: 2000 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  group.add(sun, sun.target);
  group.add(new THREE.HemisphereLight(night ? 0x7d8fd0 : 0xcfe2ff, night ? 0x2a2530 : 0x8a7a5e, night ? 1.5 : 1.6));

  // Water: one surface under everything, showing through the ground wherever the map has water.
  let water: Water | null = null;
  const waterGeo = keep(new THREE.PlaneGeometry(20000, 20000));
  if (quality > 1) {
    water = new Water(waterGeo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals(),
      sunDirection,
      sunColor: night ? 0xff9e7a : 0xfff1d6,
      waterColor: night ? 0x0a1a3a : id === "dubai" ? 0x0f5a66 : 0x1f4a44,
      distortionScale: 2.4,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    (water.material as THREE.ShaderMaterial).uniforms.size.value = 6;
    keep(water.material as THREE.Material);
    group.add(water);
  } else {
    const plain = new THREE.Mesh(waterGeo, keep(new THREE.MeshStandardMaterial({ color: id === "dubai" ? 0x145f6c : 0x22504a, roughness: 0.08, metalness: 0.2, envMap: env })));
    plain.rotation.x = -Math.PI / 2;
    group.add(plain);
  }

  await breathe();
  // Ground inside the mapped area, and plain land around it where the map edge is land.
  const ground = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(city.data.half[0] * 2, city.data.half[1] * 2)),
    keep(
      new THREE.MeshStandardMaterial({
        map: keep(groundTexture(city, quality === 2 ? 3072 : quality === 1 ? 2048 : 1024, night)),
        roughness: 0.95,
        alphaTest: 0.5,
        color: night ? 0x8a8a9a : 0xffffff,
        emissive: night ? 0xffffff : 0x000000,
        emissiveMap: night ? keep(streetLights(city, quality === 2 ? 2048 : 1024)) : null,
        emissiveIntensity: night ? 1.6 : 0,
      }),
    ),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.15;
  ground.receiveShadow = true;
  group.add(ground);
  const surround = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.ground).multiplyScalar(night ? 0.3 : 0.92), roughness: 1 });
  keep(surround);
  // Beyond the mapped area: land continues outward wherever the map's edge is land.
  const [hx, hz] = city.data.half;
  const far = 9000;
  const STEP_EDGE = 50;
  const quads: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number) => quads.push(x0, 0.1, z0, x1, 0.1, z0, x1, 0.1, z1, x0, 0.1, z0, x1, 0.1, z1, x0, 0.1, z1);
  for (let x = -hx; x < hx; x += STEP_EDGE) {
    const x1 = Math.min(hx, x + STEP_EDGE);
    if (!city.isWater((x + x1) / 2, -hz + 20)) quad(x, -hz - far, x1, -hz);
    if (!city.isWater((x + x1) / 2, hz - 20)) quad(x, hz, x1, hz + far);
  }
  for (let z = -hz; z < hz; z += STEP_EDGE) {
    const z1 = Math.min(hz, z + STEP_EDGE);
    if (!city.isWater(-hx + 20, (z + z1) / 2)) quad(-hx - far, z, -hx, z1);
    if (!city.isWater(hx - 20, (z + z1) / 2)) quad(hx, z, hx + far, z1);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    if (!city.isWater(sx * (hx - 20), sz * (hz - 20))) quad(Math.min(sx * hx, sx * (hx + far)), Math.min(sz * hz, sz * (hz + far)), Math.max(sx * hx, sx * (hx + far)), Math.max(sz * hz, sz * (hz + far)));
  if (quads.length) {
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(quads, 3));
    geo.computeVertexNormals();
    const surround = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(look.ground).multiplyScalar(night ? 0.45 : 0.9), roughness: 1, side: THREE.DoubleSide })));
    surround.receiveShadow = quality > 1;
    group.add(surround);
  }

  await breathe();
  // Buildings
  const { wallGeometries, roof } = buildingGeometry(city);
  wallGeometries.forEach((geo, i) => {
    const f = FACADES[i];
    const mat = keep(
      new THREE.MeshStandardMaterial({
        map: facades[i],
        roughness: f.rough,
        metalness: f.metal,
        envMap: env,
        envMapIntensity: night ? 1.1 : 0.6,
        emissive: 0x000000,
      }),
    );
    if (night) lightWindows(mat, f.floors, i === 3 ? 0.28 : 0.36);
    const mesh = new THREE.Mesh(keep(geo), mat);
    mesh.castShadow = mesh.receiveShadow = quality > 1;
    group.add(mesh);
  });
  const roofMesh = new THREE.Mesh(keep(roof), keep(new THREE.MeshStandardMaterial({ color: night ? 0x3a3a48 : 0x8f8a82, roughness: 0.9, envMap: env, envMapIntensity: 0.3 })));
  roofMesh.castShadow = roofMesh.receiveShadow = quality > 1;
  group.add(roofMesh);

  await breathe();
  const greenery = trees(city, quality);
  greenery.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      keep(o.geometry);
      keep(o.material as THREE.Material);
      if (night) (o.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.55);
    }
  });
  group.add(greenery);

  await breathe();
  // Boats on the water
  if (id === "dubai") {
    const hull = keep(mergeGeometries([new THREE.BoxGeometry(5, 2, 18).translate(0, 1, 0), new THREE.BoxGeometry(4, 2.2, 7).translate(0, 3, -1)])!);
    const white = keep(new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4, envMap: env }));
    const rand = seeded(77);
    for (let i = 0, placed = 0; i < 4000 && placed < 40; i++) {
      const x = (rand() - 0.5) * city.data.half[0] * 1.6;
      const z = (rand() - 0.5) * city.data.half[1] * 1.6;
      if (!city.isWater(x, z) || !city.isWater(x + 12, z) || !city.isWater(x, z + 12) || !city.isWater(x - 12, z - 12)) continue;
      const b = new THREE.Mesh(hull, white);
      b.position.set(x, 0, z);
      b.rotation.y = rand() * Math.PI;
      group.add(b);
      placed++;
    }
  }

  // A cumulus caps each thermal, carried downwind as the air rose.
  const rand = seeded(id.length * 101);
  const clouds = city.thermals.map((t) => {
    const top = Math.min(t.top + 60, 1400);
    const core = thermalCore(t, top, city.breeze);
    const c = cloud(rand, night);
    c.position.set(core.x, top, core.z);
    group.add(c);
    return c;
  });
  clouds.forEach((c) => c.traverse((o) => o instanceof THREE.Sprite && keep(o.material)));

  // Haze: warm by day, deep blue at blue hour.
  const fog = new THREE.FogExp2(night ? 0x1b2246 : id === "delhi" ? 0xd8c7aa : id === "dubai" ? 0xe7c9a0 : 0xc7d6dc, night ? 0.00022 : id === "delhi" ? 0.00026 : id === "dubai" ? 0.00014 : 0.00018);

  // At night the lights bloom, where the device can afford it.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  const size = renderer.getSize(new THREE.Vector2());
  const setupComposer = (scene: THREE.Scene, camera: THREE.Camera) => {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 0.7);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
  };

  return {
    group,
    sun,
    sunDirection,
    fog,
    update(time) {
      if (water) (water.material as THREE.ShaderMaterial).uniforms.time.value = time * 0.6;
    },
    render(scene, camera) {
      if (night && quality > 1) {
        if (!composer) setupComposer(scene, camera);
        composer!.render();
      } else renderer.render(scene, camera);
    },
    setSize(width, height) {
      size.set(width, height);
      composer?.setPixelRatio(renderer.getPixelRatio());
      composer?.setSize(width, height);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      bloom?.dispose();
      composer?.dispose();
    },
  };
}

/** The paper plane: a classic dart, folded from one cream sheet. */
export function paperPlane() {
  const v = [
    [0, 0.02, -1.6],
    [-1.2, 0.12, 0.95],
    [1.2, 0.12, 0.95],
    [0, 0, 0.95],
    [0, -0.34, 0.95],
  ];
  const faces = [[0, 1, 3], [0, 3, 2], [0, 3, 4], [0, 4, 3]];
  const positions: number[] = [];
  faces.forEach((f) => f.forEach((i) => positions.push(...v[i])));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xfffaf0, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x9a8a74 }));
  mesh.castShadow = true;
  const fold = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.03, -1.55), new THREE.Vector3(0, 0.03, 0.95)]),
    new THREE.LineBasicMaterial({ color: 0xff4d1c }),
  );
  const plane = new THREE.Group();
  plane.add(mesh, fold);
  plane.children.forEach((c) => c.scale.setScalar(1.5)); // a 3.6 m span
  return plane;
}

/** A ring to fly through. */
export function ring() {
  return new THREE.Mesh(new THREE.TorusGeometry(16, 0.9, 10, 56), new THREE.MeshBasicMaterial({ color: 0xff4d1c, transparent: true, opacity: 0.9 }));
}
