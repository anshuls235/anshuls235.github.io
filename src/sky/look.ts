// The look of the city: one atmosphere for everything (haze that takes the
// colour of the sky behind it, brighter toward the sun), a facade shader that
// draws windows, glass and night lights on plain extruded buildings, and water
// that reflects the sky with a sun glitter. All of it is shader work on a few
// materials, so the city stays a handful of draw calls per tile.
import * as THREE from "three";

export interface Atmosphere {
  uSkyCube: { value: THREE.Texture | null };
  uFogDensity: { value: number };
  uFogFalloff: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunGlow: { value: THREE.Color };
  uNight: { value: number };
  uTime: { value: number };
  /** How much of the sky's light fills shadows (reflections stay at full strength). */
  uFill: { value: number };
}

export function createAtmosphere(): Atmosphere {
  return {
    uSkyCube: { value: null },
    uFogDensity: { value: 0.00018 },
    uFogFalloff: { value: 0.0016 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunGlow: { value: new THREE.Color(1, 0.8, 0.6) },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uFill: { value: 0.35 },
  };
}

/** Height fog integrated along the view ray, coloured by the sky in that direction. */
export const ATMOS_GLSL = /* glsl */ `
uniform samplerCube uSkyCube;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
vec3 skyToward(vec3 rd) {
  vec3 d = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.6 + 0.015, rd.z));
  return textureCube(uSkyCube, d).rgb;
}
vec3 applyAtmos(vec3 col, vec3 wpos) {
  vec3 ro = cameraPosition;
  vec3 dv = wpos - ro;
  float dist = length(dv);
  vec3 rd = dv / max(dist, 0.001);
  float b = uFogFalloff;
  float base = uFogDensity * exp(-max(ro.y, 0.0) * b);
  float amount = abs(rd.y) < 0.0005 ? base * dist : base * (1.0 - exp(-dist * rd.y * b)) / (rd.y * b);
  float fog = 1.0 - exp(-max(amount, 0.0));
  float toward = pow(max(dot(rd, uSunDir), 0.0), 6.0);
  vec3 haze = skyToward(rd) + uSunGlow * toward * 0.35;
  return mix(col, haze, fog);
}
`;

type Shader = THREE.WebGLProgramParametersWithUniforms;

/**
 * Adds the atmosphere to a built-in material, applied before tone mapping so
 * the haze matches the (HDR) sky exactly. `extra` can patch the shader further.
 */
export function withAtmosphere<T extends THREE.Material>(material: T, atmo: Atmosphere, key: string, extra?: (shader: Shader) => void): T {
  (material as unknown as { fog: boolean }).fog = false;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, atmo);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vAtmoPos;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 atmoW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          atmoW = instanceMatrix * atmoW;
        #endif
        vAtmoPos = (modelMatrix * atmoW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vAtmoPos;\nuniform float uFill;\n${ATMOS_GLSL}`)
      .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\n#if defined( RE_IndirectDiffuse ) && defined( USE_ENVMAP )\n  iblIrradiance *= uFill;\n#endif")
      .replace("#include <tonemapping_fragment>", "gl_FragColor.rgb = applyAtmos(gl_FragColor.rgb, vAtmoPos);\n#include <tonemapping_fragment>");
    extra?.(shader);
  };
  material.customProgramCacheKey = () => `sky-atmo-${key}`;
  return material;
}

/** Bay width and floor height (metres) per facade style. */
const BAYS: [number, number][] = [
  [1.6, 3.9], // glass curtain wall
  [3.4, 3.1], // residential tower
  [2.6, 3.8], // office ribbon windows
  [3.0, 3.3], // mid-rise
];
const CELLS = 8; // each texture layer holds 8 bays × 8 floors
const TEX = 512;

let facadeArray: THREE.DataArrayTexture | null = null;
/**
 * The facades as a mipmapped texture array, one layer per style, painted once.
 * R: glass, G: detail shading (mullions, slabs, pane tint), B and A: two
 * night-time lighting patterns (sparse and busy). Being a real texture, the GPU
 * filters it: windows settle into a steady average with distance instead of
 * shimmering, by day and by night.
 */
export function facadeTextures() {
  if (facadeArray) return facadeArray;
  const layers = BAYS.length;
  const data = new Uint8Array(TEX * TEX * 4 * layers);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  let s = 11;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cell = TEX / CELLS;
  for (let layer = 0; layer < layers; layer++) {
    // Paint each channel as greyscale in turn, then pack.
    const paint = (draw: () => void) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, TEX, TEX);
      g.fillStyle = "#fff";
      draw();
      return g.getImageData(0, 0, TEX, TEX).data;
    };
    // Window rectangle within a cell: x0, x1, y0, y1 (fractions; y from the floor up).
    const win = [
      [0.05, 0.95, 0.16, 0.98],
      [0.17, 0.83, 0.3, 0.86],
      [0.02, 0.98, 0.36, 0.94],
      [0.27, 0.73, 0.3, 0.8],
    ][layer];
    // Canvas rows become texture rows bottom-up (no flip), so y here runs up a floor.
    const rectOf = (cx: number, cy: number): [number, number, number, number] => [
      cx * cell + win[0] * cell,
      cy * cell + win[2] * cell,
      (win[1] - win[0]) * cell,
      (win[3] - win[2]) * cell,
    ];
    const glass = paint(() => {
      for (let cy = 0; cy < CELLS; cy++) for (let cx = 0; cx < CELLS; cx++) g.fillRect(...rectOf(cx, cy));
    });
    const detail = paint(() => {
      g.fillStyle = "#d8d8d8";
      g.fillRect(0, 0, TEX, TEX);
      for (let cy = 0; cy < CELLS; cy++) {
        // A floor slab line at the bottom of every floor.
        g.fillStyle = "#8a8a8a";
        g.fillRect(0, cy * cell, TEX, 3);
        for (let cx = 0; cx < CELLS; cx++) {
          const v = 150 + Math.floor(rand() * 90);
          g.fillStyle = `rgb(${v},${v},${v})`;
          const [x, y, w, h] = rectOf(cx, cy);
          g.fillRect(x, y, w, h);
          if (layer === 0 || layer === 2) {
            // Mullions inside the glass.
            g.fillStyle = "#6a6a6a";
            for (const f of layer === 2 ? [0.33, 0.66] : [0.5]) g.fillRect(x + w * f - 1, y, 2, h);
          }
          if (layer === 1 && cx % 2 === 0) {
            // Balcony fronts on alternate bays.
            g.fillStyle = "#f2f2f2";
            g.fillRect(cx * cell + cell * 0.1, cy * cell + cell * 0.26, cell * 0.8, cell * 0.06);
          }
        }
      }
    });
    const lit = (busy: boolean) =>
      paint(() => {
        for (let cy = 0; cy < CELLS; cy++) {
          if (layer === 0 || layer === 2) {
            // Offices: a floor is lit or not, with the odd dark bay.
            if (rand() > (busy ? 0.5 : 0.28)) continue;
            for (let cx = 0; cx < CELLS; cx++) if (rand() > 0.08) g.fillRect(...rectOf(cx, cy));
          } else {
            // Homes: a window here, a pair there.
            for (let cx = 0; cx < CELLS; cx++) {
              if (rand() > (busy ? 0.32 : 0.16)) continue;
              const v = 150 + Math.floor(rand() * 105);
              g.fillStyle = `rgb(${v},${v},${v})`;
              g.fillRect(...rectOf(cx, cy));
              if (rand() < 0.4 && cx < CELLS - 1) g.fillRect(...rectOf(++cx, cy));
            }
            g.fillStyle = "#fff";
          }
        }
      });
    const sparse = lit(false);
    const busy = lit(true);
    const base = layer * TEX * TEX * 4;
    for (let i = 0; i < TEX * TEX; i++) {
      data[base + i * 4] = glass[i * 4];
      data[base + i * 4 + 1] = detail[i * 4];
      data[base + i * 4 + 2] = sparse[i * 4];
      data[base + i * 4 + 3] = busy[i * 4];
    }
  }
  facadeArray = new THREE.DataArrayTexture(data, TEX, TEX, layers);
  facadeArray.wrapS = facadeArray.wrapT = THREE.RepeatWrapping;
  facadeArray.magFilter = THREE.LinearFilter;
  facadeArray.minFilter = THREE.LinearMipmapLinearFilter;
  facadeArray.generateMipmaps = true;
  facadeArray.anisotropy = 4;
  facadeArray.needsUpdate = true;
  return facadeArray;
}

/**
 * Plain extruded buildings, dressed by the facade texture: glass that reflects
 * the sky, a plinth and contact shading at the base, textured roofs, and the
 * baked night patterns as lit windows. Every value comes from a filtered
 * texture or a slow gradient, so nothing shimmers as the plane moves.
 */
export function createBuildingMaterial(atmo: Atmosphere) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const facades = facadeTextures();
  return withAtmosphere(material, atmo, "buildings-v2", (shader) => {
    shader.uniforms.uNight = atmo.uNight;
    shader.uniforms.uFacade = { value: facades };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 info;
        attribute vec4 edge;
        varying vec2 vFacade;
        varying vec3 vInfo;
        varying vec4 vEdge;
        varying vec3 vWN;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFacade = uv;
        vInfo = info;
        vEdge = edge;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uFacade;
        uniform float uNight;
        varying vec2 vFacade;
        varying vec3 vInfo;
        varying vec4 vEdge;
        varying vec3 vWN;
        float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gGlass = 0.0;
        float gReflect = 0.0;
        vec3 gGlow = vec3(0.0);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float style = floor(vInfo.x + 0.5);
          float seed = vInfo.z;
          vec3 base = diffuseColor.rgb;
          if (vWN.y < 0.5) {
            float y = vFacade.y;
            float layer = min(style, 3.0);
            vec2 bay = style < 0.5 ? vec2(${BAYS[0][0]}, ${BAYS[0][1]}) : style < 1.5 ? vec2(${BAYS[1][0]}, ${BAYS[1][1]}) : style < 2.5 ? vec2(${BAYS[2][0]}, ${BAYS[2][1]}) : vec2(${BAYS[3][0]}, ${BAYS[3][1]});
            bay.x *= 0.85 + seed * 0.35;
            // Each building starts somewhere else in the pattern.
            vec2 uvT = (vec2(vFacade.x, y) / bay + floor(seed * vec2(37.0, 53.0))) / ${CELLS.toFixed(1)};
            vec4 t = texture(uFacade, vec3(uvT, layer));
            float plinth = 1.0 - smoothstep(4.0, 4.4, y);
            float glassAmt = style > 3.5 ? 0.0 : mix(t.r, style == 0.0 || style == 2.0 ? 0.7 : 0.1, plinth);
            gGlass = glassAmt;
            gReflect = (style < 0.5 ? 1.0 : style < 1.5 ? 0.15 : style < 2.5 ? 0.8 : 0.1) * (1.0 - uNight * 0.8);
            vec3 glass = style < 0.5 || (style > 1.5 && style < 2.5)
              ? mix(vec3(0.10, 0.15, 0.19), base * 0.4, 0.35)
              : vec3(0.05, 0.055, 0.06);
            float detail = mix(t.g, 0.85, plinth) * 1.15;
            diffuseColor.rgb = mix(base, glass, glassAmt) * detail;
            diffuseColor.rgb *= 0.88 + seed * 0.24;
            diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.0, 18.0, y));
            // A parapet band at the roofline.
            diffuseColor.rgb *= 1.0 + 0.22 * step(vInfo.y - 1.1, y);
            // Corners: inside corners trap shade, outside corners catch a thin bright edge.
            float s0 = vFacade.x - vEdge.x;
            float s1 = vEdge.y - s0;
            float inner = max(vEdge.z * (1.0 - smoothstep(0.0, 3.0, s0)), vEdge.w * (1.0 - smoothstep(0.0, 3.0, s1)));
            float outer = max((1.0 - vEdge.z) * (1.0 - smoothstep(0.0, 0.35, s0)), (1.0 - vEdge.w) * (1.0 - smoothstep(0.0, 0.35, s1)));
            diffuseColor.rgb *= (1.0 - inner * 0.35) * (1.0 + outer * 0.25);
            // Night: dark walls, and one of the two baked lighting patterns.
            diffuseColor.rgb *= 1.0 - uNight * 0.72;
            float lit = mix(t.b, t.a, step(0.55, seed)) * (1.0 - plinth) * (style > 3.5 ? 0.0 : 1.0);
            bool office = style < 0.5 || (style > 1.5 && style < 2.5);
            vec3 warm = office ? vec3(1.0, 0.8, 0.52) : mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.72, 0.42), fract(seed * 7.0));
            // Shops glow along the street.
            float shops = plinth * (office ? 0.9 : 0.5) * step(0.3, fract(seed * 3.0));
            gGlow = warm * (lit * (office ? 0.6 : 1.5) + shops * 1.1);
          } else {
            vec2 r = vFacade * 0.35;
            float n = bHash(floor(r)) * 0.6 + bHash(floor(r * 3.1)) * 0.4;
            // Roofs keep their large plant blocks, never pixel noise.
            diffuseColor.rgb = base * (0.86 + 0.2 * n) * (1.0 - uNight * 0.75);
          }
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.35, 0.06, gReflect), gGlass);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = 0.92 * gReflect * gGlass;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += gGlow * uNight;`,
      );
  });
}

let normalTex: THREE.DataTexture | null = null;
/** A tileable ripple normal map, sampled at several scales so the sea never repeats. */
function rippleNormals() {
  if (normalTex) return normalTex;
  const n = 256;
  const h = new Float32Array(n * n);
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let o = 0; o < 5; o++) {
    const f = 2 ** (o + 1);
    const waves = Array.from({ length: 6 }, () => [rand() * 6.283, Math.round(1 + rand() * 3), Math.round(rand() * 4) - 2]);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        for (const [p, kx, ky] of waves) h[y * n + x] += Math.sin(((x * kx + y * ky) * f * 6.283) / n + p) / f ** 1.2;
      }
    }
  }
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x + n - 1) % n)];
      const dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
      const i = (y * n + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 + dx * 40));
      data[i + 1] = Math.max(0, Math.min(255, 128 + dy * 40));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  normalTex = new THREE.DataTexture(data, n, n);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.magFilter = THREE.LinearFilter;
  normalTex.minFilter = THREE.LinearMipmapLinearFilter;
  normalTex.generateMipmaps = true;
  normalTex.needsUpdate = true;
  return normalTex;
}

/** Sea and lakes: sky reflection by Fresnel, a sun glitter path, and depth colour. */
export function createWaterMaterial(atmo: Atmosphere, deep: THREE.Color, sunColor: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...atmo,
      uNormals: { value: rippleNormals() },
      uDeep: { value: deep },
      uSunColor: { value: sunColor },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNormals;
      uniform vec3 uDeep;
      uniform vec3 uSunColor;
      uniform float uTime;
      uniform float uNight;
      varying vec3 vWP;
      ${ATMOS_GLSL}
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
      vec3 ripple(vec2 uv) { return texture2D(uNormals, uv).xyz * 2.0 - 1.0; }
      void main() {
        vec2 p = vWP.xz;
        float dist = length(cameraPosition - vWP);
        vec3 n = ripple(rot(p, 0.4) / 53.0 + vec2(uTime * 0.011, uTime * 0.004));
        // The fine chop only where it can be seen.
        if (dist < 1800.0) n += ripple(rot(p, 1.9) / 13.0 - vec2(uTime * 0.02, uTime * 0.015)) * (1.0 - dist / 1800.0);
        // Calm the ripples with distance so the horizon does not sparkle.
        float calm = mix(0.55, 0.06, smoothstep(150.0, 4500.0, dist));
        n = normalize(vec3(n.x * calm, 1.0, n.y * calm));
        vec3 v = normalize(cameraPosition - vWP);
        float ndv = max(dot(n, v), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 sky = textureCube(uSkyCube, r).rgb;
        float glint = pow(max(dot(r, uSunDir), 0.0), 900.0) * 60.0 + pow(max(dot(r, uSunDir), 0.0), 90.0) * 0.9;
        vec3 body = uDeep * (0.55 + 0.45 * ndv);
        vec3 col = mix(body, sky, clamp(fres * 1.15, 0.0, 1.0)) + uSunColor * glint * (1.0 - uNight * 0.85);
        gl_FragColor = vec4(applyAtmos(col, vWP), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Renders the sky (and a ground below it) into a small cube once: the haze reads
 * its colour, and PMREM turns it into the reflections on glass and water.
 */
export function captureSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, size = 128) {
  const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const camera = new THREE.CubeCamera(1, 30000, target);
  const tone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  camera.update(renderer, scene);
  renderer.toneMapping = tone;
  return target;
}
