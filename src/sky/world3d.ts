// High-performance streamed 3D city renderer:
// - Worker-painted 512x512 per-tile ground & night street-light maps (1 quad/tile, zero Z-fighting, baked drop-shadows)
// - Native RepeatWrapping photographic facades + city-authentic palettes + base AO
// - 17 bespoke multi-coloured 3D landmarks (Burj Khalifa, Burj Al Arab, Ain Dubai, Atlantis, Museum of the Future,
//   Cayan Twist, Vidhana Soudha, High Court, Chinnaswamy Cricket Stadium, India Gate, Rashtrapati Bhavan,
//   Parliament House, Connaught Place, Jama Masjid, Red Fort, Humayun's Tomb, Spire Towers)
// - Flowering Gulmohar/Jacaranda canopy in Bengaluru, instanced superyachts in Dubai, 1-draw-call clouds.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { ATMOS_GLSL, captureSky, createAtmosphere, createBuildingMaterial, createWaterMaterial, withAtmosphere, type Atmosphere } from "./look";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { thermalCore } from "./glider";
import { launchPoint } from "./pilot";
import type { City, CityId, CityLandmark } from "./citydata";
import { decodeTile, TILE_SIZE } from "./tileformat";
import { buildTileGeometry, type BuiltTileData, type TileLod } from "./tile-geom";
import type { WorkerMessageIn, WorkerResponse } from "./tile-worker";

// Sun, haze and water per city: a low golden sun so towers throw long shadows
// and glass catches the light.
const LOOK: Record<
  CityId,
  {
    sun: [number, number]; // elevation, azimuth (degrees)
    groundDay: number;
    groundNight: number;
    fog: number; // haze density at sea level, per metre
    falloff: number; // haze thins with height, per metre
    water: number;
    waterNight: number;
    turbidity: number;
    rayleigh: number;
    mie: number;
  }
> = {
  dubai: { sun: [14, 250], groundDay: 0xcdb58c, groundNight: 0x1a1d2c, fog: 0.00007, falloff: 0.0009, water: 0x0b5566, waterNight: 0x050c1a, turbidity: 3.2, rayleigh: 1.5, mie: 0.005 },
  bengaluru: { sun: [17, 235], groundDay: 0x8f8a72, groundNight: 0x171c28, fog: 0.00008, falloff: 0.0011, water: 0x2c4f48, waterNight: 0x060d18, turbidity: 2.6, rayleigh: 1.9, mie: 0.004 },
  delhi: { sun: [13, 228], groundDay: 0xb09e7e, groundNight: 0x1c1a28, fog: 0.00011, falloff: 0.0010, water: 0x3a5550, waterNight: 0x07101a, turbidity: 4.5, rayleigh: 1.3, mie: 0.006 },
};

function seeded(seed: number) {
  let s = (Math.abs(seed) % 2147483646) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * The night: deep blue overhead, the city's own orange glow low on every side,
 * a moon with a soft halo, and stars that thin out toward the hazy horizon.
 */
function createNightSky(moonDir: THREE.Vector3) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { moon: { value: moonDir.clone().normalize() } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 moon; varying vec3 vDir;
      void main(){
        float h = max(vDir.y, 0.0);
        vec3 zenith = vec3(0.004, 0.008, 0.03);
        vec3 mid = vec3(0.016, 0.03, 0.085);
        vec3 horizon = vec3(0.09, 0.075, 0.1);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zenith, smoothstep(0.2, 0.85, h));
        // Light pollution: the city glows orange just above the horizon.
        c += vec3(0.32, 0.14, 0.05) * exp(-h * 14.0) * 0.55;
        float m = max(dot(vDir, moon), 0.0);
        c += vec3(0.75, 0.8, 0.95) * pow(m, 900.0) * 6.0;   // the disc
        c += vec3(0.25, 0.3, 0.45) * pow(m, 18.0) * 0.18;   // the halo
        if (vDir.y < 0.0) c = mix(c, vec3(0.05, 0.04, 0.05), smoothstep(0.0, 0.08, -vDir.y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(14000, 40, 20), material);
  const stars = new THREE.BufferGeometry();
  const pts: number[] = [];
  const sizes: number[] = [];
  const rand = seeded(3);
  for (let i = 0; i < 1800; i++) {
    const y = 0.08 + rand() * 0.92;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 13000, y * 13000, Math.sin(a) * r * 13000);
    sizes.push(rand() < 0.08 ? 2.6 : 1.2 + rand() * 0.8);
  }
  stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  stars.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float size; varying float vH; void main(){ vH = normalize(position).y; gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vH; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * smoothstep(0.05, 0.35, vH); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a); }`,
  });
  const starField = new THREE.Points(stars, starMat);
  const group = new THREE.Group();
  group.add(dome, starField);
  return {
    group,
    dispose: () => [dome.geometry, material, stars, starMat].forEach((d) => d.dispose()),
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
function buildLandmarks(landmarks: CityLandmark[], atmo: Atmosphere) {
  const uNight = atmo.uNight;
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
      const archH = h * 0.62;
      // Plinth
      add(new THREE.BoxGeometry(d * 1.6, 2.5, w * 1.3).translate(0, 1.25, 0), 0xc67c4e);
      // The arch itself: one extruded face with a round-headed opening, so it reads
      // as a gate from any side (the path runs east-west, through it).
      const archW = w * 0.36;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(w / 2, h * 0.78);
      shape.lineTo(-w / 2, h * 0.78);
      shape.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-archW / 2, 0);
      hole.lineTo(archW / 2, 0);
      hole.lineTo(archW / 2, archH - archW / 2);
      hole.absarc(0, archH - archW / 2, archW / 2, 0, Math.PI, false);
      hole.lineTo(-archW / 2, 0);
      shape.holes.push(hole);
      const arch = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 14 });
      arch.translate(0, 2.5, -d / 2).rotateY(Math.PI / 2);
      add(arch, 0xd99660);
      // Cornice and the stepped attic above.
      add(new THREE.BoxGeometry(d * 1.12, h * 0.05, w * 1.05).translate(0, 2.5 + h * 0.8, 0), 0xc98452);
      add(new THREE.BoxGeometry(d * 0.86, h * 0.12, w * 0.78).translate(0, 2.5 + h * 0.88, 0), 0xde9e68);
      add(new THREE.BoxGeometry(d * 0.6, h * 0.06, w * 0.5).translate(0, 2.5 + h * 0.97, 0), 0xc98452);
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
      withAtmosphere(
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: glassy ? 0.16 : 0.7, metalness: glassy ? 0.75 : 0.04 }),
        atmo,
        `landmark-${glassy ? "glass" : "stone"}-${supertall ? 1 : 0}`,
        (shader) => {
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
                totalEmissiveRadiance += accent * (0.12 + band * 0.3) * uNight;
              }`,
            );
        },
      ),
    );

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
function createBaseGround(city: City, night: boolean, atmo: Atmosphere) {
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
    withAtmosphere(
      new THREE.MeshStandardMaterial({
        color: night ? look.groundNight : look.groundDay,
        alphaMap,
        alphaTest: alphaMap ? 0.5 : 0,
        roughness: 0.98,
        metalness: 0,
      }),
      atmo,
      "base-ground",
    ),
  );
  const basePlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(hx * 2, hz * 2)), baseMat);
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = 0.2;

  const surroundMat = keep(
    withAtmosphere(
      new THREE.MeshStandardMaterial({
        color: night ? look.groundNight : look.groundDay,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      atmo,
      "surround-ground",
    ),
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
function createTreePrototypes(cityId: CityId, atmo: Atmosphere) {
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
  const crownMat = withAtmosphere(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), atmo, "tree-crown");
  const trunkMat = withAtmosphere(new THREE.MeshStandardMaterial({ color: palm ? 0x8a6f4e : 0x5a4636, roughness: 1 }), atmo, "tree-trunk");

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
function createDubaiYachts(city: City, atmo: Atmosphere) {
  const hull = mergeGeometries([
    new THREE.BoxGeometry(5.5, 2.2, 20).translate(0, 1.1, 0).toNonIndexed(),
    new THREE.BoxGeometry(4.2, 2.4, 8.5).translate(0, 3.2, -1.5).toNonIndexed(),
  ])!;
  const mat = withAtmosphere(new THREE.MeshStandardMaterial({ color: 0xfafaf6, roughness: 0.3, metalness: 0.15 }), atmo, "yachts");
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
let cloudAtlas: Promise<THREE.Texture> | null = null;
/**
 * Four photographed-looking cumulus in a 2×2 atlas (generated once, cut from
 * black): alpha is the cloud, the grey is how lit each part is.
 */
function cloudTexture(base: string) {
  cloudAtlas ??= new THREE.TextureLoader().loadAsync(`${base}assets/sky/clouds.webp`).then((t) => {
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    return t;
  });
  cloudAtlas.catch(() => (cloudAtlas = null));
  return cloudAtlas;
}

/**
 * Cumulus over every thermal (so clouds tell a pilot where the lift is) and a
 * scattered layer across the city: camera-facing quads in one draw call, lit
 * from the sun's side and fading into the haze.
 */
function createClouds(city: City, atmo: Atmosphere, atlas: THREE.Texture) {
  const rand = seeded(city.data.id.length * 131 + 7);
  const items: [number, number, number, number, number][] = []; // x, y, z, size, variant
  for (const t of city.thermals) {
    // The cloud base sits well above the thermal's top, so it caps the lift without walling it in.
    const top = Math.min(t.top + 160, 1200);
    const core = thermalCore(t, top, city.breeze);
    for (let i = 0; i < 2; i++) items.push([core.x + (rand() - 0.5) * 180, top + rand() * 60, core.z + (rand() - 0.5) * 180, 300 + rand() * 220, Math.floor(rand() * 4)]);
  }
  const [hx, hz] = city.data.half;
  for (let i = 0; i < 70; i++) {
    items.push([(rand() - 0.5) * (hx * 2 + 9000), 700 + rand() * 600, (rand() - 0.5) * (hz * 2 + 9000), 380 + rand() * 520, Math.floor(rand() * 4)]);
  }
  const n = items.length;
  const centre = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const meta = new Float32Array(n * 4 * 2);
  const index: number[] = [];
  items.forEach(([x, y, z, size, v], i) => {
    for (let k = 0; k < 4; k++) {
      const o = i * 4 + k;
      centre.set([x, y, z], o * 3);
      corner.set([k === 0 || k === 3 ? -1 : 1, k < 2 ? -1 : 1], o * 2);
      meta.set([size, v], o * 2);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(centre, 3));
  geo.setAttribute("corner", new THREE.BufferAttribute(corner, 2));
  geo.setAttribute("meta", new THREE.BufferAttribute(meta, 2));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40000);
  const uniforms = { ...atmo, uAtlas: { value: atlas }, uLight: { value: new THREE.Color(1, 0.93, 0.84) }, uShade: { value: new THREE.Color(0.42, 0.47, 0.58) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec2 meta;
      varying vec2 vUv;
      varying vec3 vWP;
      varying float vFade;
      void main() {
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        float size = meta.x;
        mv.xy += corner * size * 0.6;
        float v = meta.y;
        vec2 cell = vec2(mod(v, 2.0), 1.0 - floor(v / 2.0));
        vUv = (cell + corner * 0.5 + 0.5) * 0.5;
        vWP = (inverse(viewMatrix) * mv).xyz;
        // Fade clouds the plane is about to fly through, so they never fill the screen.
        vFade = smoothstep(180.0, 700.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uLight;
      uniform vec3 uShade;
      uniform float uNight;
      varying vec2 vUv;
      varying vec3 vWP;
      varying float vFade;
      ${"" /* atmosphere functions */}
      ATMOS
      void main() {
        vec4 t = texture2D(uAtlas, vUv);
        float a = t.a * vFade;
        if (a < 0.01) discard;
        vec3 rd = normalize(vWP - cameraPosition);
        float toward = pow(max(dot(rd, uSunDir), 0.0), 4.0);
        float light = t.r;
        vec3 lit = mix(uShade, uLight * (1.3 + toward * 1.8), smoothstep(0.0, 0.85, light));
        // At night: moonlit tops, and bases lit orange by the city below.
        vec3 nightLit = mix(vec3(0.16, 0.08, 0.035), vec3(0.06, 0.07, 0.11), smoothstep(0.0, 0.85, light));
        lit = mix(lit, nightLit, uNight);
        vec3 col = applyAtmos(lit * 1.6, vWP);
        gl_FragColor = vec4(col, a * 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.fragmentShader = mat.fragmentShader.replace("ATMOS", ATMOS_GLSL);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
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
  /** Image-based light for every standard material: the sky above, the city below. */
  environment: THREE.Texture | null;
  environmentIntensity: number;
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

  const atmo = createAtmosphere();
  atmo.uFogDensity.value = look.fog;
  atmo.uFogFalloff.value = look.falloff;
  const uNight = atmo.uNight;
  uNight.value = night ? 1 : 0;

  // ---------- Sun, sky and the captured environment ----------
  // The sun sits behind the visitor's left shoulder on the opening line, so the
  // first view of the city is lit, with shadows falling away to the right.
  const [elev] = look.sun;
  const opening = launchPoint(city).heading;
  const fx = Math.sin(opening);
  const fz = -Math.cos(opening);
  // Mostly from the side: one face lit, the next in shade, so every building reads as a solid.
  const turn = 1.25;
  const azimuth = THREE.MathUtils.radToDeg(Math.atan2(fx * Math.cos(turn) - fz * Math.sin(turn), fx * Math.sin(turn) + fz * Math.cos(turn)));
  const daySunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azimuth));
  const moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(azimuth + 160));
  const sunDirection = (night ? moonDir : daySunDir).clone();
  atmo.uSunDir.value.copy(daySunDir);

  const makeSky = (scale: number) => {
    const sky = new Sky();
    sky.scale.setScalar(scale);
    const u = sky.material.uniforms;
    u.turbidity.value = look.turbidity;
    u.rayleigh.value = look.rayleigh;
    u.mieCoefficient.value = look.mie;
    u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.copy(daySunDir);
    return sky;
  };
  const daySky = makeSky(20000);
  // Drawn after the city: its costly shader runs only where sky is actually seen.
  daySky.renderOrder = 5;
  daySky.visible = !night;
  group.add(daySky);
  keep(daySky.geometry);
  keep(daySky.material);
  const dusk = keep(createNightSky(moonDir));
  dusk.group.children.forEach((c) => (c.renderOrder = 5));
  dusk.group.visible = night;
  group.add(dusk.group);

  // The environment: the sky above and a stand-in for the city below, captured
  // once per theme. The haze reads it; PMREM makes it the light on glass.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ground = new THREE.Color();
  const capture = (isNight: boolean) => {
    const scene = new THREE.Scene();
    const sky = isNight ? createNightSky(moonDir) : null;
    const skyMesh = isNight ? null : makeSky(10000);
    if (sky) scene.add(sky.group);
    if (skyMesh) scene.add(skyMesh);
    ground.setHex(isNight ? 0x1a1410 : look.groundDay).multiplyScalar(isNight ? 1 : 0.55);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(20000, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ground }));
    floor.position.y = -40;
    scene.add(floor);
    const cube = captureSky(renderer, scene, quality === 0 ? 32 : 128);
    const env = pmrem.fromCubemap(cube.texture).texture;
    sky?.dispose();
    skyMesh?.geometry.dispose();
    skyMesh?.material.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
    return { cube: keep(cube), env: keep(env) };
  };
  const dayEnv = capture(false);
  const nightEnv = capture(true);
  pmrem.dispose();

  // ---------- Lights ----------
  const sun = new THREE.DirectionalLight(0xffc68a, 6.5);
  sun.position.copy(sunDirection).multiplyScalar(900);
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCam = sun.shadow.camera as THREE.OrthographicCamera;
  shadowCam.left = shadowCam.bottom = -340;
  shadowCam.right = shadowCam.top = 340;
  shadowCam.near = 50;
  shadowCam.far = 2600;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.9;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x6b5a44, 0.35);
  group.add(hemi);

  // ---------- Shared materials ----------
  const buildingMat = keep(createBuildingMaterial(atmo));
  const railMat = keep(withAtmosphere(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), atmo, "rails"));
  const sunHdr = new THREE.Color(0xffc68a).multiplyScalar(6.5);
  const waterMat = keep(createWaterMaterial(atmo, new THREE.Color(night ? look.waterNight : look.water), sunHdr));

  const tileSize = city.index.tileSize || TILE_SIZE;
  const sharedTilePlane = keep(new THREE.PlaneGeometry(tileSize + 1.5, tileSize + 1.5));
  sharedTilePlane.rotateX(-Math.PI / 2);

  // The ground is three layers within half a metre of each other: sea, the whole
  // city's base, then each tile's painted map. Depth cannot tell them apart far
  // away (that is the flicker), so they are painted in order instead, each over
  // the last, before anything else is drawn.
  waterMat.depthWrite = false;
  const seaPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(60000, 60000)), waterMat);
  seaPlane.rotation.x = -Math.PI / 2;
  seaPlane.renderOrder = -3;
  group.add(seaPlane);

  const baseGround = keep(createBaseGround(city, night, atmo));
  baseGround.group.traverse((o) => {
    o.renderOrder = -2;
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) m.depthFunc = THREE.AlwaysDepth;
  });
  group.add(baseGround.group);
  const treeProto = keep(createTreePrototypes(id, atmo));
  treeProto.setNight(night);
  const landmarks = keep(buildLandmarks(city.landmarks, atmo));
  group.add(landmarks.group);
  landmarks.group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  if (id === "dubai" && quality > 0) {
    const yachts = keep(createDubaiYachts(city, atmo));
    group.add(yachts.mesh);
  }
  const clouds = keep(createClouds(city, atmo, await cloudTexture(base)));
  group.add(clouds.mesh);

  // Street lamps: glowing points, sized in metres so they shrink with distance,
  // never below a steady 1.5 px (smaller points shimmer as they cross pixels).
  const lampUniforms = { uScale: { value: 600 } };
  const lampMat = keep(
    new THREE.ShaderMaterial({
      uniforms: lampUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float kind;
        varying float vFade;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          float px = uScale * (kind > 1.5 ? 2.4 : 1.8) / max(d, 1.0);
          vFade = smoothstep(4500.0, 900.0, d) * clamp(px / 1.5, 0.35, 1.0);
          gl_PointSize = clamp(px, 1.5, 16.0);
          vColor = kind > 1.5 ? vec3(1.0, 0.78, 0.5) : vec3(1.0, 0.6, 0.26);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vFade;
        varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-r * r * 4.0) * vFade;
          gl_FragColor = vec4(vColor * a * 2.2, a);
        }`,
    }),
  );
  lampMat.visible = night;

  let post: { composer: EffectComposer; pass: RenderPass; bloom: UnrealBloomPass; fxaa: ShaderPass } | null = null;
  const activeTiles = new Map<string, ActiveTile>();
  const environment = { current: (night ? nightEnv : dayEnv).env };

  function applyTheme(isNight: boolean) {
    night = isNight;
    uNight.value = isNight ? 1 : 0;
    daySky.visible = !isNight;
    dusk.group.visible = isNight;
    sunDirection.copy(isNight ? moonDir : daySunDir);
    atmo.uSunDir.value.copy(isNight ? moonDir : daySunDir);
    const set = isNight ? nightEnv : dayEnv;
    atmo.uSkyCube.value = set.cube.texture;
    environment.current = set.env;
    atmo.uSunGlow.value.set(isNight ? 0x000000 : 0xffc890);
    atmo.uFogDensity.value = look.fog * (isNight ? 1.4 : 1);
    atmo.uFill.value = isNight ? 0.55 : 0.34;
    sun.color.setHex(isNight ? 0x8ea4ff : 0xffc68a);
    sun.intensity = isNight ? 0.35 : 6.5;
    sunHdr.setHex(isNight ? 0x8ea4ff : 0xffc68a).multiplyScalar(isNight ? 0.2 : 6.5);
    hemi.color.setHex(isNight ? 0x3a4a80 : 0x9fc0e8);
    hemi.groundColor.setHex(isNight ? 0x3a2414 : 0x6b5a44);
    hemi.intensity = isNight ? 0.35 : 0.35;
    (waterMat.uniforms.uDeep.value as THREE.Color).setHex(isNight ? look.waterNight : look.water);
    for (const t of activeTiles.values()) {
      if (t.groundMat) {
        t.groundMat.color.setHex(isNight ? 0x22252f : 0xffffff);
        t.groundMat.emissiveIntensity = isNight ? 1.8 : 0;
      }
    }
    baseGround.setNight(isNight);
    treeProto.setNight(isNight);
    lampMat.visible = isNight;
    renderer.toneMappingExposure = isNight ? 0.85 : 0.5;
  }
  applyTheme(night);

  // ---------- Web Worker + tile streamer ----------
  const tileGroup = new THREE.Group();
  group.add(tileGroup);
  const workerInstance = getSharedWorker();
  if (workerInstance && !sentSeaCities.has(id)) {
    sentSeaCities.add(id);
    const seaMsg: WorkerMessageIn = {
      kind: "sea",
      cityId: id,
      sea: city.sea ? { half: city.data.half, cell: city.sea.cell, cols: city.sea.cols, rows: city.sea.rows, mask: city.sea.mask } : null,
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
    const sea = city.sea ? { half: city.data.half, cell: city.sea.cell, cols: city.sea.cols, rows: city.sea.rows, mask: city.sea.mask } : null;
    const data = buildTileGeometry(decoded, id, lod, tileSize, sea, quality);
    return Promise.resolve({ id: 0, data, collision: needCollision ? decoded : undefined });
  }

  const buildingTile = new Map<string, TileLod>();
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

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
      while (sharedRawOrder.length > 160) sharedRawCache.delete(sharedRawOrder.shift()!);
    }
    return buf;
  }

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpAxis = new THREE.Vector3(0, 1, 0);
  const tmpColor = new THREE.Color();
  const tmpSize = new THREE.Vector2();
  const groundKey = "ground-tile";
  const groundDetail = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    // Fine grain in world space, so the ground holds up when the plane skims low.
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nfloat gHash(vec2 p){return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743);}")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec2 q = vAtmoPos.xz;
          float n = gHash(floor(q * 0.8)) * 0.5 + gHash(floor(q * 0.21)) * 0.5;
          float near = 1.0 - smoothstep(200.0, 900.0, length(cameraPosition - vAtmoPos));
          diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.14 * near;
        }`,
      );
  };

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
        withAtmosphere(
          new THREE.MeshStandardMaterial({
            map: gTex,
            alphaTest: 0.5,
            roughness: 0.95,
            metalness: 0,
            color: night ? 0x22252f : 0xffffff,
            emissive: 0xffffff,
            emissiveMap: nTex,
            emissiveIntensity: night ? 1.8 : 0,
            depthFunc: THREE.AlwaysDepth,
          }),
          atmo,
          groundKey,
          groundDetail,
        ),
      );
      const quad = new THREE.Mesh(sharedTilePlane, groundMat);
      quad.position.set((data.tx + 0.5) * tileSize, 0.45, (data.tz + 0.5) * tileSize);
      quad.receiveShadow = true;
      quad.renderOrder = -1;
      g.add(quad);
    }

    if (data.buildings) {
      const b = data.buildings;
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(b.nrm, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(b.uv, 2));
      geo.setAttribute("color", new THREE.BufferAttribute(b.color, 3));
      geo.setAttribute("info", new THREE.BufferAttribute(b.info, 3));
      geo.setAttribute("edge", new THREE.BufferAttribute(b.edge, 4));
      const mesh = new THREE.Mesh(geo, buildingMat);
      mesh.castShadow = data.lod === 0;
      mesh.receiveShadow = data.lod < 2;
      g.add(mesh);
    }
    if (data.rails) {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(data.rails.pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.rails.color, 3));
      geo.computeVertexNormals();
      const rails = new THREE.Mesh(geo, railMat);
      rails.castShadow = rails.receiveShadow = true;
      g.add(rails);
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
      crowns.computeBoundingSphere();
      trunks.computeBoundingSphere();
      crowns.castShadow = true;
      g.add(crowns, trunks);
    }
    if (data.lights && data.lights.length >= 3) {
      const n = data.lights.length / 3;
      const pos = new Float32Array(n * 3);
      const kind = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = data.lights[i * 3];
        pos[i * 3 + 1] = 9;
        pos[i * 3 + 2] = data.lights[i * 3 + 1];
        kind[i] = data.lights[i * 3 + 2];
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("kind", new THREE.BufferAttribute(kind, 1));
      const lamps = new THREE.Points(geo, lampMat);
      lamps.renderOrder = 3;
      g.add(lamps);
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
    if (resp.collision && !city.hasTile(tx, tz)) city.addTile(resp.collision);
    // Uploading a tile (a 1k ground map, a few hundred thousand vertices) takes a
    // few milliseconds; tiles queue up and go in one per frame, so flight never stalls.
    if (direct) install(resp.data);
    else ready.push(resp.data);
  }

  const ready: BuiltTileData[] = [];
  let direct = false;
  function install(data: BuiltTileData) {
    const key = `${data.tx},${data.tz}`;
    const prev = activeTiles.get(key);
    if (prev) disposeTile(prev);
    const next = assembleTileGroup(data);
    activeTiles.set(key, next);
    tileGroup.add(next.group);
  }

  let lastStreamX = Infinity;
  let lastStreamZ = Infinity;
  const ringRadius = () => (quality === 0 ? 1 : quality === 1 ? 3 : 4);

  function desiredTiles(x: number, z: number) {
    const cx = Math.floor(x / tileSize);
    const cz = Math.floor(z / tileSize);
    const maxR = ringRadius();
    const wanted: { tx: number; tz: number; dist: number; lod: TileLod }[] = [];
    for (let dx = -maxR; dx <= maxR; dx++) {
      for (let dz = -maxR; dz <= maxR; dz++) {
        // Distance from the plane to the tile's nearest edge, in tiles.
        const fx = x / tileSize - (cx + dx + 0.5);
        const fz = z / tileSize - (cz + dz + 0.5);
        const dist = Math.hypot(Math.max(0, Math.abs(fx) - 0.5), Math.max(0, Math.abs(fz) - 0.5));
        if (dist > maxR - 0.4) continue;
        const tx = cx + dx;
        const tz = cz + dz;
        if (!city.tileSet.has(`${tx},${tz}`)) continue;
        let lod: TileLod = quality === 0 ? (dist < 0.1 ? 1 : 2) : dist < 0.55 ? 0 : dist < 1.6 ? 1 : 2;
        // Hysteresis: a tile near a boundary keeps its detail, so it does not pop back and forth.
        const cur = activeTiles.get(`${tx},${tz}`)?.lod;
        if (quality > 0 && cur !== undefined && cur !== lod) {
          const edge = Math.min(Math.abs(dist - 0.55), Math.abs(dist - 1.6));
          if (edge < 0.25) lod = cur;
        }
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
    const cx = Math.floor(x / tileSize);
    const cz = Math.floor(z / tileSize);
    const unloadR = ringRadius() + 1.5;
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
    // Everything in view is solid on the first frame: the whole ring loads before play.
    direct = true;
    await Promise.all(desiredTiles(x, z).map((w) => loadTileAtLod(w.tx, w.tz, w.lod)));
    direct = false;
  }

  return {
    group,
    sun,
    sunDirection,
    get environment() {
      return environment.current;
    },
    get environmentIntensity() {
      // Full-strength reflections by day (look.ts turns the flat fill down separately);
      // at night glass mirrors mostly darkness.
      return night ? 0.35 : 1;
    },
    setNight(isNight: boolean) {
      if (isNight !== night) applyTheme(isNight);
    },
    setQuality(nextQ: number) {
      if (nextQ !== quality) lastStreamX = Infinity;
      quality = nextQ;
    },
    ensureAround,
    updateStream,
    update(time: number) {
      atmo.uTime.value = time;
      const next = ready.shift();
      if (next && !disposed) install(next);
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
      const cam = camera as THREE.PerspectiveCamera;
      if (night && quality >= 2) {
        // Night on a capable GPU: lit windows, lamps and landmarks bloom.
        if (!post) {
          const size = renderer.getSize(tmpSize);
          // No multisampling here (it halves the frame rate on integrated GPUs);
          // a cheap FXAA pass after tone mapping smooths the edges instead.
          const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
          const composer = new EffectComposer(renderer, target);
          composer.setPixelRatio(renderer.getPixelRatio());
          composer.setSize(size.x, size.y);
          const pass = new RenderPass(scene, camera);
          const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.75, 0.55, 0.55);
          const fxaa = new ShaderPass(FXAAShader);
          composer.addPass(pass);
          composer.addPass(bloom);
          composer.addPass(new OutputPass());
          composer.addPass(fxaa);
          const px = renderer.getPixelRatio();
          fxaa.material.uniforms.resolution.value.set(1 / (size.x * px), 1 / (size.y * px));
          post = { composer, pass, bloom, fxaa };
        }
        post.pass.scene = scene;
        post.pass.camera = camera;
        lampUniforms.uScale.value = renderer.getDrawingBufferSize(tmpSize).y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
        daySky.position.copy(camera.position);
        dusk.group.position.copy(camera.position);
        post.composer.render();
        return;
      }
      lampUniforms.uScale.value = renderer.getDrawingBufferSize(tmpSize).y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      daySky.position.copy(camera.position);
      dusk.group.position.copy(camera.position);
      renderer.render(scene, camera);
    },
    setSize(width: number, height: number) {
      if (!post) return;
      const px = renderer.getPixelRatio();
      post.composer.setPixelRatio(px);
      post.composer.setSize(width, height);
      post.fxaa.material.uniforms.resolution.value.set(1 / (width * px), 1 / (height * px));
    },
    dispose() {
      disposed = true;
      for (const d of ready.splice(0)) {
        d.groundBitmap?.close();
        d.nightBitmap?.close();
      }
      for (const tile of activeTiles.values()) disposeTile(tile);
      activeTiles.clear();
      if (post) {
        post.composer.renderTarget1.dispose();
        post.composer.renderTarget2.dispose();
        post.bloom.dispose();
        post.composer.dispose();
      }
      disposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * The site's paper plane, folded: a dart with two wing facets either side of a
 * crease, a keel folded down the middle, and the brand's orange on the folded-up
 * wingtips and trailing edge. Flat shading lets every fold catch the sun.
 */
export function paperPlane() {
  const paper = new THREE.Color(0xfbf6ea);
  const shade = new THREE.Color(0xeee6d4);
  const orange = new THREE.Color(0xff4d1c);
  const positions: number[] = [];
  const colors: number[] = [];
  const tri = (a: number[], b: number[], c: number[], col: THREE.Color) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(col.r, col.g, col.b);
  };
  const nose = [0, 0.05, -1.95];
  const rear = [0, 0.05, 1.0];
  const keelBottom = [0, -0.46, 0.95];
  const keelFront = [0, -0.08, -1.2];
  for (const s of [-1, 1]) {
    const crease = [s * 0.5, 0.11, 1.0];
    const tip = [s * 1.28, 0.22, 1.0];
    const winglet = [s * 1.36, 0.58, 1.0];
    const wingletFront = [s * 1.3, 0.24, 0.25];
    const edgeIn = [s * 0.5, 0.1, 0.82];
    const edgeOut = [s * 1.22, 0.21, 0.84];
    tri(nose, crease, rear, s < 0 ? paper : shade);
    tri(nose, tip, crease, s < 0 ? shade : paper);
    tri(tip, winglet, wingletFront, orange);
    // The trailing-edge stripe.
    tri(edgeIn, edgeOut, tip, orange);
    tri(edgeIn, tip, crease, orange);
  }
  tri(nose, rear, keelBottom, shade);
  tri(nose, keelBottom, keelFront, paper);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, flatShading: true, emissive: 0xfff4e2, emissiveIntensity: 0.22 }),
  );
  mesh.castShadow = true;
  const plane = new THREE.Group();
  plane.add(mesh);
  mesh.scale.setScalar(1.45);
  return plane;
}

/**
 * Wingtip vapour: two ribbons that taper and fade with age, and fade out near
 * the camera so a trail never smears across the screen.
 */
export function createContrails(length = 72) {
  const group = new THREE.Group();
  const uniforms = { uOpacity: { value: 0.4 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float age;
      varying float vAge;
      varying float vNear;
      void main() {
        vAge = age;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNear = smoothstep(6.0, 26.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAge;
      varying float vNear;
      void main() {
        float a = pow(1.0 - vAge, 1.6) * smoothstep(0.0, 0.04, vAge) * vNear * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.99, 0.97), a);
        #include <colorspace_fragment>
      }`,
  });
  const ages = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) ages[i * 2] = ages[i * 2 + 1] = i / (length - 1);
  const ribbons = [0, 1].map(() => {
    const pos = new Float32Array(length * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("age", new THREE.BufferAttribute(ages, 1));
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
      uniforms.uOpacity.value += ((boosting ? 0.75 : 0.42) - uniforms.uOpacity.value) * 0.1;
      const halfW = boosting ? 0.2 : 0.1;
      for (let s = 0; s < 2; s++) {
        const arr = ribbons[s].pos;
        arr.copyWithin(6, 0, (length - 1) * 6);
        tip.set(s ? 1.95 : -1.95, 0.75, 1.45).applyQuaternion(plane.quaternion).add(plane.position);
        arr[0] = tip.x - right.x * halfW;
        arr[1] = tip.y - right.y * halfW;
        arr[2] = tip.z - right.z * halfW;
        arr[3] = tip.x + right.x * halfW;
        arr[4] = tip.y + right.y * halfW;
        arr[5] = tip.z + right.z * halfW;
        if (count < length) {
          for (let i = Math.max(1, count); i < length; i++) arr.copyWithin(i * 6, 0, 6);
        }
        // The trail spreads as it ages, like vapour.
        for (let i = 1; i < length; i++) {
          const grow = 1 + (i / length) * 0.04;
          const mx = (arr[i * 6] + arr[i * 6 + 3]) * 0.5;
          const my = (arr[i * 6 + 1] + arr[i * 6 + 4]) * 0.5;
          const mz = (arr[i * 6 + 2] + arr[i * 6 + 5]) * 0.5;
          for (let k = 0; k < 2; k++) {
            arr[i * 6 + k * 3] = mx + (arr[i * 6 + k * 3] - mx) * grow;
            arr[i * 6 + k * 3 + 1] = my + (arr[i * 6 + k * 3 + 1] - my) * grow;
            arr[i * 6 + k * 3 + 2] = mz + (arr[i * 6 + k * 3 + 2] - mz) * grow;
          }
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

/**
 * A burst of sparks when the plane threads a ring: one draw call, a pool of
 * particles flung outward from the ring's rim, fading as they fall.
 */
export function createBursts(max = 240) {
  const pos = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const col = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("life", new THREE.BufferAttribute(life, 1));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float life;
      attribute vec3 color;
      varying float vLife;
      varying vec3 vColor;
      void main() {
        vLife = life;
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = life > 0.0 ? min(64.0, 900.0 * (0.4 + life) / -mv.z) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vLife;
      varying vec3 vColor;
      void main() {
        if (vLife <= 0.0) discard;
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vLife;
        gl_FragColor = vec4(vColor * a * 1.6, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let next = 0;
  const c = new THREE.Color();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const n = new THREE.Vector3();
  return {
    points,
    emit(at: THREE.Vector3, normal: THREE.Vector3, radius: number, hex: number, count = 90) {
      n.copy(normal).normalize();
      side.set(0, 1, 0).cross(n);
      if (side.lengthSq() < 0.01) side.set(1, 0, 0);
      side.normalize();
      up.copy(n).cross(side).normalize();
      for (let i = 0; i < count; i++) {
        const k = next;
        next = (next + 1) % max;
        const a = Math.random() * Math.PI * 2;
        const ox = Math.cos(a) * radius;
        const oy = Math.sin(a) * radius;
        pos[k * 3] = at.x + side.x * ox + up.x * oy;
        pos[k * 3 + 1] = at.y + side.y * ox + up.y * oy;
        pos[k * 3 + 2] = at.z + side.z * ox + up.z * oy;
        const sp = 6 + Math.random() * 14;
        vel[k * 3] = (side.x * Math.cos(a) + up.x * Math.sin(a)) * sp + n.x * 8;
        vel[k * 3 + 1] = (side.y * Math.cos(a) + up.y * Math.sin(a)) * sp + n.y * 8;
        vel[k * 3 + 2] = (side.z * Math.cos(a) + up.z * Math.sin(a)) * sp + n.z * 8;
        life[k] = 1;
        c.setHex(hex).lerp(new THREE.Color(0xffffff), Math.random() * 0.5);
        col.set([c.r, c.g, c.b], k * 3);
      }
    },
    update(dt: number) {
      for (let k = 0; k < max; k++) {
        if (life[k] <= 0) continue;
        life[k] = Math.max(0, life[k] - dt * 1.1);
        vel[k * 3 + 1] -= 9 * dt;
        pos[k * 3] += vel[k * 3] * dt;
        pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
        pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.life.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
