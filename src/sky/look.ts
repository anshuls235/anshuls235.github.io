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

/**
 * Plain extruded buildings, dressed in the shader: window grids by style (glass
 * curtain wall, punched residential, office ribbon, small mid-rise windows),
 * glass that reflects the sky, a dark plinth and contact shading at the base,
 * textured roofs, and windows that light up at night.
 */
export function createBuildingMaterial(atmo: Atmosphere) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  return withAtmosphere(material, atmo, "buildings-v1", (shader) => {
    shader.uniforms.uNight = atmo.uNight;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 info;
        varying vec2 vFacade;
        varying vec3 vInfo;
        varying vec3 vWN;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFacade = uv;
        vInfo = info;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uNight;
        varying vec2 vFacade;
        varying vec3 vInfo;
        varying vec3 vWN;
        float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gGlass = 0.0;
        float gReflect = 0.0;
        float gLit = 0.0;
        float gTone = 0.0;`,
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
            // Bay width and floor height per style, with a little variety per building.
            vec2 bay = style < 0.5 ? vec2(1.6, 3.9) : style < 1.5 ? vec2(3.4, 3.1) : style < 2.5 ? vec2(2.6, 3.8) : vec2(3.0, 3.3);
            bay.x *= 0.85 + seed * 0.35;
            vec2 g = vec2(vFacade.x, y) / bay;
            vec2 f = fract(g);
            vec2 cell = floor(g);
            vec2 w = max(fwidth(g), vec2(0.0001));
            vec4 win = style < 0.5 ? vec4(0.05, 0.95, 0.14, 0.98)
              : style < 1.5 ? vec4(0.16, 0.84, 0.28, 0.86)
              : style < 2.5 ? vec4(0.02, 0.98, 0.36, 0.94)
              : vec4(0.27, 0.73, 0.30, 0.80);
            float wx = smoothstep(win.x - w.x, win.x + w.x, f.x) - smoothstep(win.y - w.x, win.y + w.x, f.x);
            float wy = smoothstep(win.z - w.y, win.z + w.y, f.y) - smoothstep(win.w - w.y, win.w + w.y, f.y);
            float avg = (win.y - win.x) * (win.w - win.z);
            // Far away the grid would shimmer; it settles into its average.
            // Glass towers light a whole floor (offices); homes light a few windows at a time.
            bool curtain = style < 0.5 || (style > 1.5 && style < 2.5);
            // At night lit windows need more pixels to read as windows, not a mosaic;
            // lit office floors are bands, so only the floor height has to resolve.
            float farNight = curtain ? smoothstep(0.12, 0.35, w.y) : smoothstep(0.05, 0.16, max(w.x, w.y));
            float far = mix(smoothstep(0.14, 0.42, max(w.x, w.y)), farNight, uNight);
            float m = mix(wx * wy, avg, far);
            // Plinth: a shopfront band on offices and towers, a solid base on homes.
            float plinth = 1.0 - smoothstep(4.0, 4.4, y);
            m = mix(m, style == 0.0 || style == 2.0 ? 0.7 : 0.15, plinth);
            if (style > 3.5) m = 0.0;
            gGlass = m;
            gReflect = (style < 0.5 ? 1.0 : style < 1.5 ? 0.12 : style < 2.5 ? 0.8 : 0.08) * (1.0 - uNight * 0.75);
            float pane = mix(bHash(vec2(floor(cell.x / 6.0), cell.y) + seed * 91.0), 0.5, far) * 0.4 + 0.3;
            vec3 glass = style < 0.5 || style > 1.5 && style < 2.5
              ? mix(vec3(0.10, 0.16, 0.20), base * 0.45, 0.35) * (0.85 + 0.3 * pane)
              : vec3(0.05, 0.06, 0.07) * (0.8 + 0.4 * pane);
            // Spandrel bands between floors read on curtain walls.
            vec3 frame = base * (style < 0.5 ? 0.9 : 1.0);
            diffuseColor.rgb = mix(frame, glass, m);
            // Floor slabs read as fine lines, so a tower shows its scale.
            float slabLine = 1.0 - (smoothstep(0.0, w.y * 1.5, f.y) - smoothstep(1.0 - w.y * 1.5, 1.0, f.y));
            float slab = mix(slabLine, 0.1, far);
            diffuseColor.rgb *= 1.0 - slab * (style < 0.5 ? 0.18 : 0.28) * (1.0 - plinth);
            // Each building a touch lighter or darker than its neighbours.
            diffuseColor.rgb *= 0.86 + seed * 0.28;
            // Contact shading at the street and a lighter crown at the top.
            diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.0, 18.0, y));
            diffuseColor.rgb *= 1.0 + 0.12 * smoothstep(vInfo.y - 3.0, vInfo.y, y);
            // Night: some windows on, warm or cool, a few flickering bright.
            // Windows light in runs along a floor (a flat, an office), not one by one.
            vec2 run = vec2(floor(cell.x / (curtain ? 40.0 : 4.0)), cell.y);
            float on = step(bHash(run * 1.7 + seed * 17.3), curtain ? 0.3 : 0.16 + seed * 0.2);
            float tone = curtain ? 0.9 : bHash(run + 4.1);
            gTone = tone;
            gLit = mix(on * wx * wy, avg * (curtain ? 0.12 : 0.18), far) * step(4.4, y) * (style > 3.5 ? 0.0 : 1.0);
            // At night the walls go dark so the windows carry the building.
            diffuseColor.rgb *= 1.0 - uNight * 0.7;
            gLit *= 0.6 + tone * 0.8;
          } else {
            // Roofs: concrete with plant, tanks and patches.
            vec2 r = vFacade * 0.35;
            float n = bHash(floor(r)) * 0.6 + bHash(floor(r * 3.1)) * 0.4;
            diffuseColor.rgb = base * (0.82 + 0.26 * n);
          }
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.35, 0.05, gReflect), gGlass);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(0.0, 0.92 * gReflect, gGlass);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (uNight > 0.01) {
          vec3 warm = mix(vec3(1.0, 0.52, 0.18), vec3(0.34, 0.31, 0.25), step(0.8, gTone));
          totalEmissiveRadiance += warm * gLit * 1.7 * uNight;
        }`,
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
