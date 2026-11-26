// High-performance streamed 3D city renderer:
// - Worker-painted 512x512 per-tile ground & night street-light maps (1 quad/tile, zero Z-fighting, baked drop-shadows)
// - Native RepeatWrapping photographic facades + city-authentic palettes + base AO
// - 17 bespoke multi-coloured 3D landmarks (Burj Khalifa, Burj Al Arab, Ain Dubai, Atlantis, Museum of the Future,
//   Cayan Twist, Vidhana Soudha, High Court, Chinnaswamy Cricket Stadium, India Gate, Rashtrapati Bhavan,
//   Parliament House, Connaught Place, Jama Masjid, Red Fort, Humayun's Tomb, Spire Towers)
// - Flowering Gulmohar/Jacaranda canopy in Bengaluru, instanced superyachts in Dubai, 1-draw-call clouds.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { thermalCore } from "./glider";
import type { City, CityId, CityLandmark } from "./citydata";
import { decodeTile, TILE_SIZE } from "./tileformat";
import { buildTileGeometry, type BuiltTileData, type TileLod } from "./tile-geom";
import type { WorkerMessageIn, WorkerResponse } from "./tile-worker";

const FACADES = [
  { file: "glass-tower", rough: 0.2, metal: 0.34, floors: 4 },
  { file: "residential-tower", rough: 0.78, metal: 0.04, floors: 1 },
  { file: "office-glass", rough: 0.32, metal: 0.24, floors: 1 },
  { file: "indian-midrise", rough: 0.88, metal: 0.0, floors: 1 },
] as const;

const LOOK: Record<
  CityId,
  {
    daySun: [number, number];
    groundDay: number;
    groundNight: number;
    fogDay: number;
    fogNight: number;
    fogDensityDay: number;
    fogDensityNight: number;
    waterDay: number;
    waterNight: number;
    turbidity: number;
    rayleigh: number;
  }
> = {
  dubai: {
    daySun: [18, 275],
    groundDay: 0xdec9a2,
    groundNight: 0x1a1d2c,
    fogDay: 0xdbe4ea,
    fogNight: 0x141b36,
    fogDensityDay: 0.00013, // Clear Gulf air so Burj Al Arab & Burj Khalifa are visible from Marina!
    fogDensityNight: 0.00018,
    waterDay: 0x0d6f82, // Rich turquoise-emerald Arabian Gulf
    waterNight: 0x081832,
    turbidity: 2.8,
    rayleigh: 1.2,
  },
  bengaluru: {
    daySun: [24, 245],
    groundDay: 0x9e947c,
    groundNight: 0x171c28,
    fogDay: 0xcbe0eb,
    fogNight: 0x131a32,
    fogDensityDay: 0.00024,
    fogDensityNight: 0.00028,
    waterDay: 0x1a5c54,
    waterNight: 0x091928,
    turbidity: 2.4,
    rayleigh: 1.15,
  },
  delhi: {
    daySun: [17, 232],
    groundDay: 0xb8a585,
    groundNight: 0x1c1a28,
    fogDay: 0xe2d6be,
    fogNight: 0x181b34,
    fogDensityDay: 0.00025,
    fogDensityNight: 0.00028,
    waterDay: 0x1f5550,
    waterNight: 0x0a1728,
    turbidity: 4.6,
    rayleigh: 1.45,
  },
};

function seeded(seed: number) {
  let s = (Math.abs(seed) % 2147483646) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

let facadePromise: Promise<THREE.Texture[]> | null = null;
export function loadFacades(base: string, anisotropy: number): Promise<THREE.Texture[]> {
  if (facadePromise) return facadePromise;
  const loader = new THREE.TextureLoader();
  facadePromise = Promise.all(
    FACADES.map(async (f) => {
      const tex = await loader.loadAsync(`${base}assets/sky/${f.file}.webp`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = Math.min(8, anisotropy);
      return tex;
    }),
  );
  facadePromise.catch(() => {
    facadePromise = null;
  });
  return facadePromise;
}

let rippleTex: THREE.CanvasTexture | null = null;
function waterNormals(): THREE.CanvasTexture {
  if (rippleTex) return rippleTex;
  const n = 256;
  const h = new Float32Array(n * n);
  const rand = seeded(5);
  for (let o = 0; o < 4; o++) {
    const f = 2 ** (o + 1);
    const phase = Array.from({ length: 5 }, () => [rand() * 6.28, rand() * 6.28, Math.round(1 + rand() * 3), Math.round(rand() * 3)]);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        for (const [p, q, kx, ky] of phase) {
          h[y * n + x] += (Math.sin(((x * kx * f) / n) * 6.283 + p) * Math.cos(((y * (ky + 1) * f) / n) * 6.283 + q)) / f;
        }
      }
    }
  }
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x + n - 1) % n)];
      const dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
      const i = (y * n + x) * 4;
      img.data[i] = 128 + dx * 75;
      img.data[i + 1] = 128 + dy * 75;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(110, 110);
  rippleTex = t;
  return t;
}

function createWallMaterials(facades: THREE.Texture[], env: THREE.Texture | null, uNight: { value: number }) {
  return FACADES.map((f, idx) => {
    const mat = new THREE.MeshStandardMaterial({
      map: facades[idx],
      vertexColors: true,
      roughness: f.rough,
      metalness: f.metal,
      envMap: env,
      envMapIntensity: 0.85,
    });
    const floors = f.floors;
    const lit = idx === 3 ? 0.36 : 0.46;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = uNight;
      shader.uniforms.uFloors = { value: floors };
      shader.uniforms.uLit = { value: lit };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uNight;\nuniform float uFloors;\nuniform float uLit;")
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          if (uNight > 0.01) {
            vec2 grid = vMapUv * vec2(2.0, uFloors);
            vec2 cell = floor(grid);
            float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
            vec3 texel = texture2D(map, vMapUv).rgb;
            float glass = smoothstep(0.58, 0.20, dot(texel, vec3(0.299, 0.587, 0.114)));
            float on = step(h, uLit) * glass;
            float farFade = smoothstep(0.22, 0.75, length(fwidth(grid)));
            on = mix(on, uLit * 0.5, farFade);
            vec3 warm = mix(vec3(1.0, 0.70, 0.36), vec3(0.86, 0.94, 1.0), step(0.78, fract(h * 11.3)));
            totalEmissiveRadiance += (warm * on * (0.95 + fract(h * 7.1) * 0.55) + texel * 0.06) * uNight;
          }`,
        );
    };
    mat.customProgramCacheKey = () => `sky-wall-v4-${idx}`;
    return mat;
  });
}

function createMidMaterial(env: THREE.Texture | null, uNight: { value: number }) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.64,
    metalness: 0.18,
    envMap: env,
    envMapIntensity: 0.65,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uNight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNrm;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNrm;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if (abs(vWorldNrm.y) < 0.5) {
          float floorBand = 0.84 + 0.16 * step(0.30, fract(vWorldPos.y * 0.27));
          float bayBand = 0.90 + 0.10 * step(0.20, fract((vWorldPos.x + vWorldPos.z) * 0.16));
          diffuseColor.rgb *= floorBand * bayBand;
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (uNight > 0.01 && abs(vWorldNrm.y) < 0.5) {
          float flr = floor(vWorldPos.y * 0.27);
          float bay = floor((vWorldPos.x + vWorldPos.z) * 0.14);
          float h = fract(sin(dot(vec2(bay, flr), vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(h, 0.38) * smoothstep(2.0, 12.0, vWorldPos.y);
          vec3 glow = mix(vec3(1.0, 0.70, 0.35), vec3(0.92, 0.90, 0.80), fract(h * 9.0));
          totalEmissiveRadiance += glow * lit * 0.75 * uNight;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "sky-mid-buildings-v4";
  return mat;
}

function createNightSky(azimuth: number) {
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
        vec3 mid = vec3(0.075, 0.11, 0.28);
        vec3 horizon = vec3(0.24, 0.22, 0.42);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, zenith, smoothstep(0.15, 0.7, h));
        float toward = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), glow));
        float band = exp(-max(h, 0.0) * 8.5);
        c += vec3(0.90, 0.42, 0.22) * pow(toward, 3.0) * band * 0.88 + vec3(0.48, 0.28, 0.34) * band * 0.22;
        if (vDir.y < 0.0) c = mix(c, vec3(0.04, 0.05, 0.10), smoothstep(0.0, 0.05, -vDir.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(14000, 40, 20), material);
  const stars = new THREE.BufferGeometry();
  const pts: number[] = [];
  const rand = seeded(3);
  for (let i = 0; i < 1200; i++) {
    const y = 0.12 + rand() * 0.88;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 13000, y * 13000, Math.sin(a) * r * 13000);
  }
  stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const starField = new THREE.Points(
    stars,
    new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.88, fog: false }),
  );
  const group = new THREE.Group();
  group.add(dome, starField);
  return {
    group,
    dispose: () => [dome.geometry, material, stars, starField.material as THREE.Material].forEach((d) => d.dispose()),
  };
}

let glowTex: THREE.CanvasTexture | null = null;
function softCircleTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Paint vertex colors onto a BufferGeometry and convert to non-indexed for single-draw-call merging. */
function coloredPart(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute("uv");
  const count = g.attributes.position.count;
  const col = new Float32Array(count * 3);
  const c = new THREE.Color(hex);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    // Subtle ground-contact shading near y=0
    const y = pos.getY(i);
    const ao = y < 12 ? 0.68 + 0.32 * Math.max(0, y / 12) : 1.0;
    col[i * 3] = c.r * ao;
    col[i * 3 + 1] = c.g * ao;
    col[i * 3 + 2] = c.b * ao;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Builds bespoke, multi-coloured 3D architectural sculptures for all 21 landmarks across
 * Dubai, Bengaluru, and Delhi so each city is unmistakably recognizable on sight!
 */
function buildLandmarks(landmarks: CityLandmark[], env: THREE.Texture | null, uNight: { value: number }) {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const beacons: THREE.Sprite[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const beaconMat = keep(
    new THREE.SpriteMaterial({
      map: softCircleTexture(),
      color: 0xff3b1f,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );

  for (const lm of landmarks) {
    const parts: THREE.BufferGeometry[] = [];
    const h = lm.height;
    const r = lm.radius;
    const add = (geo: THREE.BufferGeometry, color = lm.color) => parts.push(coloredPart(geo, color));

    if (lm.kind === "burj") {
      // Burj Khalifa (828 m): gleaming Y-shaped 12-tier spiralling setbacks + chrome needle spire
      const tiers = 12;
      for (let t = 0; t < tiers; t++) {
        const frac = t / tiers;
        const th = (h * 0.76) / tiers;
        const y = frac * h * 0.76;
        const cr = r * 0.28 * (1 - frac * 0.76);
        add(new THREE.CylinderGeometry(cr * 0.92, cr, th, 9).translate(0, y + th / 2, 0), 0xd8e6f2);
        for (let w = 0; w < 3; w++) {
          const wingMax = 0.96 - ((w * 0.22 + t * 0.05) % 0.88);
          if (frac > wingMax) continue;
          const a = (w * Math.PI * 2) / 3 + 0.35;
          const wl = r * (0.95 - frac * 0.76);
          const ww = Math.max(4.5, cr * 0.88);
          add(new THREE.BoxGeometry(ww, th, wl).translate(0, y + th / 2, wl * 0.45).rotateY(a), t % 2 ? 0xc6daec : 0xdde9f5);
        }
      }
      add(new THREE.CylinderGeometry(0.7, r * 0.08, h * 0.26, 8).translate(0, h * 0.87, 0), 0xf0f6fc);
    } else if (lm.kind === "sail") {
      // Burj Al Arab (321 m): sandy island + billowing white sail + royal-blue atrium + helipad!
      add(new THREE.CylinderGeometry(r * 1.35, r * 1.5, 4, 18).translate(0, 2, 0), 0xe8d8b4);
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        const f = i / segs;
        const sh = (h * 0.84) / segs;
        const belly = Math.sin(f * Math.PI * 0.92 + 0.12) * r * 0.95 + r * 0.22;
        const width = r * 0.52 * (1 - f * 0.52);
        add(new THREE.BoxGeometry(width, sh, belly).translate(0, 4 + f * h * 0.84 + sh / 2, belly * 0.18), 0xfaf8f2);
        add(new THREE.BoxGeometry(width * 0.55, sh * 0.9, belly * 0.35).translate(0, 4 + f * h * 0.84 + sh / 2, -belly * 0.25), 0x2d6da8);
      }
      // Spine mast + Skyview restaurant bar + green helipad disc
      add(new THREE.CylinderGeometry(1.0, 3.4, h, 8).translate(0, h / 2, -r * 0.28), 0xffffff);
      add(new THREE.BoxGeometry(r * 1.15, 7, 12).translate(0, h * 0.62, -r * 0.05), 0xe6eef6);
      add(new THREE.CylinderGeometry(13, 13, 2.5, 18).translate(0, h * 0.66, r * 0.62), 0x2a8c5a);
    } else if (lm.kind === "wheel") {
      // Ain Dubai (250 m): giant white observation wheel + 4 A-frame support legs + rim capsules!
      const hubY = h * 0.54;
      const wheelR = h * 0.45;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.CylinderGeometry(1.6, 2.4, hubY * 1.08, 6);
          leg.translate(0, hubY / 2, 0);
          leg.rotateZ(sx * -0.22);
          leg.rotateX(sz * 0.14);
          leg.translate(sx * hubY * 0.11, 0, sz * hubY * 0.07);
          add(leg, 0xf6f6f2);
        }
      }
      add(new THREE.TorusGeometry(wheelR, 3.2, 8, 36).translate(0, hubY, 0), 0xffffff);
      add(new THREE.CylinderGeometry(6, 6, 14, 12).rotateX(Math.PI / 2).translate(0, hubY, 0), 0xeaeef2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        add(new THREE.CylinderGeometry(0.65, 0.65, wheelR * 2, 4).rotateZ(a).translate(0, hubY, 0), 0xdce4ec);
      }
    } else if (lm.kind === "atlantis") {
      // Atlantis The Palm: twin coral-rose stepped towers + grand Arabian keyhole bridge arch!
      const archW = r * 0.55;
      const wingW = r * 0.65;
      // Left & right stepped coral wings
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(wingW, h * 0.72, 26).translate(side * (archW * 0.5 + wingW * 0.45), h * 0.36, 0), 0xe6ac92);
        add(new THREE.BoxGeometry(wingW * 0.6, h * 0.92, 22).translate(side * (archW * 0.5 + wingW * 0.22), h * 0.46, 0), 0xebbaa2);
        add(new THREE.ConeGeometry(7, 18, 8).translate(side * (archW * 0.5 + wingW * 0.22), h * 0.92 + 9, 0), 0x2b8c96);
      }
      // Upper bridge spanning the open keyhole arch
      add(new THREE.BoxGeometry(archW + 16, h * 0.32, 24).translate(0, h * 0.76, 0), 0xeec2ac);
      add(new THREE.CylinderGeometry(9, 10, 16, 10).translate(0, h * 0.95, 0), 0xe6ac92);
      add(new THREE.ConeGeometry(8, 16, 10).translate(0, h * 1.08, 0), 0x2b8c96);
    } else if (lm.kind === "torus") {
      // Museum of the Future (78 m): emerald green mound + gleaming stainless-steel elliptical torus!
      add(new THREE.CylinderGeometry(r * 0.75, r * 1.25, 16, 20).scale(1.3, 1, 0.85).translate(0, 8, 0), 0x3b7a36);
      const torus = new THREE.TorusGeometry(h * 0.42, h * 0.16, 14, 32);
      torus.scale(1.38, 0.95, 0.52);
      torus.translate(0, 14 + h * 0.44, 0);
      add(torus, 0xe4ecf2);
    } else if (lm.kind === "twist") {
      // Cayan Tower (306 m): 18 stacked floor slabs twisting smoothly through 90 degrees!
      const slabs = 18;
      const sh = h / slabs;
      for (let i = 0; i < slabs; i++) {
        const f = i / slabs;
        add(
          new THREE.BoxGeometry(r * 1.35, sh * 0.96, r * 1.35)
            .rotateY(f * (Math.PI / 2))
            .translate(0, i * sh + sh / 2, 0),
          i % 2 ? 0xc2d5e6 : 0xd4e3f0,
        );
      }
    } else if (lm.kind === "vidhana") {
      // Vidhana Soudha (52 m): grand white Mysore granite palace + colonnade + 4 corner domes + gold Gopuram!
      const baseH = h * 0.52;
      add(new THREE.BoxGeometry(r * 1.9, baseH, r * 1.15).translate(0, baseH / 2, 0), 0xf2ece0);
      // Grand ceremonial eastern steps & portico
      add(new THREE.BoxGeometry(r * 0.75, baseH * 0.95, r * 0.35).translate(0, baseH * 0.48, r * 0.68), 0xfaf6ec);
      add(new THREE.BoxGeometry(r * 0.85, 5, r * 0.35).translate(0, 2.5, r * 0.95), 0xe6dfd0);
      // Central stepped Dravidian Gopuram dome + gold emblem finial
      add(new THREE.CylinderGeometry(r * 0.22, r * 0.26, h * 0.24, 12).translate(0, baseH + h * 0.12, r * 0.15), 0xf6f0e4);
      add(new THREE.SphereGeometry(r * 0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, baseH + h * 0.24, r * 0.15), 0xfbf8f0);
      add(new THREE.ConeGeometry(3.2, 9, 8).translate(0, h + 3, r * 0.15), 0xe8b932);
      // Four corner domes
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          add(new THREE.CylinderGeometry(r * 0.1, r * 0.11, h * 0.16, 10).translate(sx * r * 0.78, baseH + h * 0.08, sz * r * 0.42), 0xf2ece0);
          add(new THREE.SphereGeometry(r * 0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(sx * r * 0.78, baseH + h * 0.16, sz * r * 0.42), 0xfaf6ec);
        }
      }
    } else if (lm.kind === "highcourt") {
      // Attara Kacheri (Karnataka High Court): iconic Pompeian brick-red neoclassical colonnade!
      add(new THREE.BoxGeometry(r * 1.85, h * 0.82, r * 0.75).translate(0, h * 0.41, 0), 0xb83828);
      add(new THREE.BoxGeometry(r * 0.65, h, r * 0.88).translate(0, h * 0.5, 0), 0xc44230);
      add(new THREE.BoxGeometry(r * 1.9, 2.2, r * 0.8).translate(0, h * 0.84, 0), 0xf2ece2);
    } else if (lm.kind === "stadium") {
      // M. Chinnaswamy Cricket Stadium: emerald oval turf + 22-yard pitch + white roof ring + 4 floodlight towers!
      add(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 1.2, 28).translate(0, 0.8, 0), 0x288236);
      add(new THREE.BoxGeometry(4.5, 1.4, 22).translate(0, 0.9, 0), 0xd8c396); // 22-yard cricket pitch!
      const stands = new THREE.CylinderGeometry(r * 1.02, r * 0.84, h * 0.52, 28, 1, true);
      stands.translate(0, h * 0.26, 0);
      add(stands, 0xd8d4cc);
      const roofRing = new THREE.TorusGeometry(r * 0.93, r * 0.14, 6, 28);
      roofRing.rotateX(Math.PI / 2);
      roofRing.scale(1, 1, 0.35);
      roofRing.translate(0, h * 0.54, 0);
      add(roofRing, 0xf7f5f0);
      // 4 iconic tall floodlight towers
      for (const a of [0.78, 2.35, 3.92, 5.5]) {
        const fx = Math.cos(a) * r * 1.06;
        const fz = Math.sin(a) * r * 1.06;
        add(new THREE.CylinderGeometry(0.9, 1.8, h * 1.35, 6).translate(fx, h * 0.675, fz), 0xdde2e8);
        add(new THREE.BoxGeometry(9, 6, 2.5).rotateY(-a + Math.PI / 2).translate(fx, h * 1.35, fz), 0xfffbe8);
      }
    } else if (lm.kind === "indiagate") {
      // India Gate (44 m) + Ceremonial Chhatri Canopy in warm Bharatpur ochre-red sandstone!
      const w = r * 1.45;
      const d = r * 0.58;
      const legW = w * 0.31;
      const archH = h * 0.62;
      // Plinth
      add(new THREE.BoxGeometry(w * 1.3, 2.5, d * 1.5).translate(0, 1.25, 0), 0xc67c4e);
      // Left & right piers (oriented N-S so the E-W Kartavya Path passes right through the arch!)
      add(new THREE.BoxGeometry(d, archH, legW).translate(0, archH / 2, -w * 0.34), 0xd99660);
      add(new THREE.BoxGeometry(d, archH, legW).translate(0, archH / 2, w * 0.34), 0xd99660);
      // Upper entablature & stepped Lutyens attic
      add(new THREE.BoxGeometry(d * 1.08, h * 0.24, w * 1.04).translate(0, archH + h * 0.12, 0), 0xde9e68);
      add(new THREE.BoxGeometry(d * 0.88, h * 0.14, w * 0.82).translate(0, h * 0.93, 0), 0xc98452);
      // Sandstone Canopy 150 m east on the axis
      add(new THREE.CylinderGeometry(9, 11, 3, 12).translate(145, 1.5, 0), 0xc67c4e);
      for (const a of [0.8, 2.35, 3.92, 5.5]) {
        add(new THREE.CylinderGeometry(0.7, 0.8, 14, 6).translate(145 + Math.cos(a) * 6, 8.5, Math.sin(a) * 6), 0xd99660);
      }
      add(new THREE.SphereGeometry(7.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(145, 15.5, 0), 0xde9e68);
    } else if (lm.kind === "rashtrapati") {
      // Rashtrapati Bhavan + Raisina Hill podium + iconic dark copper Lutyens dome!
      const baseH = h * 0.42;
      add(new THREE.BoxGeometry(r * 1.5, 6, r * 1.8).translate(0, 3, 0), 0xb85c42); // red sandstone podium
      add(new THREE.BoxGeometry(r * 1.25, baseH, r * 1.55).translate(0, 6 + baseH / 2, 0), 0xe2be96); // cream sandstone colonnade
      // Drum + dark copper-patina Lutyens dome!
      add(new THREE.CylinderGeometry(r * 0.22, r * 0.24, h * 0.24, 16).translate(0, 6 + baseH + h * 0.12, 0), 0xd99664);
      add(new THREE.SphereGeometry(r * 0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 6 + baseH + h * 0.24, 0), 0x3b4846);
      // North & South Secretariat flank domes
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(r * 0.95, baseH * 0.85, r * 0.55).translate(r * 1.15, 3 + baseH * 0.42, sz * r * 0.95), 0xd99664);
        add(new THREE.SphereGeometry(r * 0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(r * 1.15, 3 + baseH * 0.85, sz * r * 0.95), 0xc46b4c);
      }
    } else if (lm.kind === "parliament") {
      // Sansad Bhavan (Parliament House): iconic circular colonnaded sandstone drum!
      add(new THREE.CylinderGeometry(r, r * 1.03, 4, 32).translate(0, 2, 0), 0xb85c42);
      add(new THREE.CylinderGeometry(r * 0.95, r * 0.95, h * 0.72, 32).translate(0, 4 + h * 0.36, 0), 0xe6c69e);
      add(new THREE.CylinderGeometry(r * 0.32, r * 0.34, h * 0.28, 20).translate(0, 4 + h * 0.72, 0), 0xd69464);
    } else if (lm.kind === "connaught") {
      // Connaught Place: concentric crisp-white Georgian colonnade rings + Central Park + Tricolour flag!
      add(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 1.2, 32).translate(0, 0.8, 0), 0x337832);
      for (const ringR of [r * 0.72, r * 0.98]) {
        const ring = new THREE.TorusGeometry(ringR, 11, 6, 36);
        ring.rotateX(Math.PI / 2);
        ring.scale(1, 1, 1.2);
        ring.translate(0, 11, 0);
        add(ring, 0xf7f4ec);
      }
      // 60 m Central Park flagpole + Tricolour
      add(new THREE.CylinderGeometry(0.45, 0.8, 60, 6).translate(0, 30, 0), 0xe0e4e8);
      add(new THREE.BoxGeometry(16, 3.5, 0.8).translate(8, 57, 0), 0xff671f);
      add(new THREE.BoxGeometry(16, 3.5, 0.8).translate(8, 53.5, 0), 0xffffff);
      add(new THREE.BoxGeometry(16, 3.5, 0.8).translate(8, 50, 0), 0x046a38);
    } else if (lm.kind === "mosque") {
      // Jama Masjid: red-sandstone shahi courtyard + 3 white-marble onion domes + twin 44 m minarets!
      add(new THREE.BoxGeometry(r * 1.6, 5, r * 1.6).translate(0, 2.5, 0), 0xb84836);
      add(new THREE.BoxGeometry(r * 1.2, h * 0.45, r * 0.45).translate(0, 5 + h * 0.225, -r * 0.45), 0xc4523e);
      for (const [ox, sc] of [[0, 1.0], [-r * 0.36, 0.72], [r * 0.36, 0.72]] as const) {
        add(new THREE.SphereGeometry(r * 0.18 * sc, 14, 10).scale(1, 1.25, 1).translate(ox, 5 + h * 0.5 + r * 0.14 * sc, -r * 0.45), 0xfaf8f2);
      }
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(2.2, 3.2, h, 10).translate(sx * r * 0.58, h / 2, -r * 0.45), 0xc85842);
        add(new THREE.SphereGeometry(2.8, 8, 8).translate(sx * r * 0.58, h + 1.5, -r * 0.45), 0xfaf8f2);
      }
    } else if (lm.kind === "redfort") {
      // Red Fort (Lal Qila): long crimson-red sandstone ramparts + octagonal bastions + marble chhatris!
      add(new THREE.BoxGeometry(r * 0.36, h * 0.72, r * 2.1).translate(0, h * 0.36, 0), 0xa8382a);
      add(new THREE.BoxGeometry(r * 0.48, h * 0.92, r * 0.55).translate(r * 0.08, h * 0.46, 0), 0xb64232);
      for (const sz of [-1, 1]) {
        add(new THREE.CylinderGeometry(r * 0.16, r * 0.18, h * 0.88, 10).translate(r * 0.14, h * 0.44, sz * r * 0.34), 0xb64232);
        add(new THREE.SphereGeometry(r * 0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(r * 0.14, h * 0.9, sz * r * 0.34), 0xfaf8f2);
      }
    } else if (lm.kind === "tomb") {
      // Humayun's Tomb: red-sandstone charbagh mausoleum + gleaming white-marble Persian double dome!
      add(new THREE.BoxGeometry(r * 1.6, 6, r * 1.6).translate(0, 3, 0), 0xc46046);
      add(new THREE.BoxGeometry(r * 0.95, h * 0.48, r * 0.95).translate(0, 6 + h * 0.24, 0), 0xc85c42);
      add(new THREE.CylinderGeometry(r * 0.24, r * 0.25, h * 0.18, 14).translate(0, 6 + h * 0.54, 0), 0xd89668);
      add(new THREE.SphereGeometry(r * 0.25, 16, 12).scale(1, 1.15, 1).translate(0, 6 + h * 0.72, 0), 0xfbf9f4);
    } else {
      // Landmark Spire Tower
      add(new THREE.BoxGeometry(r * 1.3, h * 0.55, r * 1.3).translate(0, h * 0.275, 0), lm.color);
      add(new THREE.BoxGeometry(r * 0.95, h * 0.28, r * 0.95).translate(0, h * 0.69, 0), lm.color);
      add(new THREE.CylinderGeometry(0.6, r * 0.22, h * 0.2, 8).translate(0, h * 0.9, 0), 0xf0f4f8);
    }

    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!merged) continue;
    keep(merged);

    const supertall = lm.kind === "burj" || lm.kind === "sail" || lm.kind === "wheel";
    const glassy = lm.kind === "burj" || lm.kind === "spire" || lm.kind === "twist" || lm.kind === "torus";
    const mat = keep(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: glassy ? 0.22 : 0.68,
        metalness: glassy ? 0.48 : 0.08,
        envMap: env,
        envMapIntensity: glassy ? 1.05 : 0.45,
        fog: !supertall, // Let Burj Khalifa, Burj Al Arab & Ain Dubai gleam clearly across the entire Dubai horizon!
      }),
    );
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = uNight;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLmPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLmPos = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uNight;\nvarying vec3 vLmPos;")
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          if (uNight > 0.01) {
            float band = smoothstep(0.50, 0.92, sin(vLmPos.y * 0.45));
            vec3 accent = ${glassy ? "vec3(0.80, 0.90, 1.0)" : "vec3(1.0, 0.78, 0.45)"};
            totalEmissiveRadiance += accent * (0.34 + band * 0.52) * uNight;
          }`,
        );
    };
    mat.customProgramCacheKey = () => `sky-landmark-v4-${lm.kind}`;

    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(lm.x, 0, lm.z);
    if (lm.yaw) mesh.rotation.y = lm.yaw;
    group.add(mesh);

    if (h >= 95) {
      const sp = new THREE.Sprite(beaconMat);
      sp.position.set(lm.x, h + 6, lm.z);
      sp.scale.set(20, 20, 1);
      group.add(sp);
      beacons.push(sp);
    }
  }

  return { group, beacons, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** Fallback distant land skirt outside the streamed tile ring so the horizon is seamless. */
function createBaseGround(city: City, night: boolean) {
  const look = LOOK[city.data.id];
  const [hx, hz] = city.data.half;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  let alphaMap: THREE.CanvasTexture | null = null;
  if (city.sea) {
    const { cols, rows, mask } = city.sea;
    const c = document.createElement("canvas");
    c.width = cols;
    c.height = rows;
    const g = c.getContext("2d")!;
    const img = g.createImageData(cols, rows);
    for (let i = 0; i < mask.length; i++) {
      const land = mask[i] ? 0 : 255;
      img.data[i * 4] = land;
      img.data[i * 4 + 1] = land;
      img.data[i * 4 + 2] = land;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    alphaMap = keep(new THREE.CanvasTexture(c));
    alphaMap.minFilter = THREE.LinearFilter;
    alphaMap.magFilter = THREE.LinearFilter;
  }

  const baseMat = keep(
    new THREE.MeshStandardMaterial({
      color: night ? look.groundNight : look.groundDay,
      alphaMap,
      alphaTest: alphaMap ? 0.5 : 0,
      roughness: 0.98,
      metalness: 0,
    }),
  );
  const basePlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(hx * 2, hz * 2)), baseMat);
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = 0.2;

  const surroundMat = keep(
    new THREE.MeshStandardMaterial({
      color: night ? look.groundNight : look.groundDay,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  const far = 16000;
  const step = 500;
  const quads: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number) =>
    quads.push(x0, 0.15, z0, x1, 0.15, z0, x1, 0.15, z1, x0, 0.15, z0, x1, 0.15, z1, x0, 0.15, z1);
  for (let x = -hx; x < hx; x += step) {
    const x1 = Math.min(hx, x + step);
    if (!city.isWater((x + x1) / 2, -hz + 60)) quad(x, -hz - far, x1, -hz);
    if (!city.isWater((x + x1) / 2, hz - 60)) quad(x, hz, x1, hz + far);
  }
  for (let z = -hz; z < hz; z += step) {
    const z1 = Math.min(hz, z + step);
    if (!city.isWater(-hx + 60, (z + z1) / 2)) quad(-hx - far, z, -hx, z1);
    if (!city.isWater(hx - 60, (z + z1) / 2)) quad(hx, z, hx + far, z1);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (!city.isWater(sx * (hx - 60), sz * (hz - 60))) {
      quad(
        Math.min(sx * hx, sx * (hx + far)),
        Math.min(sz * hz, sz * (hz + far)),
        Math.max(sx * hx, sx * (hx + far)),
        Math.max(sz * hz, sz * (hz + far)),
      );
    }
  }
  const group = new THREE.Group();
  group.add(basePlane);
  if (quads.length) {
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(quads, 3));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, surroundMat));
  }

  return {
    group,
    setNight(isNight: boolean) {
      baseMat.color.setHex(isNight ? look.groundNight : look.groundDay);
      surroundMat.color.setHex(isNight ? look.groundNight : look.groundDay);
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** Shared low-poly trees: palms in Dubai, flowering Gulmohar/Jacaranda + rain-trees in Bengaluru, lush avenues in Delhi. */
function createTreePrototypes(cityId: CityId) {
  const palm = cityId === "dubai";
  let crown: THREE.BufferGeometry;
  let trunk: THREE.BufferGeometry;
  if (palm) {
    trunk = new THREE.CylinderGeometry(0.25, 0.38, 8.5, 5).translate(0, 4.25, 0);
    const fronds = Array.from({ length: 6 }, (_, i) =>
      new THREE.ConeGeometry(0.65, 4.2, 3)
        .rotateZ(Math.PI / 2.4)
        .rotateY((i / 6) * Math.PI * 2)
        .translate(0, 8.5, 0),
    );
    crown = mergeGeometries(fronds.map((f) => f.toNonIndexed()))!;
    fronds.forEach((f) => f.dispose());
  } else {
    trunk = new THREE.CylinderGeometry(0.3, 0.45, 3.8, 5).translate(0, 1.9, 0);
    const blobs = [
      new THREE.IcosahedronGeometry(3.6, 0).translate(0, 6.0, 0),
      new THREE.IcosahedronGeometry(2.6, 0).translate(1.7, 5.0, 0.6),
      new THREE.IcosahedronGeometry(2.4, 0).translate(-1.5, 5.2, -0.7),
    ];
    crown = mergeGeometries(blobs)!;
    blobs.forEach((b) => b.dispose());
  }
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: palm ? 0x8a6f4e : 0x5a4636, roughness: 1 });

  // Bengaluru features signature Gulmohar (fiery orange-crimson) & Jacaranda (violet) blossoms!
  const palette = palm
    ? [0x587a36, 0x65883e, 0x4e6e2e, 0x60823a, 0x537331, 0x6a8d42, 0x587a36, 0x62853c]
    : cityId === "bengaluru"
      ? [0x2d6928, 0x3b7a31, 0x488435, 0x265c23, 0x558d3c, 0x34722c, 0xd94826, 0x8856e6]
      : [0x356b2a, 0x447a32, 0x518236, 0x2d5c24, 0x5e8a3b, 0x3d722e, 0x4b7d34, 0xd49b28];

  return {
    crown,
    trunk,
    crownMat,
    trunkMat,
    palette,
    setNight(isNight: boolean) {
      crownMat.color.setHex(isNight ? 0x525c6e : 0xffffff);
      trunkMat.color.setHex(isNight ? 0x282424 : palm ? 0x8a6f4e : 0x5a4636);
    },
    dispose() {
      crown.dispose();
      trunk.dispose();
      crownMat.dispose();
      trunkMat.dispose();
    },
  };
}

/** Instanced luxury yachts in Dubai's Marina & Gulf waters (65 yachts in 1 single draw call!). */
function createDubaiYachts(city: City, env: THREE.Texture | null) {
  const hull = mergeGeometries([
    new THREE.BoxGeometry(5.5, 2.2, 20).translate(0, 1.1, 0).toNonIndexed(),
    new THREE.BoxGeometry(4.2, 2.4, 8.5).translate(0, 3.2, -1.5).toNonIndexed(),
  ])!;
  const mat = new THREE.MeshStandardMaterial({ color: 0xfafaf6, roughness: 0.3, metalness: 0.15, envMap: env });
  const spots: [number, number, number, number][] = [];
  const rand = seeded(77);
  const [hx, hz] = city.data.half;
  for (let i = 0; i < 6000 && spots.length < 65; i++) {
    // Cluster 60% near JBR / Marina / Palm coast, 40% across Gulf
    const nearMarina = i < 3600;
    const x = nearMarina ? -hx + rand() * 4500 : (rand() - 0.5) * hx * 1.8;
    const z = nearMarina ? hz - rand() * 5500 : (rand() - 0.5) * hz * 1.8;
    if (!city.isWater(x, z) || !city.isWater(x + 18, z) || !city.isWater(x - 18, z) || !city.isWater(x, z + 18)) continue;
    spots.push([x, z, 0.8 + rand() * 0.7, rand() * Math.PI * 2]);
  }
  const inst = new THREE.InstancedMesh(hull, mat, Math.max(1, spots.length));
  inst.count = spots.length;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, sc, yaw], idx) => {
    p.set(x, 0.1, z);
    q.setFromAxisAngle(up, yaw);
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    inst.setMatrixAt(idx, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  return {
    mesh: inst,
    dispose() {
      hull.dispose();
      mat.dispose();
      inst.dispose();
    },
  };
}

/** Single-draw-call cumulus clouds capping thermals (replaces 80 individual Sprites with 1 Points!). */
function createThermalClouds(city: City, night: boolean) {
  const pts: number[] = [];
  const rand = seeded(city.data.id.length * 101);
  for (const t of city.thermals) {
    const top = Math.min(t.top + 50, 1200);
    const core = thermalCore(t, top, city.breeze);
    for (let i = 0; i < 5; i++) {
      pts.push(core.x + (rand() - 0.5) * 190, top + (i < 2 ? 0 : 22 + rand() * 35), core.z + (rand() - 0.5) * 150);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.PointsMaterial({
    map: softCircleTexture(),
    color: night ? 0x3b406b : 0xfbf9f4,
    size: 165,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    opacity: night ? 0.45 : 0.78,
  });
  const points = new THREE.Points(geo, mat);
  return {
    mesh: points,
    setNight(isNight: boolean) {
      mat.color.setHex(isNight ? 0x3b406b : 0xfbf9f4);
      mat.opacity = isNight ? 0.45 : 0.78;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

interface ActiveTile {
  key: string;
  tx: number;
  tz: number;
  lod: TileLod;
  group: THREE.Group;
  disposables: { dispose(): void }[];
  groundMat?: THREE.MeshStandardMaterial;
}

export interface BuiltWorld {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  sunDirection: THREE.Vector3;
  fog: THREE.FogExp2;
  setNight(night: boolean): void;
  setQuality(quality: number): void;
  ensureAround(x: number, z: number): Promise<void>;
  updateStream(x: number, z: number): void;
  update(time: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

const sharedRawCache = new Map<string, ArrayBuffer>();
const sharedRawOrder: string[] = [];
const sharedInFlight = new Map<string, Promise<ArrayBuffer | null>>();
let sharedWorker: Worker | null = null;
const sharedPending = new Map<number, (resp: WorkerResponse) => void>();
const sentSeaCities = new Set<CityId>();
let sharedNextJobId = 1;

function getSharedWorker(): Worker | null {
  if (sharedWorker) return sharedWorker;
  try {
    if (typeof Worker !== "undefined") {
      sharedWorker = new Worker(new URL("./tile-worker.ts", import.meta.url), { type: "module" });
      sharedWorker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const resolve = sharedPending.get(e.data.id);
        if (resolve) {
          sharedPending.delete(e.data.id);
          resolve(e.data);
        }
      };
      sharedWorker.onerror = () => {
        sharedWorker?.terminate();
        sharedWorker = null;
        sentSeaCities.clear();
      };
    }
  } catch {
    sharedWorker = null;
  }
  return sharedWorker;
}

export async function buildWorld(
  city: City,
  facades: THREE.Texture[],
  renderer: THREE.WebGLRenderer,
  base: string,
  initialNight: boolean,
  initialQuality: number,
): Promise<BuiltWorld> {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const id = city.data.id;
  const look = LOOK[id];
  let night = initialNight;
  let quality = initialQuality;
  let disposed = false;

  const uNight = { value: night ? 1 : 0 };

  // ---------- Sky & Environment ----------
  const [dayElev, azimuth] = look.daySun;
  const daySunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - dayElev), THREE.MathUtils.degToRad(azimuth));
  const nightSunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(azimuth));
  const sunDirection = (night ? nightSunDir : daySunDir).clone();

  const daySky = new Sky();
  daySky.scale.setScalar(15000);
  const su = daySky.material.uniforms;
  su.turbidity.value = look.turbidity;
  su.rayleigh.value = look.rayleigh;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  su.sunPosition.value.copy(daySunDir);
  daySky.visible = !night;
  group.add(daySky);
  keep(daySky.geometry);
  keep(daySky.material);

  const dusk = keep(createNightSky(azimuth));
  dusk.group.visible = night;
  group.add(dusk.group);

  let envDay: THREE.Texture | null = null;
  let envNight: THREE.Texture | null = null;
  if (quality > 0) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envSceneDay = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    Object.assign(envSky.material.uniforms, THREE.UniformsUtils.clone(daySky.material.uniforms));
    envSky.material.uniforms.sunPosition.value.copy(daySunDir);
    envSceneDay.add(envSky);
    envDay = keep(pmrem.fromScene(envSceneDay).texture);
    envSky.geometry.dispose();
    envSky.material.dispose();

    const envSceneNight = new THREE.Scene();
    const envDusk = createNightSky(azimuth);
    envDusk.group.scale.setScalar(0.05);
    envSceneNight.add(envDusk.group);
    envNight = keep(pmrem.fromScene(envSceneNight).texture);
    envDusk.dispose();
    pmrem.dispose();
  }

  // ---------- Lights & Fog (baked ground drop-shadows replace expensive shadow maps!) ----------
  const sun = new THREE.DirectionalLight(0xffe8c2, 3.6);
  sun.position.copy(sunDirection).multiplyScalar(900);
  sun.castShadow = false;
  group.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xd4e6ff, 0x948062, 1.75);
  group.add(hemi);

  const fog = new THREE.FogExp2(look.fogDay, look.fogDensityDay);

  // ---------- Shared Materials ----------
  const activeEnv = night ? envNight : envDay;
  const wallMats = createWallMaterials(facades, activeEnv, uNight).map((m) => keep(m));
  const midMat = keep(createMidMaterial(activeEnv, uNight));
  const roofMat = keep(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.05,
      envMap: activeEnv,
      envMapIntensity: 0.35,
    }),
  );
  const railMat = keep(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.3,
    }),
  );
  const waterNormal = waterNormals();
  const waterMat = keep(
    new THREE.MeshStandardMaterial({
      color: night ? look.waterNight : look.waterDay,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.12,
      metalness: 0.28,
      envMap: activeEnv,
      envMapIntensity: 1.25,
    }),
  );

  // Shared 1 km x 1 km ground tile plane geometry (rotated horizontal once)
  const tileSize = city.index.tileSize || TILE_SIZE;
  const sharedTilePlane = keep(new THREE.PlaneGeometry(tileSize + 1.5, tileSize + 1.5));
  sharedTilePlane.rotateX(-Math.PI / 2);

  // Water plane underneath everything
  const seaPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(38000, 38000)), waterMat);
  seaPlane.rotation.x = -Math.PI / 2;
  seaPlane.position.y = 0.0;
  group.add(seaPlane);

  const baseGround = keep(createBaseGround(city, night));
  group.add(baseGround.group);

  const treeProto = keep(createTreePrototypes(id));
  treeProto.setNight(night);

  const landmarks = keep(buildLandmarks(city.landmarks, activeEnv, uNight));
  group.add(landmarks.group);

  if (id === "dubai" && quality > 0) {
    const yachts = keep(createDubaiYachts(city, activeEnv));
    group.add(yachts.mesh);
  }

  const clouds = keep(createThermalClouds(city, night));
  group.add(clouds.mesh);

  const activeTiles = new Map<string, ActiveTile>();

  function applyTheme(isNight: boolean) {
    night = isNight;
    uNight.value = isNight ? 1 : 0;
    daySky.visible = !isNight;
    dusk.group.visible = isNight;
    sunDirection.copy(isNight ? nightSunDir : daySunDir);

    sun.color.setHex(isNight ? 0xffa07a : 0xffe8c2);
    sun.intensity = isNight ? 0.85 : 3.6;
    hemi.color.setHex(isNight ? 0x7084c8 : 0xd4e6ff);
    hemi.groundColor.setHex(isNight ? 0x262436 : 0x948062);
    hemi.intensity = isNight ? 1.5 : 1.75;

    fog.color.setHex(isNight ? look.fogNight : look.fogDay);
    fog.density = isNight ? look.fogDensityNight : look.fogDensityDay;

    const env = isNight ? envNight : envDay;
    for (const wm of wallMats) {
      wm.envMap = env;
      wm.envMapIntensity = isNight ? 1.2 : 0.85;
    }
    midMat.envMap = roofMat.envMap = waterMat.envMap = env;
    waterMat.color.setHex(isNight ? look.waterNight : look.waterDay);
    roofMat.color.setHex(isNight ? 0x5c6278 : 0xffffff);

    for (const t of activeTiles.values()) {
      if (t.groundMat) {
        t.groundMat.color.setHex(isNight ? 0x52586c : 0xffffff);
        t.groundMat.emissiveIntensity = isNight ? 1.65 : 0;
      }
    }

    baseGround.setNight(isNight);
    treeProto.setNight(isNight);
    clouds.setNight(isNight);
    renderer.toneMappingExposure = isNight ? 0.96 : 0.86;
  }
  applyTheme(night);

  // ---------- Web Worker + Tile Streamer ----------
  const tileGroup = new THREE.Group();
  group.add(tileGroup);

  // Send sea mask once to worker so OffscreenCanvas cuts out coastal canals cleanly
  const workerInstance = getSharedWorker();
  if (workerInstance && !sentSeaCities.has(id)) {
    sentSeaCities.add(id);
    const seaMsg: WorkerMessageIn = {
      kind: "sea",
      cityId: id,
      sea: city.sea
        ? { half: city.data.half, cell: city.sea.cell, cols: city.sea.cols, rows: city.sea.rows, mask: city.sea.mask }
        : null,
    };
    workerInstance.postMessage(seaMsg);
  }

  function buildInWorker(buffer: ArrayBuffer, lod: TileLod, needCollision: boolean): Promise<WorkerResponse> {
    const worker = getSharedWorker();
    if (worker) {
      return new Promise((resolve) => {
        const reqId = sharedNextJobId++;
        sharedPending.set(reqId, resolve);
        const copy = buffer.slice(0);
        const msg: WorkerMessageIn = { kind: "build", id: reqId, cityId: id, lod, quality, tileSize, needCollision, buffer: copy };
        worker.postMessage(msg, [copy]);
      });
    }
    const decoded = decodeTile(buffer, tileSize);
    const data = buildTileGeometry(
      decoded,
      id,
      lod,
      tileSize,
      city.sea ? { half: city.data.half, cell: city.sea.cell, cols: city.sea.cols, rows: city.sea.rows, mask: city.sea.mask } : null,
      quality,
    );
    return Promise.resolve({ id: 0, data, collision: needCollision ? decoded : undefined });
  }

  const buildingTile = new Map<string, TileLod>();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  async function fetchTileRaw(tx: number, tz: number): Promise<ArrayBuffer | null> {
    const key = `${tx},${tz}`;
    if (!city.tileSet.has(key)) return null;
    const cacheKey = `${id}:${key}`;
    const cached = sharedRawCache.get(cacheKey);
    if (cached) return cached;
    let p = sharedInFlight.get(cacheKey);
    if (!p) {
      p = fetch(`${base}assets/sky/${id}/t_${tx}_${tz}.bin`)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .catch(() => null);
      sharedInFlight.set(cacheKey, p);
    }
    const buf = await p;
    sharedInFlight.delete(cacheKey);
    if (buf && !disposed) {
      sharedRawCache.set(cacheKey, buf);
      sharedRawOrder.push(cacheKey);
      while (sharedRawOrder.length > 96) {
        const oldest = sharedRawOrder.shift()!;
        sharedRawCache.delete(oldest);
      }
    }
    return buf;
  }

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpAxis = new THREE.Vector3(0, 1, 0);
  const tmpColor = new THREE.Color();

  function assembleTileGroup(data: BuiltTileData): ActiveTile {
    const g = new THREE.Group();
    const tileDisposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(d: T) => (tileDisposables.push(d), d);
    let groundMat: THREE.MeshStandardMaterial | undefined;

    if (data.groundBitmap) {
      const gTex = track(new THREE.CanvasTexture(data.groundBitmap));
      gTex.colorSpace = THREE.SRGBColorSpace;
      gTex.anisotropy = maxAniso;
      gTex.wrapS = gTex.wrapT = THREE.ClampToEdgeWrapping;
      let nTex: THREE.CanvasTexture | null = null;
      if (data.nightBitmap) {
        nTex = track(new THREE.CanvasTexture(data.nightBitmap));
        nTex.colorSpace = THREE.SRGBColorSpace;
        nTex.wrapS = nTex.wrapT = THREE.ClampToEdgeWrapping;
      }
      groundMat = track(
        new THREE.MeshStandardMaterial({
          map: gTex,
          alphaTest: 0.5,
          roughness: 0.95,
          metalness: 0,
          color: night ? 0x52586c : 0xffffff,
          emissive: 0xffffff,
          emissiveMap: nTex,
          emissiveIntensity: night ? 1.65 : 0,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      const quad = new THREE.Mesh(sharedTilePlane, groundMat);
      quad.position.set((data.tx + 0.5) * tileSize, 0.45, (data.tz + 0.5) * tileSize);
      g.add(quad);
    }

    if (data.wallsByStyle) {
      data.wallsByStyle.forEach((w, styleIdx) => {
        if (!w) return;
        const geo = track(new THREE.BufferGeometry());
        geo.setAttribute("position", new THREE.BufferAttribute(w.pos, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(w.nrm, 3));
        geo.setAttribute("uv", new THREE.BufferAttribute(w.uv, 2));
        geo.setAttribute("color", new THREE.BufferAttribute(w.color, 3));
        g.add(new THREE.Mesh(geo, wallMats[styleIdx]));
      });
    }
    if (data.roofs) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.roofs.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(data.roofs.nrm, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.roofs.color, 3));
      g.add(new THREE.Mesh(geo, roofMat));
    }
    if (data.midBuildings) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.midBuildings.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(data.midBuildings.nrm, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.midBuildings.color, 3));
      g.add(new THREE.Mesh(geo, midMat));
    }
    if (data.rails) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.rails.pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.rails.color, 3));
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, railMat));
    }
    if (data.trees && data.trees.length >= 5 && quality > 0) {
      const count = data.trees.length / 5;
      const crowns = track(new THREE.InstancedMesh(treeProto.crown, treeProto.crownMat, count));
      const trunks = track(new THREE.InstancedMesh(treeProto.trunk, treeProto.trunkMat, count));
      for (let i = 0; i < count; i++) {
        const x = data.trees[i * 5];
        const z = data.trees[i * 5 + 1];
        const s = data.trees[i * 5 + 2];
        const yaw = data.trees[i * 5 + 3];
        const cIdx = data.trees[i * 5 + 4] | 0;
        tmpPos.set(x, 0.45, z);
        tmpQuat.setFromAxisAngle(tmpAxis, yaw);
        tmpScale.set(s, s * 1.05, s);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        crowns.setMatrixAt(i, tmpMat);
        trunks.setMatrixAt(i, tmpMat);
        crowns.setColorAt(i, tmpColor.setHex(treeProto.palette[cIdx % treeProto.palette.length]));
      }
      crowns.instanceMatrix.needsUpdate = true;
      trunks.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      g.add(crowns, trunks);
    }

    return { key: `${data.tx},${data.tz}`, tx: data.tx, tz: data.tz, lod: data.lod, group: g, disposables: tileDisposables, groundMat };
  }

  function disposeTile(tile: ActiveTile) {
    tileGroup.remove(tile.group);
    tile.disposables.forEach((d) => d.dispose());
  }

  async function loadTileAtLod(tx: number, tz: number, lod: TileLod) {
    const key = `${tx},${tz}`;
    const existing = activeTiles.get(key);
    if (existing && existing.lod === lod) return;
    if (buildingTile.get(key) === lod) return;
    buildingTile.set(key, lod);

    const buf = await fetchTileRaw(tx, tz);
    if (!buf || disposed) {
      buildingTile.delete(key);
      return;
    }
    const needCollision = !city.hasTile(tx, tz);
    const resp = await buildInWorker(buf, lod, needCollision);
    buildingTile.delete(key);
    if (disposed) {
      resp.data.groundBitmap?.close();
      resp.data.nightBitmap?.close();
      return;
    }
    if (resp.collision && !city.hasTile(tx, tz)) {
      city.addTile(resp.collision);
    }

    const prev = activeTiles.get(key);
    if (prev) disposeTile(prev);
    const next = assembleTileGroup(resp.data);
    activeTiles.set(key, next);
    tileGroup.add(next.group);
  }

  let lastStreamX = Infinity;
  let lastStreamZ = Infinity;

  function desiredTiles(x: number, z: number) {
    const cx = Math.floor(x / tileSize);
    const cz = Math.floor(z / tileSize);
    const maxR = quality === 0 ? 1 : 3;
    const wanted: { tx: number; tz: number; dist: number; lod: TileLod }[] = [];
    for (let dx = -maxR; dx <= maxR; dx++) {
      for (let dz = -maxR; dz <= maxR; dz++) {
        const dist = Math.hypot(dx, dz);
        if (dist > maxR + 0.35) continue;
        const tx = cx + dx;
        const tz = cz + dz;
        if (!city.tileSet.has(`${tx},${tz}`)) continue;
        // Keep full LOD 0 in the 9-tile core (~1.5 km), crisp LOD 1 out to 2.5 km, LOD 2 silhouettes to 3.4 km -> <55 draw calls total!
        const lod: TileLod =
          quality === 0
            ? (dist <= 0.5 ? 1 : 2)
            : dist <= 1.5
              ? 0
              : dist <= 2.4
                ? 1
                : 2;
        wanted.push({ tx, tz, dist, lod });
      }
    }
    wanted.sort((a, b) => a.dist - b.dist);
    return wanted;
  }

  function updateStream(x: number, z: number) {
    if (disposed) return;
    if (Math.hypot(x - lastStreamX, z - lastStreamZ) < 180) return;
    lastStreamX = x;
    lastStreamZ = z;

    const wanted = desiredTiles(x, z);
    const keepKeys = new Set<string>(wanted.map((w) => `${w.tx},${w.tz}`));

    const cx = Math.floor(x / tileSize);
    const cz = Math.floor(z / tileSize);
    const unloadR = (quality === 0 ? 1 : 3) + 1.8;
    for (const [key, tile] of activeTiles) {
      if (!keepKeys.has(key) && Math.hypot(tile.tx - cx, tile.tz - cz) > unloadR) {
        disposeTile(tile);
        activeTiles.delete(key);
        city.removeTile(tile.tx, tile.tz);
      }
    }

    let queued = 0;
    for (const w of wanted) {
      const key = `${w.tx},${w.tz}`;
      const cur = activeTiles.get(key);
      if (cur && cur.lod === w.lod) continue;
      if (buildingTile.get(key) === w.lod) continue;
      void loadTileAtLod(w.tx, w.tz, w.lod);
      if (++queued >= 4) break;
    }
  }

  async function ensureAround(x: number, z: number) {
    lastStreamX = x;
    lastStreamZ = z;
    const wanted = desiredTiles(x, z);
    // Await near + mid ring (dist <= 2.4) so the entire visible vista is solid on frame 1!
    const core = wanted.filter((w) => w.dist <= 2.4);
    await Promise.all(core.map((w) => loadTileAtLod(w.tx, w.tz, w.lod)));
    for (const w of wanted) {
      if (w.dist > 2.4) void loadTileAtLod(w.tx, w.tz, w.lod);
    }
  }

  return {
    group,
    sun,
    sunDirection,
    fog,
    setNight(isNight: boolean) {
      if (isNight !== night) applyTheme(isNight);
    },
    setQuality(nextQ: number) {
      const prevSoftware = quality === 0;
      quality = nextQ;
      if (prevSoftware !== (quality === 0)) lastStreamX = Infinity;
    },
    ensureAround,
    updateStream,
    update(time: number) {
      waterNormal.offset.set(time * 0.018, time * 0.011);
      const pulse = 0.45 + 0.55 * Math.sin(time * 3.4);
      for (const b of landmarks.beacons) {
        b.visible = night;
        if (night) {
          const s = 15 + pulse * 10;
          b.scale.set(s, s, 1);
        }
      }
    },
    render(scene, camera) {
      daySky.position.copy(camera.position);
      dusk.group.position.copy(camera.position);
      renderer.render(scene, camera);
    },
    setSize() {
      /* direct rendering */
    },
    dispose() {
      disposed = true;
      for (const tile of activeTiles.values()) disposeTile(tile);
      activeTiles.clear();
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function paperPlane() {
  const v = [
    [0, 0.02, -1.65],
    [-1.25, 0.14, 0.95],
    [1.25, 0.14, 0.95],
    [0, 0.0, 0.95],
    [0, -0.36, 0.95],
  ];
  const faces = [
    [0, 1, 3],
    [0, 3, 2],
    [0, 3, 4],
    [0, 4, 3],
  ];
  const positions: number[] = [];
  faces.forEach((f) => f.forEach((i) => positions.push(...v[i])));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xfffaf0,
      side: THREE.DoubleSide,
      roughness: 0.55,
      emissive: 0x7c7060,
      emissiveIntensity: 0.35,
    }),
  );
  const fold = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.035, -1.6), new THREE.Vector3(0, 0.035, 0.95)]),
    new THREE.LineBasicMaterial({ color: 0xff4d1c }),
  );
  const plane = new THREE.Group();
  plane.add(mesh, fold);
  plane.children.forEach((c) => c.scale.setScalar(1.5));
  return plane;
}

export function createContrails(length = 72) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const ribbons = [0, 1].map(() => {
    const pos = new Float32Array(length * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    return { geo, pos };
  });

  const tip = new THREE.Vector3();
  const right = new THREE.Vector3();
  let count = 0;

  return {
    group,
    reset() {
      count = 0;
    },
    update(plane: THREE.Object3D, boosting: boolean) {
      right.set(1, 0, 0).applyQuaternion(plane.quaternion);
      mat.opacity = boosting ? 0.62 : 0.34;
      const halfW = boosting ? 0.22 : 0.11;
      for (let s = 0; s < 2; s++) {
        const arr = ribbons[s].pos;
        arr.copyWithin(6, 0, (length - 1) * 6);
        tip.set(s ? 1.85 : -1.85, 0.18, 1.42).applyQuaternion(plane.quaternion).add(plane.position);
        arr[0] = tip.x - right.x * halfW;
        arr[1] = tip.y - right.y * halfW;
        arr[2] = tip.z - right.z * halfW;
        arr[3] = tip.x + right.x * halfW;
        arr[4] = tip.y + right.y * halfW;
        arr[5] = tip.z + right.z * halfW;
        if (count < length) {
          for (let i = Math.max(1, count); i < length; i++) {
            arr[i * 6] = tip.x; arr[i * 6 + 1] = tip.y; arr[i * 6 + 2] = tip.z;
            arr[i * 6 + 3] = tip.x; arr[i * 6 + 4] = tip.y; arr[i * 6 + 5] = tip.z;
          }
        }
        for (let i = Math.floor(length * 0.6); i < length; i++) {
          const t = 1 - (i - length * 0.6) / (length * 0.4);
          const mx = (arr[i * 6] + arr[i * 6 + 3]) * 0.5;
          const my = (arr[i * 6 + 1] + arr[i * 6 + 4]) * 0.5;
          const mz = (arr[i * 6 + 2] + arr[i * 6 + 5]) * 0.5;
          arr[i * 6] = mx + (arr[i * 6] - mx) * t;
          arr[i * 6 + 1] = my + (arr[i * 6 + 1] - my) * t;
          arr[i * 6 + 2] = mz + (arr[i * 6 + 2] - mz) * t;
          arr[i * 6 + 3] = mx + (arr[i * 6 + 3] - mx) * t;
          arr[i * 6 + 4] = my + (arr[i * 6 + 4] - my) * t;
          arr[i * 6 + 5] = mz + (arr[i * 6 + 5] - mz) * t;
        }
        (ribbons[s].geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
      count = Math.min(length, count + 1);
    },
    dispose() {
      ribbons.forEach((r) => r.geo.dispose());
      mat.dispose();
    },
  };
}
