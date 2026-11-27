// The last chapter's stage: the paper plane glides over a real city. Hands off,
// an autopilot hops between thermals. Take the controls and it is a game:
// beat the clock by flying through an endless course of rings threaded between
// the towers, and circle up through the climb rings over the thermals.
import * as THREE from "three";
import { createWorld, createGlider, cityWind, type Glider } from "./glider";
import { prepareCity, type City, type CityId, type CityIndex } from "./citydata";
import { buildWorld, createBursts, createContrails, paperPlane, printPlane, type BuiltWorld } from "./world3d";
import { autopilot, assist, launchPoint, type PilotState } from "./pilot";
import { crossing, exitOf, nextGate, seeded, START_TIME, type Gate, type PickupKind } from "./course";
import { createSound, type Sound } from "./sound";

export interface SkyOptions {
  base: string;
  isStill: () => boolean;
}
export interface SkyControls {
  sync(): void;
  setCity(id: CityId): void;
  destroy(): void;
}

const STEP = 1 / 120;
const IDS: CityId[] = ["bengaluru", "delhi", "dubai"];
const COUNTDOWN = 3;
/** A gold ring pays its bonus only when crossed at least this fast (boost gets you there). */
const SPEED_RING_KMH = 110;
/** Seconds between rings before the combo multiplier lapses. */
const COMBO_WINDOW = 14;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function stored(key: string, value?: number) {
  try {
    if (value === undefined) return Number(localStorage.getItem(key)) || 0;
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* Best scores are a nicety; private windows can refuse storage. */
  }
  return value ?? 0;
}

const PICKUP_COLOURS: Record<PickupKind, number> = { boost: 0xffb02e, lift: 0x7cf0b8, time: 0x8fb4ff };
/** A glowing orb to collect: boost (amber), updraft (mint), time (blue). */
function pickupMesh(kind: PickupKind) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshBasicMaterial({ color: PICKUP_COLOURS[kind], fog: false }));
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(4.6, 1), new THREE.MeshBasicMaterial({ color: PICKUP_COLOURS[kind], transparent: true, opacity: 0.28, wireframe: true, fog: false }));
  group.add(core, halo);
  return group;
}
const disposeGroup = (o: THREE.Object3D) =>
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
  });

/** A ring to fly through: a bright core, a soft glow around it, and a faint film across it. */
function gateMesh(gate: Gate) {
  const climb = gate.kind === "climb";
  // Orange: fly through. Mint: climb or lift (an updraft). Gold: a speed ring.
  const colour = climb || gate.kind === "lift" ? 0x7cf0b8 : gate.kind === "speed" ? 0xffc83a : 0xff5a26;
  const tube = climb ? 2.2 : gate.kind === "ring" ? 1.2 : 1.6;
  const core = new THREE.Mesh(
    new THREE.TorusGeometry(gate.radius, tube, 12, climb ? 96 : 64),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95, toneMapped: false }),
  );
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(gate.radius, tube * 3.2, 10, climb ? 96 : 64),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  const film = new THREE.Mesh(
    new THREE.CircleGeometry(gate.radius - tube, 48),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  core.add(glow, film);
  core.position.set(gate.x, gate.y, gate.z);
  core.lookAt(gate.x + gate.nx, gate.y + gate.ny, gate.z + gate.nz);
  return core;
}

/** Cities are fetched and prepared once per page, whoever asks first. */
const cities = new Map<CityId, Promise<City>>();
function loadCity(base: string, id: CityId) {
  if (!cities.has(id))
    cities.set(
      id,
      fetch(`${base}assets/sky/${id}/index.json`).then(async (response) => {
        if (!response.ok) throw new Error(`City ${id} unavailable`);
        return prepareCity((await response.json()) as CityIndex);
      }),
    );
  const pending = cities.get(id)!;
  pending.catch(() => cities.delete(id));
  return pending;
}

/** Fetch and prepare the first city index and facade atlas while the visitor is still reading. */
export async function warmSky(base: string) {
  await loadCity(base, "dubai");
}

export function initSky(root: HTMLElement, options: SkyOptions): SkyControls | null {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-sky-canvas]");
  if (!canvas) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    root.classList.add("is-unsupported");
    return null;
  }
  // Error checks make three.js compile every shader synchronously; skip them.
  // `?skydebug` turns them back on (and exposes renderer stats) while working on the look.
  const debug = new URLSearchParams(location.search).has("skydebug");
  renderer.debug.checkShaderErrors = debug;
  const fixedRes = new URLSearchParams(location.search).has("fixedres");
  const small = matchMedia("(max-width: 700px)").matches;
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const software = /swiftshader|llvmpipe|software/i.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ""));
  // 2: shadows, reflective water and bloom; 1: none of those; 0: low resolution at 30 fps.
  let quality = software ? 0 : small ? 1 : 2;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  // While the page scrolls past, the city renders lighter; full quality is for playing.
  let mode: "attract" | "play" = "attract";
  // Resolution follows the frame rate: a slow GPU renders a little softer
  // rather than stuttering, and sharpens again when there is headroom.
  let baseRatio = 1;
  let renderScale = 1;
  let paceTime = 0;
  let paceFrames = 0;
  /** Never below one render pixel per CSS pixel (unless software rendering). */
  const applyRatio = () => renderer.setPixelRatio(software ? baseRatio * renderScale : Math.max(Math.min(1, devicePixelRatio || 1), baseRatio * renderScale));
  let grabs = 0;
  let slowWindows = 0;
  let fastWindows = 0;
  let warming = false;
  let built: BuiltWorld | null = null;
  const effective = () => (mode === "play" ? quality : Math.min(quality, 1));
  let night = document.documentElement.dataset.theme === "dark";
  const applyQuality = () => {
    const q = effective();
    // In play, phones get 2× (below that the city's thin lines, window bands, roads
    // and edges, alias and crawl on their dense screens) and desktops up to 1.75×.
    // Behind the page's text the city is softer and lighter: 1.25×.
    const maxDpr = mode === "play" ? (small ? 2 : 1.75) : 1.25;
    baseRatio = q === 0 ? 0.5 : Math.min(devicePixelRatio || 1, maxDpr);
    applyRatio();
    // Real sun shadows, building on building, when the machine can afford them.
    // At night the moon casts nothing worth the cost; that budget goes to the glow of the lights.
    renderer.shadowMap.enabled = q >= 2 && !night;
    if (built) built.sun.castShadow = renderer.shadowMap.enabled;
    built?.setQuality(q);
  };
  applyQuality();

  const scene = new THREE.Scene();
  if (debug) Object.assign(window, { skyRenderer: renderer, skyScene: scene });
  // A 4 m near plane: four times the depth precision of 1 m, so distant surfaces never fight.
  const camera = new THREE.PerspectiveCamera(62, 1, 4, 26000);
  const plane = paperPlane();
  printPlane(plane, options.base, renderer.capabilities.getMaxAnisotropy());
  scene.add(plane);
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const status = q("[data-sky-status]");
  const over = q("[data-sky-over]");
  const count = q("[data-sky-count]");
  const bonus = q("[data-sky-bonus]");
  const pointer = q("[data-sky-pointer]");
  const pointerDistance = q("[data-sky-pointer-distance]");
  const soundButton = q<HTMLButtonElement>("[data-sky-sound]");
  const meter = q("[data-sky-meter]");

  // Smooth tapering ribbon contrails from the wing tips
  const contrails = createContrails(96);
  scene.add(contrails.group);
  const bursts = createBursts();
  scene.add(bursts.points);
  let kick = 0; // a brief widening of the view when a ring is threaded
  // Postcards: fly close past a landmark to stamp it. A flight's stamps, and
  // every landmark ever stamped in this browser (the passport), per city.
  const stamped = new Set<string>();
  let labels: { name: string; sprite: THREE.Sprite }[] = [];
  type Spot = { name: string; x: number; z: number; height: number; radius: number };
  let spots: Spot[] = [];
  let labelTick = 0;
  let labelsDirty = true;

  let world = createWorld();
  let glider: Glider = createGlider(world);
  let city: City | null = null;
  let assisted = true;
  let crashed = 0;
  const pilotState: PilotState = { leg: 0, climbing: false };
  let distance = 0;
  let ringsPassed = 0;
  let clock = START_TIME;
  let countdown = 0;
  let flightTime = 0;
  let visible = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let elapsed = 0;
  let slowFrames = 0;
  let building = 0;
  let current: CityId = IDS.includes(root.dataset.city as CityId) ? (root.dataset.city as CityId) : "dubai";
  const keys = new Set<string>();
  const stick = { x: 0, y: 0, active: false, ox: 0, oy: 0 };
  const aim = { x: 0, y: 0, on: false };
  const input = { roll: 0, pitch: 0 };
  let sound: Sound | null = null;
  let muted = stored("sky-muted") === 1;

  // Boost, combos, near-miss skims and updrafts
  let boost = 0.7; // 0…1 of the booster's charge (a full tank lasts ~6 s)
  let boosting = false;
  let gust = 0; // seconds of updraft left
  let combo = 0;
  let comboTimer = 0;
  let ringPoints = 0;
  let skimCooldown = 0;
  let skimTick = 0;
  const BOOST_THRUST = 300; // newtons at low speed, tapering to nothing near 200 km/h
  const multiplier = () => Math.min(5, 1 + Math.floor(combo / 3));

  // The course
  let gates: { gate: Gate; mesh: THREE.Mesh; orb: THREE.Group | null }[] = [];
  let tail = { x: 0, y: 0, z: 0, heading: 0 };
  let tailFrom = { x: 0, z: 0 };
  let rand = seeded(1);

  const say = (text: string) => {
    if (status) status.textContent = text;
  };
  const score = () => ringPoints + Math.round(distance / 10);
  const flash = (text: string, kind: "good" | "bad" | "postcard" = "good") => {
    if (!bonus) return;
    bonus.textContent = text;
    bonus.dataset.kind = kind;
    bonus.classList.remove("is-shown");
    void bonus.offsetWidth;
    bonus.classList.add("is-shown");
  };

  const cityData = (id: CityId) => loadCity(options.base, id);

  const passportKey = (id: CityId) => `sky-passport-${id}`;
  function passport(id: CityId): string[] {
    try {
      return JSON.parse(localStorage.getItem(passportKey(id)) ?? "[]") as string[];
    } catch {
      return [];
    }
  }
  function addToPassport(id: CityId, name: string) {
    try {
      const all = new Set(passport(id));
      all.add(name);
      localStorage.setItem(passportKey(id), JSON.stringify([...all]));
    } catch {
      /* A private window may refuse; the flight still counts it. */
    }
  }
  /** A floating tag over every landmark not yet stamped on this flight. */
  function buildLabels() {
    labels.forEach(({ sprite }) => {
      scene.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    labels = [];
    if (!city) return;
    // Every 3D landmark, plus the named places the map knows: tombs, gates, temples, parks, stadiums.
    const seen = new Set<string>();
    spots = [...city.landmarks, ...(city.index.postcards ?? [])].filter((p) => !seen.has(p.name) && seen.add(p.name));
    for (const lm of spots) {
      const c = document.createElement("canvas");
      const g = c.getContext("2d")!;
      const text = lm.name.toUpperCase();
      g.font = "700 30px ui-monospace, Menlo, monospace";
      const w = Math.ceil(g.measureText(text).width) + 64;
      c.width = w;
      c.height = 52;
      g.fillStyle = "#ff4d1c";
      g.fillRect(0, 0, w, 52);
      g.fillStyle = "#0d0f1a";
      g.fillRect(0, 0, 40, 52);
      // A small envelope, drawn: canvas fonts may not carry the glyph.
      g.strokeStyle = "#fffaf0";
      g.lineWidth = 3;
      g.strokeRect(8, 16, 24, 18);
      g.beginPath();
      g.moveTo(8, 16);
      g.lineTo(20, 27);
      g.lineTo(32, 16);
      g.stroke();
      g.fillStyle = "#0d0f1a";
      g.font = "700 30px ui-monospace, Menlo, monospace";
      g.fillText(text, 52, 37);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true, toneMapped: false }));
      sprite.center.set(0.5, 0);
      sprite.scale.set((0.032 * w) / 52, 0.032, 1);
      sprite.position.set(lm.x, Math.min(Math.max(lm.height, 20), 600) + 30, lm.z);
      sprite.renderOrder = 8;
      sprite.visible = false;
      scene.add(sprite);
      labels.push({ name: lm.name, sprite });
    }
  }
  function nearestUnstamped(x: number, z: number) {
    if (!city) return null;
    let best: { x: number; z: number } | null = null;
    let bestD = 2600;
    for (const lm of spots) {
      if (stamped.has(lm.name)) continue;
      const d = Math.hypot(lm.x - x, lm.z - z);
      if (d < bestD) {
        bestD = d;
        best = { x: lm.x, z: lm.z };
      }
    }
    return best;
  }

  function buildPhysics() {
    if (!city) return;
    glider.destroy();
    world = createWorld();
    glider = createGlider(world);
    const air = cityWind(city.breeze, city.thermals, city.obstacles);
    // An updraft orb is a burst of rising air around the plane, nothing more.
    glider.setWind((p, out) => {
      air(p, out);
      if (gust > 0) out.y += 7 * Math.min(1, gust);
      if (mode === "play" && countdown <= 0) {
        // Turbulence: smooth, layered gusts, stronger near the ground and among
        // towers (where the air is churned), gentle up high.
        const t = elapsed;
        const low = 1 - Math.min(1, p.y / 220);
        const roofs = city ? Math.min(1, city.roofAt(p.x, p.z, 40) / Math.max(20, p.y)) : 0;
        const amp = 0.35 + 1.1 * low + 1.2 * roofs;
        out.x += amp * (Math.sin(p.x * 0.021 + t * 0.9) + 0.5 * Math.sin(p.z * 0.047 - t * 1.7));
        out.z += amp * (Math.sin(p.z * 0.019 + t * 1.1) + 0.5 * Math.sin(p.x * 0.043 + t * 1.9));
        out.y += amp * 0.6 * (Math.sin((p.x + p.z) * 0.033 + t * 1.3) + 0.4 * Math.sin(p.x * 0.09 - t * 2.6));
      }
      return out;
    });
  }

  async function buildScene() {
    if (!city) return;
    const ticket = ++building;
    const next = await buildWorld(city, renderer, options.base, night, effective());
    if (ticket !== building) {
      next.dispose();
      return;
    }
    const start = launchPoint(city);
    await next.ensureAround(start.x, start.z);
    if (ticket !== building) {
      next.dispose();
      return;
    }
    if (built) {
      scene.remove(built.group);
      built.dispose();
    }
    built = next;
    built.sun.castShadow = renderer.shadowMap.enabled;
    scene.add(built.group);
    buildLabels();
    scene.environment = built.environment;
    scene.environmentIntensity = built.environmentIntensity;
    // Shaders compile in parallel (KHR_parallel_shader_compile) instead of
    // stopping the page while it scrolls past.
    // It can never hold the city up: after 1.5 s the first frames compile what is left.
    // The loop pauses meanwhile, so nothing it would dispose is still being compiled.
    warming = true;
    await Promise.race([
      Promise.resolve()
        .then(() => renderer.compileAsync(scene, camera))
        .catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    warming = false;
    if (ticket !== building) return;
    resize();
  }

  /* ---------------- Course ---------------- */
  function dropGate(entry: (typeof gates)[number]) {
    scene.remove(entry.mesh);
    disposeGroup(entry.mesh);
    if (entry.orb) {
      scene.remove(entry.orb);
      disposeGroup(entry.orb);
    }
  }
  function clearGates() {
    gates.forEach(dropGate);
    gates = [];
  }
  function fillGates() {
    if (!city) return;
    const difficulty = Math.min(1, ringsPassed / 18);
    while (gates.length < 3) {
      for (const gate of nextGate(city, tail, rand, difficulty, nearestUnstamped(tail.x, tail.z))) {
        const mesh = gateMesh(gate);
        scene.add(mesh);
        let orb: THREE.Group | null = null;
        if (gate.pickup) {
          orb = pickupMesh(gate.pickup.kind);
          orb.position.set(gate.pickup.x, gate.pickup.y, gate.pickup.z);
          scene.add(orb);
        }
        gates.push({ gate, mesh, orb });
        tail = exitOf(gate, tailFrom);
        tailFrom = { x: gate.x, z: gate.z };
      }
    }
    // The next ring is bright; the ones after it wait, dimmer.
    gates.forEach(({ mesh }, i) => {
      (mesh.material as THREE.MeshBasicMaterial).opacity = i === 0 ? 0.95 : 0.35;
      mesh.scale.setScalar(i === 0 ? 1 : 0.9);
      mesh.children.forEach((c) => (c.visible = i === 0));
    });
  }
  function restartCourse() {
    clearGates();
    const p = glider.body.position;
    const v = glider.body.velocity;
    tail = { x: p.x, y: p.y, z: p.z, heading: Math.atan2(v.x, -v.z) };
    tailFrom = { x: p.x, z: p.z };
    fillGates();
  }

  function launch() {
    if (!city) return;
    const start = launchPoint(city);
    // cannon's yaw turns the nose left; headings here turn right.
    glider.launch(start.x, start.y, start.z, -start.heading, 20);
    crashed = 0;
    pilotState.leg = 0;
    pilotState.climbing = false;
    distance = 0;
    ringsPassed = 0;
    flightTime = 0;
    contrails.reset();
    clock = START_TIME;
    boost = 0.7;
    boosting = false;
    gust = 0;
    combo = 0;
    comboTimer = 0;
    ringPoints = 0;
    skimCooldown = 0;
    stamped.clear();
    labelsDirty = true;
    glider.controls.thrust = 0;
    root.dataset.skyState = "flying";
    if (over) over.hidden = true;
    clearGates();
    if (mode === "play") {
      rand = seeded(Math.floor(Math.random() * 1e9));
      tail = { x: start.x, y: start.y, z: start.z, heading: start.heading };
      tailFrom = { x: start.x, z: start.z };
      fillGates();
      countdown = COUNTDOWN;
    } else countdown = 0;
  }

  function crash(cause: string) {
    crashed = elapsed || 0.001;
    root.dataset.skyState = "landed";
    sound?.land();
    if (mode !== "play" || !city) return;
    const key = `sky-best-${city.data.id}`;
    const best = Math.max(stored(key), score());
    stored(key, best);
    if (over) {
      const set = (name: string, text: string) => {
        const el = over.querySelector(`[data-over="${name}"]`);
        if (el) el.textContent = text;
      };
      set("cause", cause);
      set("score", String(score()));
      set("rings", String(ringsPassed));
      set("distance", `${(distance / 1000).toFixed(1)} km`);
      set("time", `${Math.floor(flightTime / 60)}:${String(Math.floor(flightTime % 60)).padStart(2, "0")}`);
      set("best", String(best));
      const total = spots.length;
      const kept = passport(city.data.id);
      set("postcards", `${stamped.size}/${total}`);
      const stampsEl = over.querySelector<HTMLElement>('[data-over="stamps"]');
      if (stampsEl) {
        stampsEl.replaceChildren();
        if (kept.length) {
          stampsEl.append(`In your passport (${kept.length}/${total}): `);
          kept.forEach((name, i) => {
            const b = document.createElement(stamped.has(name) ? "b" : "span");
            b.textContent = name;
            stampsEl.append(i ? " · " : "", b);
          });
        }
      }
      over.hidden = false;
      over.querySelector<HTMLButtonElement>("[data-sky-relaunch]")?.focus();
    }
    say(`${cause}. Score ${score()}. Press R or Space to fly again.`);
  }

  async function setCity(id: CityId) {
    current = id;
    root.dataset.city = id;
    root.querySelectorAll<HTMLButtonElement>("[data-city]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.city === id)));
    root.classList.add("is-loading");
    try {
      const next = await cityData(id);
      if (current !== id) return;
      city = next;
      buildPhysics();
      await buildScene();
      if (current !== id) return;
      launch();
      if (mode === "attract") for (let i = 0; i < 120; i++) physics(STEP); // settle into trimmed glide right in front of the skyline
      else void prepareFlight();
      root.classList.remove("is-loading");
      root.classList.add("is-ready");
      say(`Flying over ${next.data.name}.`);
      render();
      start();
    } catch {
      root.classList.remove("is-loading");
      root.classList.add("is-unsupported");
    }
  }

  /* ---------------- Control ---------------- */
  function readInput() {
    const up = keys.has("ArrowUp") || keys.has("w");
    const down = keys.has("ArrowDown") || keys.has("s");
    const left = keys.has("ArrowLeft") || keys.has("a");
    const right = keys.has("ArrowRight") || keys.has("d");
    const keyed = up || down || left || right;
    // Keys win; then a finger or mouse drag; then where the mouse is aiming.
    const wantRoll = keyed ? (right ? 1 : 0) - (left ? 1 : 0) : stick.active ? stick.x : aim.on ? aim.x : 0;
    const wantPitch = keyed ? (up ? 1 : 0) - (down ? 1 : 0) : stick.active ? -stick.y : aim.on ? -aim.y : 0;
    // Smooth the stick a little so keys feel like a hand, not a switch.
    input.roll += (clamp(wantRoll, -1, 1) - input.roll) * 0.1;
    input.pitch += (clamp(wantPitch, -1, 1) - input.pitch) * 0.1;
    const firing = (keys.has(" ") || keys.has("Shift") || boostHeld) && boost > 0;
    if (assisted) assist(glider, input, firing);
    else {
      glider.controls.roll = input.roll;
      glider.controls.pitch = input.pitch * 0.8;
    }
    // A booster's push fades as airspeed builds (like a propeller's), so the dash
    // tops out around 200 km/h instead of running away.
    glider.controls.thrust = firing ? BOOST_THRUST * Math.max(0, 1 - glider.telemetry.airspeed / 58) : 0;
    if (firing && !boosting) sound?.boost(true);
    if (!firing && boosting) sound?.boost(false);
    boosting = firing;
  }

  /* ---------------- Loop ---------------- */
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camUp = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const planeUp = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const prevQuat = new THREE.Quaternion();
  const shadowAt = new THREE.Vector3();
  const lightX = new THREE.Vector3();
  const lightY = new THREE.Vector3();
  const lightZ = new THREE.Vector3();

  function physics(dt: number) {
    if (!city) return;
    if (crashed) {
      if (mode === "attract" && elapsed - crashed > 1.5) launch();
      return;
    }
    if (countdown > 0) {
      // Hold on the launch line until "Fly".
      countdown -= dt;
      if (countdown <= 0) {
        const start = launchPoint(city);
        glider.launch(start.x, start.y, start.z, -start.heading, 20);
      }
      return;
    }
    if (mode === "attract") autopilot(glider, city, pilotState);
    else readInput();
    prev.set(glider.body.position.x, glider.body.position.y, glider.body.position.z);
    world.step(dt);
    flightTime += dt;
    const p = glider.body.position;
    distance += Math.hypot(p.x - prev.x, p.z - prev.z);
    // Collisions: the nose and both wing tips against real footprints, then the ground.
    syncPlane();
    for (const [x, y, z] of [[0, 0, -2.4], [-1.8, 0.15, 1.4], [1.8, 0.15, 1.4]]) {
      probe.set(x, y, z).applyQuaternion(plane.quaternion).add(plane.position);
      if (city.hits(probe.x, probe.y, probe.z)) return crash("Hit a building");
    }
    if (p.y < 0.8) return crash(city.isWater(p.x, p.z) ? "Splashed down" : "Touched down");
    if (Math.abs(p.x) > city.data.half[0] + 1500 || Math.abs(p.z) > city.data.half[1] + 1500) return crash("Flew off the map");
    if (mode !== "play") return;
    if (boosting) boost = Math.max(0, boost - dt * 0.16);
    gust = Math.max(0, gust - dt);
    if (combo > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) {
        combo = 0;
        flash("Combo lapsed", "bad");
      }
    }
    skimCooldown = Math.max(0, skimCooldown - dt);
    // Risk-reward near-miss (checked at 10 Hz): skimming within 14 m of a taller skyscraper awards points & boost!
    if (++skimTick >= 12) {
      skimTick = 0;
      for (const lm of spots) {
        if (stamped.has(lm.name)) continue;
        if (Math.hypot(p.x - lm.x, p.z - lm.z) < lm.radius + 70 && p.y < lm.height + 130) {
          stamped.add(lm.name);
          labelsDirty = true;
          addToPassport(city.data.id, lm.name);
          const pts = 250 * multiplier();
          ringPoints += pts;
          clock += 4;
          boost = Math.min(1, boost + 0.25);
          sound?.ring(true);
          bursts.emit(plane.position, tmpN.set(0, 1, 0), 6, 0xffd25a, 120);
          kick = 1;
          flash(`✉ Postcard: ${lm.name}  +${pts}  +4s`, "postcard");
          say(`Postcard stamped: ${lm.name}.`);
        }
      }
      if (skimCooldown <= 0 && p.y > 12 && city.roofAt(p.x, p.z, 14) > p.y + 4) {
        skimCooldown = 2.5;
        const pts = 75 * multiplier();
        ringPoints += pts;
        boost = Math.min(1, boost + 0.14);
        sound?.pickup("boost");
        flash(`Close shave! +${pts}`);
      }
    }
    clock -= dt;
    if (clock <= 0) {
      clock = 0;
      return crash("Out of time");
    }
    const head = gates[0];
    if (!head) return;
    // Pickups: fly within a few metres of the orb.
    const pick = head.gate.pickup;
    if (pick && head.orb && Math.hypot(p.x - pick.x, p.y - pick.y, p.z - pick.z) < 11) {
      scene.remove(head.orb);
      disposeGroup(head.orb);
      head.orb = null;
      sound?.pickup(pick.kind);
      if (pick.kind === "boost") {
        boost = Math.min(1, boost + 0.5);
        flash("Boost charged");
      } else if (pick.kind === "lift") {
        gust = 3.5;
        flash("Updraft!");
      } else {
        clock += 5;
        flash("+5s");
      }
    }
    const result = crossing(head.gate, prev, p);
    const strayed = head.gate.kind === "climb" && Math.hypot(p.x - head.gate.x, p.z - head.gate.z) > 650;
    if (result === "through" || result === "perfect") {
      const perfect = result === "perfect";
      const kmh = glider.telemetry.airspeed * 3.6;
      const fast = head.gate.kind === "speed" && kmh >= SPEED_RING_KMH;
      ringsPassed++;
      combo++;
      comboTimer = COMBO_WINDOW;
      const extra = (perfect ? 2 : 0) + (fast ? 3 : 0);
      clock += head.gate.bonus + extra;
      ringPoints += (100 + (perfect ? 50 : 0) + (fast ? 200 : 0)) * multiplier();
      boost = Math.min(1, boost + (perfect ? 0.3 : 0.15));
      // A lift ring is a gift of height: a strong updraft for a few seconds.
      if (head.gate.kind === "lift") gust = Math.max(gust, 4.5);
      sound?.ring(head.gate.kind === "climb" || perfect || fast);
      bursts.emit(head.mesh.position, tmpN.set(head.gate.nx, head.gate.ny, head.gate.nz), head.gate.radius, perfect || fast ? 0xffd25a : head.gate.kind === "climb" || head.gate.kind === "lift" ? 0x7cf0b8 : 0xff6a30, perfect || fast ? 140 : 90);
      kick = perfect ? 1 : 0.6;
      const label = head.gate.kind === "lift" ? "Updraft! " : head.gate.kind === "speed" ? (fast ? `Speed ${Math.round(kmh)} km/h! ` : `Too slow (${SPEED_RING_KMH}+ km/h) `) : perfect ? "Perfect! " : "";
      flash(`${label}+${head.gate.bonus + extra}s${multiplier() > 1 ? `  ×${multiplier()}` : ""}`);
      dropGate(head);
      gates.shift();
      fillGates();
    } else if (result === "missed" || strayed) {
      sound?.miss();
      combo = 0;
      clock = Math.max(5, clock - 3);
      flash("Missed  −3s", "bad");
      restartCourse();
    }
  }

  function syncPlane() {
    const b = glider.body;
    plane.position.set(b.position.x, b.position.y, b.position.z);
    plane.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  }

  function updateTrails() {
    contrails.update(plane, boosting);
  }

  const camSide = new THREE.Vector3();
  const camWantPos = new THREE.Vector3();
  const camWantLook = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const camTargetUp = new THREE.Vector3();

  function updateCamera(snap = false, dt = 1 / 60) {
    // Smoothing by time, not by frame, so the camera feels the same at any frame rate.
    const ease = (rate: number) => 1 - Math.exp(-rate * dt);
    const forward = tmp.set(0, 0, -1).applyQuaternion(plane.quaternion);
    forward.y *= 0.35;
    forward.normalize();
    const attract = mode === "attract";
    camSide.set(-forward.z, 0, forward.x);
    const swing = attract ? Math.sin(elapsed * 0.06) * 0.7 : 0;
    // Hands off, the plane sits in the right third, clear of the words.
    const frameRight = attract && root.clientWidth > 900 ? 1 : 0;
    const speed = glider.telemetry.airspeed;
    const back = attract ? -15 : -11 - Math.max(0, speed - 20) * 0.12;
    camWantPos
      .copy(plane.position)
      .addScaledVector(forward, back)
      .addScaledVector(camSide, swing * 8 - frameRight * 4);
    camWantPos.y += attract ? 4 : 3;
    // Subtle camera shake when firing the booster
    if (boosting && !crashed && !attract) {
      const amp = 0.14;
      camWantPos.x += Math.sin(elapsed * 53) * amp;
      camWantPos.y += Math.cos(elapsed * 67) * amp;
    }
    camWantLook
      .copy(plane.position)
      .addScaledVector(forward, 16)
      .addScaledVector(camSide, -frameRight * 9);
    camWantLook.y -= 1;
    if (snap) {
      camPos.copy(camWantPos);
      camLook.copy(camWantLook);
    } else {
      camPos.lerp(camWantPos, ease(attract ? 5 : 10));
      camLook.lerp(camWantLook, ease(14));
    }
    // Lean into turns: the camera banks with the plane, a little less than it does.
    planeUp.set(0, 1, 0).applyQuaternion(plane.quaternion);
    camTargetUp.copy(worldUp).lerp(planeUp, attract ? 0.15 : 0.45);
    camUp.lerp(camTargetUp, ease(5)).normalize();
    camera.up.copy(camUp);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // Speed widens the view.
    kick = Math.max(0, kick - dt * 1.8);
    const fov = clamp(60 + (speed - 20) * 0.6 + (boosting ? 8 : 0), 56, 88) + kick * 7 + (root.clientWidth < root.clientHeight ? 12 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * ease(5);
      camera.updateProjectionMatrix();
    }
    if (built) {
      // The shadow map covers the ground ahead of the plane, where the eye is. Its
      // centre moves in whole shadow texels so the edges do not crawl.
      shadowAt.copy(plane.position).addScaledVector(forward.setY(0).normalize(), 160);
      shadowAt.y = 0;
      // Snap in the light's own frame: whole texels across and up the shadow map.
      const texel = 680 / 2048;
      lightZ.copy(built.sunDirection).normalize();
      lightX.set(0, 1, 0).cross(lightZ).normalize();
      lightY.copy(lightZ).cross(lightX);
      const ax = Math.round(shadowAt.dot(lightX) / texel) * texel;
      const ay = Math.round(shadowAt.dot(lightY) / texel) * texel;
      const az = shadowAt.dot(lightZ);
      shadowAt.copy(lightX).multiplyScalar(ax).addScaledVector(lightY, ay).addScaledVector(lightZ, az);
      built.sun.target.position.copy(shadowAt);
      built.sun.position.copy(shadowAt).addScaledVector(built.sunDirection, 1200);
      built.sun.target.updateMatrixWorld();
    }
  }

  const screen = new THREE.Vector3();
  function updatePointer() {
    const head = gates[0];
    if (!pointer || !head || mode !== "play" || crashed) {
      if (pointer) pointer.hidden = true;
      return;
    }
    pointer.hidden = false;
    screen.set(head.gate.x, head.gate.y, head.gate.z).project(camera);
    const behind = screen.z > 1;
    let x = screen.x;
    let y = screen.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const onScreen = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
    pointer.dataset.mode = onScreen ? "on" : "edge";
    if (!onScreen) {
      const scale = 0.88 / Math.max(Math.abs(x), Math.abs(y) / 0.95, 0.0001);
      x *= scale;
      y *= scale;
    }
    const w = root.clientWidth;
    const h = root.clientHeight;
    const angle = Math.atan2(-y, x);
    pointer.style.transform = `translate(${((x + 1) / 2) * w}px, ${((1 - y) / 2) * h}px)`;
    pointer.style.setProperty("--angle", `${angle}rad`);
    const p = glider.body.position;
    const metres = Math.hypot(head.gate.x - p.x, head.gate.y - p.y, head.gate.z - p.z);
    if (pointerDistance) pointerDistance.textContent = head.gate.kind === "climb" ? `Climb to ${Math.round(head.gate.y)} m` : `${Math.round(metres)} m`;
    pointer.dataset.kind = head.gate.kind;
  }

  function updateHud() {
    const t = glider.telemetry;
    const set = (name: string, text: string) => {
      const el = q(`[data-hud="${name}"]`);
      if (el && el.textContent !== text) el.textContent = text;
    };
    set("time", `${Math.ceil(clock)}`);
    set("score", `${score()}`);
    set("rings", `${ringsPassed}`);
    const holding = countdown > 0;
    set("speed", `${holding ? 72 : Math.round(t.airspeed * 3.6)}`);
    set("alt", `${Math.max(0, Math.round(holding ? glider.body.position.y : t.altitude))}`);
    set("vario", `${t.vario >= 0 ? "+" : "−"}${Math.abs(t.vario).toFixed(1)}`);
    root.classList.toggle("is-rising", t.vario > 0.3 && !crashed && countdown <= 0);
    root.classList.toggle("is-stalling", t.stalled && !crashed);
    root.classList.toggle("is-hurry", mode === "play" && clock < 10 && !crashed);
    root.classList.toggle("is-boosting", boosting && !crashed);
    root.classList.toggle("is-gusting", gust > 0 && !crashed);
    if (meter) meter.style.setProperty("--charge", boost.toFixed(3));
    set("combo", `×${multiplier()}`);
    if (count) {
      const n = Math.ceil(countdown);
      const text = countdown > 0 ? String(n) : countdown > -0.6 && mode === "play" && flightTime < 0.8 ? "Fly!" : "";
      if (count.textContent !== text) count.textContent = text;
      count.hidden = !text;
    }
    if (mode === "play" && !crashed && countdown <= 0) sound?.wind(t.airspeed);
  }

  function render() {
    renderer.shadowMap.needsUpdate = true;
    syncPlane();
    updateCamera(true);
    built?.update(elapsed);
    if (built) built.render(scene, camera);
    else renderer.render(scene, camera);
  }

  const cpu: number[] = [];
  function loop(now: number) {
    const began = performance.now();
    frameBody(now);
    if (debug) {
      cpu.push(performance.now() - began);
      if (cpu.length > 600) cpu.shift();
    }
  }
  function frameBody(now: number) {
    frame = 0;
    if (warming) {
      last = 0;
      frame = requestAnimationFrame(loop);
      return;
    }
    if (!visible || document.hidden || options.isStill() || !city) {
      last = 0;
      return;
    }
    const raw = last ? (now - last) / 1000 : STEP;
    // At the lowest quality, and while the city only plays behind the page's
    // words, draw at most 30 frames a second: the website stays light.
    if ((quality === 0 || mode === "attract") && last && raw < 1 / 40) {
      frame = requestAnimationFrame(loop);
      return;
    }
    last = now;
    // Step quality down when frames are consistently slow.
    slowFrames = mode === "play" && raw > 1 / 38 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    // A real GPU steps down to 1 at most; 0 (no ground textures, half resolution) is for software renderers.
    if (slowFrames > 90 && quality > (software ? 0 : 1) && renderScale <= 0.62) {
      quality--;
      slowFrames = 0;
      applyQuality();
      resize();
    }
    paceTime += raw;
    paceFrames++;
    // Only in play: behind the page the city is capped at 30 fps on purpose,
    // which must not read as "too slow" (that resized the canvas over and over).
    if (mode !== "play") paceTime = paceFrames = 0;
    if (paceTime > 2 && !fixedRes) {
      // A resize reallocates buffers (a hitch of its own), so it happens rarely:
      // down after two slow windows in a row, up only after ten seconds of headroom.
      const avg = paceTime / paceFrames;
      slowWindows = avg > 1 / 48 ? slowWindows + 1 : 0;
      fastWindows = avg < 1 / 58 ? fastWindows + 1 : 0;
      let next = renderScale;
      if (slowWindows >= 2) {
        next = Math.max(0.75, renderScale * 0.88);
        slowWindows = 0;
      }
      // Never sharpens mid-flight: a visible jump in sharpness reads as a flicker.
      // The resolution chosen while loading stands unless frames are really slow.
      paceTime = paceFrames = 0;
      if (Math.abs(next - renderScale) > 0.01) {
        renderScale = next;
        applyRatio();
        resize();
      }
    }
    acc += Math.min(raw, 0.05);
    while (acc >= STEP) {
      prevPos.set(glider.body.position.x, glider.body.position.y, glider.body.position.z);
      prevQuat.set(glider.body.quaternion.x, glider.body.quaternion.y, glider.body.quaternion.z, glider.body.quaternion.w);
      physics(STEP);
      elapsed += STEP;
      acc -= STEP;
    }
    syncPlane();
    // Physics ticks at 120 Hz, frames at whatever the screen does: show the plane
    // between its last two states, so it glides instead of stepping unevenly.
    if (prevPos.distanceToSquared(plane.position) < 2500) {
      const t = acc / STEP;
      plane.position.lerpVectors(prevPos, plane.position, t);
      plane.quaternion.copy(prevQuat.slerp(plane.quaternion, t));
    }
    if (!crashed && countdown <= 0) updateTrails();
    updateCamera(false, Math.min(raw, 0.1));
    built?.updateStream(glider.body.position.x, glider.body.position.z);
    gates.forEach(({ mesh, gate, orb }, i) => {
      mesh.rotation.z = gate.kind === "climb" ? elapsed * 0.15 : elapsed * 0.4 + i;
      if (orb) {
        orb.rotation.set(elapsed * 1.3, elapsed * 0.9, 0);
        orb.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.08);
      }
    });
    built?.update(elapsed);
    bursts.update(Math.min(raw, 0.05));
    // Tags for the five nearest unstamped places within reach, so the sky never fills with labels.
    if (++labelTick % 15 === 0 || labelsDirty) {
      labelsDirty = false;
      const near = labels
        .filter(({ name, sprite }) => mode === "play" && !crashed && !stamped.has(name) && sprite.position.distanceToSquared(plane.position) < 1800 * 1800)
        .sort((a, b) => a.sprite.position.distanceToSquared(plane.position) - b.sprite.position.distanceToSquared(plane.position))
        .slice(0, 5);
      for (const l of labels) l.sprite.visible = near.includes(l);
    }
    updateHud();
    updatePointer();
    renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
    if (built) built.render(scene, camera);
    else renderer.render(scene, camera);
    // Debug only: grab consecutive frames, read straight after drawing.
    if (debug && grabs > 0) {
      grabs--;
      (window as unknown as { skyFrames: string[] }).skyFrames.push(canvas!.toDataURL("image/png"));
    }
    frame = requestAnimationFrame(loop);
  }
  function start() {
    if (!frame && visible && !options.isStill() && !document.hidden && city) frame = requestAnimationFrame(loop);
  }

  /* ---------------- Size, visibility, input ---------------- */
  function resize() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    built?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!frame && city) render();
  }
  const sizes = new ResizeObserver(resize);
  sizes.observe(root);
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start();
  });
  seen.observe(root);

  /**
   * Before a flight: the whole ring of tiles at full detail, every shader
   * compiled and the night glow warmed up, behind a progress bar. Then the
   * countdown starts and nothing loads or compiles mid-flight.
   */
  const progressBar = q("[data-sky-progress]");
  const progressLabel = q("[data-sky-loading-label]");
  let preparing = 0;
  async function prepareFlight() {
    if (!built || !city) return;
    const ticket = ++preparing;
    const world = built;
    root.classList.add("is-preparing");
    if (progressLabel) progressLabel.textContent = `Preparing ${city.data.name}…`;
    const show = (f: number) => progressBar?.style.setProperty("--progress", (0.1 + f * 0.75).toFixed(3));
    show(0);
    warming = true;
    const start = launchPoint(city);
    await world.prepare(start.x, start.z, show);
    if (ticket !== preparing || world !== built) return;
    show(1);
    await Promise.race([
      Promise.resolve()
        .then(() => renderer.compileAsync(scene, camera))
        .catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    if (ticket !== preparing || world !== built) return;
    // Frames drawn behind the bar: the first compiles anything left and warms the
    // glow pipeline; the rest time this GPU on this city, so flight starts at a
    // resolution that holds 60 fps instead of discovering it by stuttering.
    syncPlane();
    updateCamera(true);
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    const timeFrame = () => {
      const t = performance.now();
      renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
      world.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // waits for the GPU
      return performance.now() - t;
    };
    timeFrame();
    if (!fixedRes && !software) {
      renderScale = 1;
      applyRatio();
      resize();
      const times = [timeFrame(), timeFrame(), timeFrame(), timeFrame(), timeFrame()].sort((a, b) => a - b);
      const ms = times[2];
      // Cost scales with pixels: aim for ~12 ms of GPU time per frame.
      renderScale = Math.max(0.75, Math.min(1, Math.sqrt(14 / Math.max(ms, 1))));
      applyRatio();
      resize();
      paceTime = paceFrames = slowWindows = fastWindows = 0;
    }
    progressBar?.style.setProperty("--progress", "1");
    warming = false;
    root.classList.remove("is-preparing");
    if (progressLabel) progressLabel.textContent = "Loading the city…";
    launch();
  }

  function setMode(next: "attract" | "play") {
    mode = next;
    if (next !== "play" && preparing) {
      preparing++;
      warming = false;
      root.classList.remove("is-preparing");
    }
    root.dataset.skyMode = next;
    window.dispatchEvent(new CustomEvent("sky-play", { detail: next === "play" }));
    keys.clear();
    stick.active = false;
    aim.on = false;
    input.roll = input.pitch = 0;
    if (next === "play") {
      sound ??= createSound();
      sound?.setMuted(muted);
    } else sound?.wind(0);
    applyQuality();
    launch();
    if (next === "play") void prepareFlight();
    if (next === "play") {
      say(`You have the controls over ${city?.data.name ?? "the city"}. Fly through the rings before the clock runs out. Arrow keys or WASD, or aim with the mouse. Hold Space to boost, R to relaunch, Escape to land.`);
      q("[data-sky-exit]")?.focus();
    } else say("");
    requestAnimationFrame(resize);
  }
  const onKey = (event: KeyboardEvent) => {
    if (mode !== "play") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (event.type === "keydown") {
      if (key === "Escape") return setMode("attract");
      if (key === "r" || (key === " " && crashed)) {
        event.preventDefault();
        launch();
        return;
      }
      if (key === "m") return toggleSound();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)) event.preventDefault();
      keys.add(key);
    } else keys.delete(key);
  };
  const down = (event: PointerEvent) => {
    if (mode !== "play" || event.target !== canvas || event.pointerType === "mouse") return;
    stick.active = true;
    stick.ox = event.clientX;
    stick.oy = event.clientY;
    stick.x = stick.y = 0;
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (stick.active) {
      const reach = Math.min(innerWidth, innerHeight) * 0.18;
      stick.x = clamp((event.clientX - stick.ox) / reach, -1, 1);
      stick.y = clamp((event.clientY - stick.oy) / reach, -1, 1);
      return;
    }
    if (event.pointerType !== "mouse" || mode !== "play") return;
    // Mouse aim: the further from the centre, the harder the turn or climb.
    const box = canvas.getBoundingClientRect();
    const reach = Math.min(box.width, box.height) * 0.32;
    const dx = (event.clientX - box.left - box.width / 2) / reach;
    const dy = (event.clientY - box.top - box.height / 2) / reach;
    const dead = (v: number) => (Math.abs(v) < 0.08 ? 0 : clamp(v - Math.sign(v) * 0.08, -1, 1));
    aim.x = dead(dx);
    aim.y = dead(dy);
    aim.on = true;
  };
  const up = () => {
    stick.active = false;
  };
  const leave = () => {
    aim.on = false;
  };
  // The on-screen boost button, and the right mouse button, fire the booster while held.
  let boostHeld = false;
  const boostButton = q<HTMLButtonElement>("[data-sky-boost]");
  const holdBoost = (on: boolean) => (event: Event) => {
    if (on) event.preventDefault();
    boostHeld = on;
  };
  boostButton?.addEventListener("pointerdown", holdBoost(true));
  boostButton?.addEventListener("pointerup", holdBoost(false));
  boostButton?.addEventListener("pointerleave", holdBoost(false));
  boostButton?.addEventListener("pointercancel", holdBoost(false));
  canvas.addEventListener("contextmenu", (event) => mode === "play" && event.preventDefault());
  canvas.addEventListener("mousedown", (event) => event.button === 2 && mode === "play" && (boostHeld = true));
  canvas.addEventListener("mouseup", (event) => event.button === 2 && (boostHeld = false));
  function toggleSound() {
    muted = !muted;
    stored("sky-muted", muted ? 1 : 0);
    sound?.setMuted(muted);
    if (soundButton) {
      soundButton.setAttribute("aria-pressed", String(!muted));
      soundButton.textContent = muted ? "Sound off" : "Sound on";
    }
  }
  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
    if (!target || !root.contains(target)) return;
    if (target.dataset.city) void setCity(target.dataset.city as CityId);
    if (target.hasAttribute("data-sky-play")) {
      // Show the progress bar first, then do the heavy switch once it has painted.
      root.classList.add("is-preparing");
      progressBar?.style.setProperty("--progress", "0.04");
      if (progressLabel && city) progressLabel.textContent = `Preparing ${city.data.name}…`;
      requestAnimationFrame(() => setTimeout(() => setMode("play"), 0));
    }
    if (target.hasAttribute("data-sky-exit")) setMode("attract");
    if (target.hasAttribute("data-sky-relaunch")) launch();
    if (target.hasAttribute("data-sky-sound")) toggleSound();
    if (target.hasAttribute("data-sky-assist")) {
      assisted = !assisted;
      target.setAttribute("aria-pressed", String(assisted));
      target.textContent = `Assist ${assisted ? "on" : "off"}`;
      say(assisted ? "Assist on: up climbs, down dives, let go to level out." : "Assist off: the stick moves the elevons directly.");
    }
  };
  const theme = () => {
    night = document.documentElement.dataset.theme === "dark";
    built?.setNight(night);
    applyQuality();
    if (built) {
      scene.environment = built.environment;
      scene.environmentIntensity = built.environmentIntensity;
    }
    if (city && !frame) render();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    root.classList.add("is-unsupported");
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", contextLost);
  root.addEventListener("click", click);
  window.addEventListener("portfolio-theme-change", theme);
  document.addEventListener("visibilitychange", start);
  if (soundButton) {
    soundButton.setAttribute("aria-pressed", String(!muted));
    soundButton.textContent = muted ? "Sound off" : "Sound on";
  }

  if (debug) {
    Object.assign(window, {
      skyDebug: {
        landmarks: () => city?.landmarks ?? [],
        cpu: () => {
          const sorted = [...cpu].sort((a, b) => a - b);
          return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) };
        },
        grab: (n: number) => {
          (window as unknown as { skyFrames: string[] }).skyFrames = [];
          grabs = n;
        },
        place: (x: number, y: number, z: number, heading: number) => {
          countdown = 0;
          glider.launch(x, y, z, -heading, 22);
          contrails.reset();
        },
      },
    });
  }

  void setCity(current);

  return {
    sync() {
      if (options.isStill()) {
        cancelAnimationFrame(frame);
        frame = 0;
        if (city) render();
      } else start();
    },
    setCity: (id) => void setCity(id),
    destroy() {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      seen.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      root.removeEventListener("click", click);
      window.removeEventListener("portfolio-theme-change", theme);
      document.removeEventListener("visibilitychange", start);
      if (mode === "play") window.dispatchEvent(new CustomEvent("sky-play", { detail: false }));
      sound?.stop();
      clearGates();
      contrails.dispose();
      bursts.dispose();
      labels.forEach(({ sprite }) => {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      });
      built?.dispose();
      renderer.dispose();
    },
  };
}
