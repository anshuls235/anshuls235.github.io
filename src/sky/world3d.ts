// Renders streamed real cities from OpenStreetMap tiles (SKY1) with 3-level LOD,
// a 2x2 facade texture atlas, base AO, dynamic day/night lighting & emissive windows,
// animated normal-mapped water, instanced trees, procedural landmarks, and ribbon contrails.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { thermalCore } from "./glider";
import type { City, CityId, CityLandmark } from "./citydata";
import { decodeTile, TILE_SIZE } from "./tileformat";
import { buildTileGeometry, type BuiltTileData, type TileLod } from "./tile-geom";
import type { WorkerRequest, WorkerResponse } from "./tile-worker";

const FACADE_FILES = [
  "glass-tower",
  "residential-tower",
  "office-glass",
  "indian-midrise",
] as const;

/** Per-city visual palette: sun angle, ground tone, fog tint & density. */
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
    daySun: [14, 280],
    groundDay: 0xdccaa4,
    groundNight: 0x1e2030,
    fogDay: 0xdcdad2,
    fogNight: 0x171d3a,
    fogDensityDay: 0.00042,
    fogDensityNight: 0.00045,
    waterDay: 0x0f5d6b,
    waterNight: 0x09162e,
    turbidity: 3.4,
    rayleigh: 1.15,
  },
  bengaluru: {
    daySun: [20, 250],
    groundDay: 0xb6ac92,
    groundNight: 0x1b202e,
    fogDay: 0xcbd8e0,
    fogNight: 0x151b35,
    fogDensityDay: 0.00045,
    fogDensityNight: 0.00046,
    waterDay: 0x1d4f49,
    waterNight: 0x0a1826,
    turbidity: 2.6,
    rayleigh: 1.1,
  },
  delhi: {
    daySun: [16, 235],
    groundDay: 0xc4b596,
    groundNight: 0x201d2e,
    fogDay: 0xdad5c8,
    fogNight: 0x1a1e38,
    fogDensityDay: 0.00046,
    fogDensityNight: 0.00046,
    waterDay: 0x264c46,
    waterNight: 0x0b1626,
    turbidity: 5.5,
    rayleigh: 1.45,
  },
};

function seeded(seed: number) {
  let s = (Math.abs(seed) % 2147483646) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Loads the 4 facade webp images once and packs them into a single 1024x1024 2x2 atlas. */
let atlasPromise: Promise<THREE.CanvasTexture> | null = null;
export function loadFacades(base: string, anisotropy: number): Promise<THREE.CanvasTexture> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = (async () => {
    const imgs = await Promise.all(
      FACADE_FILES.map(
        (name) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load facade ${name}`));
            img.src = `${base}assets/sky/${name}.webp`;
          }),
      ),
    );
    const size = 1024;
    const half = size / 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // 0: (0,0) top-left in WebGL UV (note: flipY=true by default so canvas bottom is v=0!)
    // Draw with flipY=false so (0,0) is top-left consistently with ATLAS_OFFSET!
    ctx.drawImage(imgs[0], 0, 0, half, half); // (0, 0)
    ctx.drawImage(imgs[1], half, 0, half, half); // (0.5, 0)
    ctx.drawImage(imgs[2], 0, half, half, half); // (0, 0.5)
    ctx.drawImage(imgs[3], half, half, half, half); // (0.5, 0.5)

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(8, anisotropy);
    tex.needsUpdate = true;
    return tex;
  })();
  atlasPromise.catch(() => {
    atlasPromise = null;
  });
  return atlasPromise;
}

/** Tileable procedural water normal map (cheap animated ripples, generated once). */
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
      img.data[i] = 128 + dx * 70;
      img.data[i + 1] = 128 + dy * 70;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 90);
  rippleTex = t;
  return t;
}

/** Shared wall material using the 2x2 facade atlas, vertex color/AO, and dynamic uNight emissive windows. */
function createWallMaterial(atlas: THREE.Texture, env: THREE.Texture | null, uNight: { value: number }) {
  const mat = new THREE.MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.16,
    envMap: env,
    envMapIntensity: 0.75,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uNight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aAtlas;\nvarying vec2 vAtlas;\nvarying vec2 vTileUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvAtlas = aAtlas;\nvTileUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nvarying vec2 vAtlas;\nvarying vec2 vTileUv;")
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec2 localUv = fract(vTileUv);
          vec2 atlasUv = localUv * 0.492 + vAtlas + 0.004;
          vec4 sampledDiffuseColor = texture2D(map, atlasUv);
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (uNight > 0.01) {
          vec2 localUvE = fract(vTileUv);
          vec2 atlasUvE = localUvE * 0.492 + vAtlas + 0.004;
          vec3 texel = texture2D(map, atlasUvE).rgb;
          float lum = dot(texel, vec3(0.299, 0.587, 0.114));
          // Glass panes are darker in the facade photo
          float glass = smoothstep(0.58, 0.20, lum);
          vec2 grid = vTileUv * vec2(2.5, 2.0);
          vec2 cell = floor(grid);
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float on = step(h, 0.42) * glass;
          float farFade = smoothstep(0.25, 0.85, length(fwidth(grid)));
          on = mix(on, 0.24, farFade);
          vec3 warm = mix(vec3(1.0, 0.68, 0.34), vec3(0.88, 0.94, 1.0), step(0.80, fract(h * 11.3)));
          totalEmissiveRadiance += warm * on * (0.95 + fract(h * 7.1) * 0.55) * uNight;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "sky-atlas-walls-v2";
  return mat;
}

/** Shared mid/far LOD building material with subtle night window glow. */
function createMidMaterial(env: THREE.Texture | null, uNight: { value: number }) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.12,
    envMap: env,
    envMapIntensity: 0.5,
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
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (uNight > 0.01 && abs(vWorldNrm.y) < 0.5) {
          float flr = floor(vWorldPos.y * 0.28);
          float bay = floor((vWorldPos.x + vWorldPos.z) * 0.14);
          float h = fract(sin(dot(vec2(bay, flr), vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(h, 0.36) * smoothstep(2.0, 12.0, vWorldPos.y);
          vec3 glow = mix(vec3(1.0, 0.68, 0.34), vec3(0.95, 0.88, 0.72), fract(h * 9.0));
          totalEmissiveRadiance += glow * lit * 0.68 * uNight;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "sky-mid-buildings-v2";
  return mat;
}

/** Blue hour night sky dome with western afterglow and stars. */
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
        vec3 zenith = vec3(0.025, 0.04, 0.12);
        vec3 mid = vec3(0.08, 0.11, 0.28);
        vec3 horizon = vec3(0.24, 0.22, 0.42);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, zenith, smoothstep(0.15, 0.7, h));
        float toward = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), glow));
        float band = exp(-max(h, 0.0) * 8.5);
        c += vec3(0.88, 0.40, 0.22) * pow(toward, 3.0) * band * 0.85 + vec3(0.48, 0.28, 0.34) * band * 0.22;
        if (vDir.y < 0.0) c = mix(c, vec3(0.04, 0.05, 0.09), smoothstep(0.0, 0.05, -vDir.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(22000, 40, 20), material);
  const stars = new THREE.BufferGeometry();
  const pts: number[] = [];
  const rand = seeded(3);
  for (let i = 0; i < 1200; i++) {
    const y = 0.14 + rand() * 0.86;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 19000, y * 19000, Math.sin(a) * r * 19000);
  }
  stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const starField = new THREE.Points(
    stars,
    new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }),
  );
  const group = new THREE.Group();
  group.add(dome, starField);
  return {
    group,
    dispose: () => [dome.geometry, material, stars, starField.material as THREE.Material].forEach((d) => d.dispose()),
  };
}

/** Soft glowing sprite texture for clouds & landmark aviation beacons. */
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

/** Procedural hero landmarks (Burj Khalifa, Burj Al Arab, India Gate, Vidhana Soudha, etc.). */
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
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );

  for (const lm of landmarks) {
    const parts: THREE.BufferGeometry[] = [];
    const h = lm.height;
    const r = lm.radius;

    if (lm.kind === "burj") {
      // Iconic Y-shaped stepped setbacks + central core + needle spire
      const tiers = 9;
      for (let t = 0; t < tiers; t++) {
        const frac = t / tiers;
        const th = (h * 0.78) / tiers;
        const y = frac * h * 0.78;
        const cr = r * 0.28 * (1 - frac * 0.78);
        parts.push(new THREE.CylinderGeometry(cr * 0.92, cr, th, 9).translate(0, y + th / 2, 0));
        // 3 wings spiralling in height
        for (let w = 0; w < 3; w++) {
          const wingMax = 1 - ((w * 0.14 + t * 0.08) % 0.85);
          if (frac > wingMax) continue;
          const a = (w * Math.PI * 2) / 3 + 0.3;
          const wl = r * (0.9 - frac * 0.75);
          const ww = Math.max(4, cr * 0.85);
          const wing = new THREE.BoxGeometry(ww, th, wl);
          wing.translate(0, y + th / 2, wl * 0.45);
          wing.rotateY(a);
          parts.push(wing);
        }
      }
      // Spire
      parts.push(new THREE.CylinderGeometry(0.6, r * 0.08, h * 0.24, 8).translate(0, h * 0.88, 0));
    } else if (lm.kind === "sail") {
      // Burj Al Arab sail silhouette + spine + helipad
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const f = i / segs;
        const sh = (h * 0.85) / segs;
        const belly = Math.sin(f * Math.PI) * r * 0.85 + r * 0.25;
        parts.push(new THREE.BoxGeometry(r * 0.45 * (1 - f * 0.5), sh, belly).translate(0, f * h * 0.85 + sh / 2, belly * 0.15));
      }
      // Spine & mast
      parts.push(new THREE.CylinderGeometry(0.8, 3, h, 8).translate(0, h / 2, -r * 0.2));
      // Helipad disc near top
      parts.push(new THREE.CylinderGeometry(11, 11, 2.5, 16).translate(0, h * 0.66, r * 0.55));
    } else if (lm.kind === "arch") {
      // India Gate triumphal arch
      const w = r * 1.4;
      const d = r * 0.55;
      const legW = w * 0.3;
      const archH = h * 0.62;
      parts.push(new THREE.BoxGeometry(legW, archH, d).translate(-w * 0.35, archH / 2, 0));
      parts.push(new THREE.BoxGeometry(legW, archH, d).translate(w * 0.35, archH / 2, 0));
      parts.push(new THREE.BoxGeometry(w, h * 0.26, d * 1.05).translate(0, archH + h * 0.13, 0));
      parts.push(new THREE.BoxGeometry(w * 0.82, h * 0.12, d * 0.85).translate(0, h * 0.94, 0));
    } else if (lm.kind === "dome") {
      // Grand civic palace (Vidhana Soudha / Rashtrapati Bhavan / Jama Masjid)
      const baseH = h * 0.48;
      parts.push(new THREE.BoxGeometry(r * 1.9, baseH, r * 1.1).translate(0, baseH / 2, 0));
      parts.push(new THREE.CylinderGeometry(r * 0.34, r * 0.36, h * 0.18, 16).translate(0, baseH + h * 0.09, 0));
      parts.push(new THREE.SphereGeometry(r * 0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, baseH + h * 0.18, 0));
      // Corner pavilions
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push(new THREE.CylinderGeometry(r * 0.1, r * 0.11, h * 0.2, 10).translate(sx * r * 0.78, baseH + h * 0.1, sz * r * 0.4));
        }
      }
    } else {
      // Tapered landmark spire tower
      parts.push(new THREE.BoxGeometry(r * 1.3, h * 0.55, r * 1.3).translate(0, h * 0.275, 0));
      parts.push(new THREE.BoxGeometry(r * 0.95, h * 0.28, r * 0.95).translate(0, h * 0.69, 0));
      parts.push(new THREE.CylinderGeometry(0.6, r * 0.22, h * 0.2, 8).translate(0, h * 0.9, 0));
    }

    const nonIndexed = parts.map((p) => {
      const g = p.index ? p.toNonIndexed() : p;
      p.dispose();
      // Ensure consistent attributes for merging
      if (g.attributes.uv) g.deleteAttribute("uv");
      return g;
    });
    const merged = mergeGeometries(nonIndexed, false);
    nonIndexed.forEach((g) => g.dispose());
    if (!merged) continue;
    keep(merged);

    const mat = keep(
      new THREE.MeshStandardMaterial({
        color: lm.color,
        roughness: lm.kind === "burj" || lm.kind === "spire" ? 0.22 : 0.68,
        metalness: lm.kind === "burj" || lm.kind === "spire" ? 0.45 : 0.08,
        envMap: env,
        envMapIntensity: 0.9,
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
            float band = smoothstep(0.55, 0.9, sin(vLmPos.y * 0.45));
            vec3 accent = ${lm.kind === "burj" ? "vec3(0.75, 0.88, 1.0)" : "vec3(1.0, 0.78, 0.48)"};
            totalEmissiveRadiance += accent * (0.28 + band * 0.45) * uNight;
          }`,
        );
    };
    mat.customProgramCacheKey = () => `sky-landmark-${lm.kind}`;

    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(lm.x, 0, lm.z);
    group.add(mesh);

    if (h >= 100) {
      const sp = new THREE.Sprite(beaconMat);
      sp.position.set(lm.x, h + 5, lm.z);
      sp.scale.set(18, 18, 1);
      group.add(sp);
      beacons.push(sp);
    }
  }

  return { group, beacons, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** Creates the base terrain plane (with sea cutout alphaMap for coastal cities like Dubai). */
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

  // Subtle procedural noise grain so open land never looks flat
  const grain = document.createElement("canvas");
  grain.width = grain.height = 256;
  const gg = grain.getContext("2d")!;
  gg.fillStyle = "#ffffff";
  gg.fillRect(0, 0, 256, 256);
  const rand = seeded(19);
  for (let i = 0; i < 1800; i++) {
    const v = rand() < 0.5 ? 235 : 255;
    gg.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const s = 2 + rand() * 8;
    gg.fillRect(rand() * 256, rand() * 256, s, s);
  }
  const grainTex = keep(new THREE.CanvasTexture(grain));
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.repeat.set(60, 60);

  const groundMat = keep(
    new THREE.MeshStandardMaterial({
      color: night ? look.groundNight : look.groundDay,
      map: grainTex,
      alphaMap,
      alphaTest: alphaMap ? 0.5 : 0,
      roughness: 0.96,
      metalness: 0,
    }),
  );
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(hx * 2, hz * 2)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.08;
  ground.receiveShadow = true;

  // Far surround skirt outside the city bounds (only on land sides; sea shows through on water sides)
  const surroundMat = keep(
    new THREE.MeshStandardMaterial({
      color: night ? look.groundNight : look.groundDay,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  const far = 14000;
  const step = 400;
  const quads: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number) =>
    quads.push(x0, 0.04, z0, x1, 0.04, z0, x1, 0.04, z1, x0, 0.04, z0, x1, 0.04, z1, x0, 0.04, z1);
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
  group.add(ground);
  if (quads.length) {
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(quads, 3));
    geo.computeVertexNormals();
    const surround = new THREE.Mesh(geo, surroundMat);
    group.add(surround);
  }

  return {
    group,
    setNight(isNight: boolean) {
      groundMat.color.setHex(isNight ? look.groundNight : look.groundDay);
      surroundMat.color.setHex(isNight ? look.groundNight : look.groundDay);
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** Shared low-poly tree geometries (date palms for Dubai, canopy trees for Bengaluru/Delhi). */
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
      new THREE.IcosahedronGeometry(3.5, 0).translate(0, 6.0, 0),
      new THREE.IcosahedronGeometry(2.5, 0).translate(1.7, 5.0, 0.6),
      new THREE.IcosahedronGeometry(2.3, 0).translate(-1.5, 5.2, -0.7),
    ];
    crown = mergeGeometries(blobs)!;
    blobs.forEach((b) => b.dispose());
  }
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: palm ? 0x8a6f4e : 0x5a4636, roughness: 1 });
  const palette = palm ? [0x5f7d3a, 0x6b8a40, 0x55702f, 0x64823c, 0x526b2d] : [0x3d6a2d, 0x4b7932, 0x567e35, 0x345c29, 0x678839];
  return {
    crown,
    trunk,
    crownMat,
    trunkMat,
    palette,
    setNight(isNight: boolean) {
      crownMat.color.setHex(isNight ? 0x5e6778 : 0xffffff);
      trunkMat.color.setHex(isNight ? 0x2b2626 : palm ? 0x8a6f4e : 0x5a4636);
    },
    dispose() {
      crown.dispose();
      trunk.dispose();
      crownMat.dispose();
      trunkMat.dispose();
    },
  };
}

/** Instanced cumulus clouds capping thermals (1 draw call for all cloud puffs!). */
function createThermalClouds(city: City, night: boolean) {
  const mat = new THREE.SpriteMaterial({
    map: softCircleTexture(),
    color: night ? 0x3b406b : 0xfaf7f2,
    transparent: true,
    depthWrite: false,
    opacity: night ? 0.55 : 0.85,
  });
  const group = new THREE.Group();
  const rand = seeded(city.data.id.length * 101);
  // 5 puffs per thermal (up to 16 thermals -> ~80 tiny sprites, or 3 puffs on low quality)
  for (const t of city.thermals) {
    const top = Math.min(t.top + 50, 1250);
    const core = thermalCore(t, top, city.breeze);
    const puffs = 5;
    for (let i = 0; i < puffs; i++) {
      const s = new THREE.Sprite(mat);
      const size = 90 + rand() * 85;
      s.scale.set(size, size * 0.65, 1);
      s.position.set(core.x + (rand() - 0.5) * 180, top + (i < 2 ? 0 : 22 + rand() * 35), core.z + (rand() - 0.5) * 140);
      group.add(s);
    }
  }
  return {
    group,
    setNight(isNight: boolean) {
      mat.color.setHex(isNight ? 0x3b406b : 0xfaf7f2);
      mat.opacity = isNight ? 0.55 : 0.85;
    },
    dispose() {
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
  geometries: THREE.BufferGeometry[];
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

/** Shared module-level tile byte cache & worker so city switches never re-download tiles. */
const sharedRawCache = new Map<string, ArrayBuffer>();
const sharedRawOrder: string[] = [];
const sharedInFlight = new Map<string, Promise<ArrayBuffer | null>>();
let sharedWorker: Worker | null = null;
const sharedPending = new Map<number, (data: BuiltTileData) => void>();
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
          resolve(e.data.data);
        }
      };
      sharedWorker.onerror = () => {
        sharedWorker?.terminate();
        sharedWorker = null;
      };
    }
  } catch {
    sharedWorker = null;
  }
  return sharedWorker;
}

export async function buildWorld(
  city: City,
  atlas: THREE.Texture,
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
  daySky.scale.setScalar(30000);
  const su = daySky.material.uniforms;
  su.turbidity.value = look.turbidity;
  su.rayleigh.value = look.rayleigh;
  su.mieCoefficient.value = 0.005;
  su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.copy(daySunDir);
  daySky.visible = !night;
  group.add(daySky);
  keep(daySky.geometry);
  keep(daySky.material);

  const dusk = keep(createNightSky(azimuth));
  dusk.group.visible = night;
  group.add(dusk.group);

  // Environment maps (generated once for day & night; skipped on software WebGL to avoid multi-second shader stalls)
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

  // ---------- Lights & Fog ----------
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.8);
  sun.position.copy(sunDirection).multiplyScalar(900);
  sun.castShadow = quality > 1;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 50, far: 2200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  group.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8a7a5e, 1.5);
  group.add(hemi);

  const fog = new THREE.FogExp2(look.fogDay, look.fogDensityDay);

  // ---------- Shared Tile Materials ----------
  const activeEnv = night ? envNight : envDay;
  const wallMat = keep(createWallMaterial(atlas, activeEnv, uNight));
  const midMat = keep(createMidMaterial(activeEnv, uNight));
  const roofMat = keep(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      envMap: activeEnv,
      envMapIntensity: 0.35,
    }),
  );
  const roadMat = keep(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const roadMarkMat = keep(
    new THREE.MeshBasicMaterial({
      color: night ? 0xffb866 : 0xe8e2d0,
    }),
  );
  const railMat = keep(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.3,
    }),
  );
  const parkMat = keep(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
    }),
  );
  const waterNormal = waterNormals();
  const waterMat = keep(
    new THREE.MeshStandardMaterial({
      color: night ? look.waterNight : look.waterDay,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.14,
      metalness: 0.32,
      envMap: activeEnv,
      envMapIntensity: 1.15,
    }),
  );

  // Sea / Water base plane underneath everything
  const seaPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(36000, 36000)), waterMat);
  seaPlane.rotation.x = -Math.PI / 2;
  seaPlane.position.y = 0.0;
  group.add(seaPlane);

  const baseGround = keep(createBaseGround(city, night));
  group.add(baseGround.group);

  const treeProto = keep(createTreePrototypes(id));
  treeProto.setNight(night);

  const landmarks = keep(buildLandmarks(city.landmarks, activeEnv, uNight));
  group.add(landmarks.group);

  const clouds = keep(createThermalClouds(city, night));
  group.add(clouds.group);

  // ---------- Apply Lighting / Theme ----------
  function applyTheme(isNight: boolean) {
    night = isNight;
    uNight.value = isNight ? 1 : 0;
    daySky.visible = !isNight;
    dusk.group.visible = isNight;
    sunDirection.copy(isNight ? nightSunDir : daySunDir);

    sun.color.setHex(isNight ? 0xffa07a : 0xffe8c8);
    sun.intensity = isNight ? 0.85 : 3.8;
    hemi.color.setHex(isNight ? 0x7084c8 : 0xcfe2ff);
    hemi.groundColor.setHex(isNight ? 0x262436 : 0x8a7a5e);
    hemi.intensity = isNight ? 1.45 : 1.55;

    fog.color.setHex(isNight ? look.fogNight : look.fogDay);
    fog.density = isNight ? look.fogDensityNight : look.fogDensityDay;

    const env = isNight ? envNight : envDay;
    wallMat.envMap = midMat.envMap = roofMat.envMap = waterMat.envMap = env;
    wallMat.envMapIntensity = isNight ? 1.15 : 0.72;
    waterMat.color.setHex(isNight ? look.waterNight : look.waterDay);
    roadMarkMat.color.setHex(isNight ? 0xffb866 : 0xe8e2d0);
    parkMat.color.setHex(isNight ? 0x545d6e : 0xffffff);
    roadMat.color.setHex(isNight ? 0x626778 : 0xffffff);
    roofMat.color.setHex(isNight ? 0x5c6175 : 0xffffff);

    baseGround.setNight(isNight);
    treeProto.setNight(isNight);
    clouds.setNight(isNight);
    renderer.toneMappingExposure = isNight ? 0.82 : 0.55;
  }
  applyTheme(night);

  // ---------- Web Worker + Tile Streamer ----------
  const tileGroup = new THREE.Group();
  group.add(tileGroup);

  function buildInWorker(buffer: ArrayBuffer, lod: TileLod): Promise<BuiltTileData> {
    const worker = getSharedWorker();
    if (worker) {
      return new Promise((resolve) => {
        const reqId = sharedNextJobId++;
        sharedPending.set(reqId, resolve);
        const copy = buffer.slice(0);
        const msg: WorkerRequest = { id: reqId, cityId: id, lod, tileSize: city.index.tileSize, buffer: copy };
        worker.postMessage(msg, [copy]);
      });
    }
    const decoded = decodeTile(buffer, city.index.tileSize);
    return Promise.resolve(buildTileGeometry(decoded, id, lod));
  }

  const activeTiles = new Map<string, ActiveTile>();
  const buildingTile = new Map<string, TileLod>();

  async function fetchTileRaw(tx: number, tz: number): Promise<ArrayBuffer | null> {
    const key = `${tx},${tz}`;
    if (!city.tileSet.has(key)) return null;
    const cacheKey = `${id}:${key}`;
    const cached = sharedRawCache.get(cacheKey);
    if (cached) {
      if (!city.hasTile(tx, tz)) city.addTile(decodeTile(cached, city.index.tileSize));
      return cached;
    }
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
      if (!city.hasTile(tx, tz)) {
        city.addTile(decodeTile(buf, city.index.tileSize));
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
    const geometries: THREE.BufferGeometry[] = [];
    const track = (geo: THREE.BufferGeometry) => {
      geometries.push(geo);
      return geo;
    };

    if (data.walls) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.walls.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(data.walls.nrm, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(data.walls.uv, 2));
      geo.setAttribute("aAtlas", new THREE.BufferAttribute(data.walls.atlas, 2));
      geo.setAttribute("color", new THREE.BufferAttribute(data.walls.color, 3));
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.castShadow = mesh.receiveShadow = quality > 1;
      g.add(mesh);
    }
    if (data.roofs) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.roofs.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(data.roofs.nrm, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.roofs.color, 3));
      const mesh = new THREE.Mesh(geo, roofMat);
      mesh.castShadow = mesh.receiveShadow = quality > 1;
      g.add(mesh);
    }
    if (data.midBuildings) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.midBuildings.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(data.midBuildings.nrm, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.midBuildings.color, 3));
      g.add(new THREE.Mesh(geo, midMat));
    }
    if (data.ground) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.ground.pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.ground.color, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, parkMat);
      mesh.receiveShadow = quality > 1;
      g.add(mesh);
    }
    if (data.water) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.water, 3));
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, waterMat));
    }
    if (data.roads) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.roads.pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.roads.color, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.receiveShadow = quality > 1;
      g.add(mesh);
    }
    if (data.roadMarks) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.roadMarks, 3));
      g.add(new THREE.Mesh(geo, roadMarkMat));
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
      const crowns = new THREE.InstancedMesh(treeProto.crown, treeProto.crownMat, count);
      const trunks = new THREE.InstancedMesh(treeProto.trunk, treeProto.trunkMat, count);
      for (let i = 0; i < count; i++) {
        const x = data.trees[i * 5];
        const z = data.trees[i * 5 + 1];
        const s = data.trees[i * 5 + 2];
        const yaw = data.trees[i * 5 + 3];
        const cIdx = data.trees[i * 5 + 4] | 0;
        tmpPos.set(x, 0, z);
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

    return { key: `${data.tx},${data.tz}`, tx: data.tx, tz: data.tz, lod: data.lod, group: g, geometries };
  }

  function disposeTile(tile: ActiveTile) {
    tileGroup.remove(tile.group);
    tile.geometries.forEach((g) => g.dispose());
    tile.group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
    });
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
    const built = await buildInWorker(buf, lod);
    buildingTile.delete(key);
    if (disposed) return;

    const prev = activeTiles.get(key);
    if (prev) disposeTile(prev);
    const next = assembleTileGroup(built);
    activeTiles.set(key, next);
    tileGroup.add(next.group);
  }

  let lastStreamX = Infinity;
  let lastStreamZ = Infinity;

  function desiredTiles(x: number, z: number) {
    const ts = city.index.tileSize || TILE_SIZE;
    const cx = Math.floor(x / ts);
    const cz = Math.floor(z / ts);
    const maxR = quality === 0 ? 1 : quality === 1 ? 2 : 3;
    const wanted: { tx: number; tz: number; dist: number; lod: TileLod }[] = [];
    for (let dx = -maxR; dx <= maxR; dx++) {
      for (let dz = -maxR; dz <= maxR; dz++) {
        const dist = Math.hypot(dx, dz);
        if (dist > maxR + 0.35) continue;
        const tx = cx + dx;
        const tz = cz + dz;
        if (!city.tileSet.has(`${tx},${tz}`)) continue;
        // On software WebGL (quality 0), use lightweight LOD 1/2 boxes so frames stay fast in CI.
        const lod: TileLod =
          quality === 0
            ? (dist <= 0.5 ? 1 : 2)
            : dist <= 1.45
              ? 0
              : dist <= 2.35
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
    if (Math.hypot(x - lastStreamX, z - lastStreamZ) < 120) return;
    lastStreamX = x;
    lastStreamZ = z;

    const wanted = desiredTiles(x, z);
    const keepKeys = new Set<string>(wanted.map((w) => `${w.tx},${w.tz}`));

    // Unload tiles beyond radius + 1
    const ts = city.index.tileSize || TILE_SIZE;
    const cx = Math.floor(x / ts);
    const cz = Math.floor(z / ts);
    const unloadR = (quality === 0 ? 2 : 3) + 1.2;
    for (const [key, tile] of activeTiles) {
      if (!keepKeys.has(key) && Math.hypot(tile.tx - cx, tile.tz - cz) > unloadR) {
        disposeTile(tile);
        activeTiles.delete(key);
        city.removeTile(tile.tx, tile.tz);
      }
    }

    // Queue up to 6 missing/upgraded tiles at a time
    let queued = 0;
    for (const w of wanted) {
      const key = `${w.tx},${w.tz}`;
      const cur = activeTiles.get(key);
      if (cur && cur.lod === w.lod) continue;
      if (buildingTile.get(key) === w.lod) continue;
      void loadTileAtLod(w.tx, w.tz, w.lod);
      if (++queued >= 6) break;
    }
  }

  async function ensureAround(x: number, z: number) {
    lastStreamX = x;
    lastStreamZ = z;
    const wanted = desiredTiles(x, z);
    // Await the immediate 3x3 core (dist <= 1.5, LOD 0) so the first frame is crisp and fast
    const core = wanted.filter((w) => w.dist <= 1.5);
    await Promise.all(core.map((w) => loadTileAtLod(w.tx, w.tz, w.lod)));
    // Kick off outer rings asynchronously without blocking first paint
    for (const w of wanted) {
      if (w.dist > 1.5) void loadTileAtLod(w.tx, w.tz, w.lod);
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
      quality = nextQ;
      sun.castShadow = quality > 1;
      lastStreamX = Infinity;
    },
    ensureAround,
    updateStream,
    update(time: number) {
      waterNormal.offset.set(time * 0.018, time * 0.011);
      const pulse = 0.45 + 0.55 * Math.sin(time * 3.4);
      for (const b of landmarks.beacons) {
        b.visible = night;
        if (night) {
          const s = 14 + pulse * 10;
          b.scale.set(s, s, 1);
        }
      }
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    },
    setSize() {
      /* direct rendering; renderer.setSize handles viewport */
    },
    dispose() {
      disposed = true;
      for (const tile of activeTiles.values()) disposeTile(tile);
      activeTiles.clear();
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** The paper plane: a sleek folded dart with subtle crease shading and accent stripe. */
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
      emissiveIntensity: 0.45,
    }),
  );
  mesh.castShadow = true;
  const fold = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.035, -1.6), new THREE.Vector3(0, 0.035, 0.95)]),
    new THREE.LineBasicMaterial({ color: 0xff4d1c }),
  );
  const plane = new THREE.Group();
  plane.add(mesh, fold);
  plane.children.forEach((c) => c.scale.setScalar(1.5)); // 3.75 m span
  return plane;
}

/** Smooth tapering ribbon contrails from both wingtips. */
export function createContrails(length = 96) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
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
      mat.opacity = boosting ? 0.65 : 0.36;
      const halfW = boosting ? 0.24 : 0.12;
      for (let s = 0; s < 2; s++) {
        const arr = ribbons[s].pos;
        arr.copyWithin(6, 0, (length - 1) * 6);
        tip.set(s ? 1.85 : -1.85, 0.18, 1.42).applyQuaternion(plane.quaternion).add(plane.position);
        const ax = tip.x - right.x * halfW;
        const ay = tip.y - right.y * halfW;
        const az = tip.z - right.z * halfW;
        const bx = tip.x + right.x * halfW;
        const by = tip.y + right.y * halfW;
        const bz = tip.z + right.z * halfW;
        arr[0] = ax; arr[1] = ay; arr[2] = az;
        arr[3] = bx; arr[4] = by; arr[5] = bz;
        if (count < length) {
          for (let i = Math.max(1, count); i < length; i++) {
            arr[i * 6] = tip.x; arr[i * 6 + 1] = tip.y; arr[i * 6 + 2] = tip.z;
            arr[i * 6 + 3] = tip.x; arr[i * 6 + 4] = tip.y; arr[i * 6 + 5] = tip.z;
          }
        }
        // Taper the tail to zero width smoothly
        for (let i = Math.floor(length * 0.55); i < length; i++) {
          const t = 1 - (i - length * 0.55) / (length * 0.45);
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
