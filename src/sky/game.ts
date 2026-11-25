// The last chapter's stage: the paper plane glides over a real city. Hands off,
// an autopilot hops between thermals. Take the controls and it is a game:
// beat the clock by flying through an endless course of rings threaded between
// the towers, and circle up through the climb rings over the thermals.
import * as THREE from "three";
import { createWorld, createGlider, cityWind, type Glider } from "./glider";
import { prepareCity, type City, type CityFile, type CityId } from "./citydata";
import { buildWorld, loadFacades, paperPlane, type BuiltWorld } from "./world3d";
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

function gateMesh(gate: Gate) {
  const climb = gate.kind === "climb";
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(gate.radius, climb ? 2.2 : 1.1, 12, climb ? 96 : 56),
    new THREE.MeshBasicMaterial({ color: climb ? 0x7cf0b8 : 0xff4d1c, transparent: true, opacity: 0.95, fog: false }),
  );
  mesh.position.set(gate.x, gate.y, gate.z);
  mesh.lookAt(gate.x + gate.nx, gate.y + gate.ny, gate.z + gate.nz);
  return mesh;
}

/** Cities are fetched and prepared once per page, whoever asks first. */
const cities = new Map<CityId, Promise<City>>();
function loadCity(base: string, id: CityId) {
  if (!cities.has(id))
    cities.set(
      id,
      fetch(`${base}assets/sky/${id}.json`).then(async (response) => {
        if (!response.ok) throw new Error(`City ${id} unavailable`);
        return prepareCity((await response.json()) as CityFile);
      }),
    );
  const pending = cities.get(id)!;
  pending.catch(() => cities.delete(id));
  return pending;
}

/** Fetch and prepare the first city and its facades while the visitor is still reading. */
export async function warmSky(base: string) {
  await Promise.all([loadCity(base, "dubai"), loadFacades(base, 8)]);
}

export function initSky(root: HTMLElement, options: SkyOptions): SkyControls | null {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-sky-canvas]");
  if (!canvas) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
  } catch {
    root.classList.add("is-unsupported");
    return null;
  }
  // Error checks make three.js compile every shader synchronously; skip them.
  renderer.debug.checkShaderErrors = false;
  const small = matchMedia("(max-width: 700px)").matches;
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const software = /swiftshader|llvmpipe|software/i.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ""));
  // 2: shadows, reflective water and bloom; 1: none of those; 0: low resolution at 30 fps.
  let quality = software ? 0 : small ? 1 : 2;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // While the page scrolls past, the city renders lighter; full quality is for playing.
  let mode: "attract" | "play" = "attract";
  const effective = () => (mode === "play" ? quality : Math.min(quality, 1));
  const applyQuality = () => {
    const q = effective();
    renderer.setPixelRatio(q === 0 ? 0.75 : Math.min(devicePixelRatio || 1, q === 1 ? 1.25 : 1.75));
    renderer.shadowMap.enabled = q === 2;
  };
  applyQuality();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 30000);
  const plane = paperPlane();
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

  // Contrails from the wing tips
  const TRAIL = 160;
  const trails = [0, 1].map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    line.frustumCulled = false;
    scene.add(line);
    return line;
  });
  let trailCount = 0;

  let world = createWorld();
  let glider: Glider = createGlider(world);
  let city: City | null = null;
  let built: BuiltWorld | null = null;
  let assisted = true;
  let crashed = 0;
  const pilotState: PilotState = { leg: 0, climbing: false };
  let distance = 0;
  let ringsPassed = 0;
  let clock = START_TIME;
  let countdown = 0;
  let flightTime = 0;
  let night = document.documentElement.dataset.theme === "dark";
  let visible = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let elapsed = 0;
  let slowFrames = 0;
  let building = 0;
  let builtQuality = -1;
  let current: CityId = IDS.includes(root.dataset.city as CityId) ? (root.dataset.city as CityId) : "dubai";
  const keys = new Set<string>();
  const stick = { x: 0, y: 0, active: false, ox: 0, oy: 0 };
  const aim = { x: 0, y: 0, on: false };
  const input = { roll: 0, pitch: 0 };
  let sound: Sound | null = null;
  let muted = stored("sky-muted") === 1;

  // Boost, combos and updrafts
  let boost = 0.5; // 0…1 of the booster's charge
  let boosting = false;
  let gust = 0; // seconds of updraft left
  let combo = 0;
  let ringPoints = 0;
  const BOOST_THRUST = 230; // newtons
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
  const flash = (text: string, kind: "good" | "bad" = "good") => {
    if (!bonus) return;
    bonus.textContent = text;
    bonus.dataset.kind = kind;
    bonus.classList.remove("is-shown");
    void bonus.offsetWidth;
    bonus.classList.add("is-shown");
  };

  const cityData = (id: CityId) => loadCity(options.base, id);

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
      return out;
    });
  }

  async function buildScene() {
    if (!city) return;
    const ticket = ++building;
    const facades = await loadFacades(options.base, renderer.capabilities.getMaxAnisotropy());
    if (ticket !== building || !city) return;
    const next = await buildWorld(city, facades, renderer, night, effective());
    if (ticket !== building) {
      next.dispose();
      return;
    }
    if (built) {
      scene.remove(built.group);
      built.dispose();
    }
    built = next;
    builtQuality = effective();
    scene.add(built.group);
    scene.fog = built.fog;
    // Compile shaders off the main thread where the browser can, before the first frame.
    await renderer.compileAsync(scene, camera).catch(() => undefined);
    resize();
  }

  /* ---------------- Course ---------------- */
  function dropGate(entry: (typeof gates)[number]) {
    scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    (entry.mesh.material as THREE.Material).dispose();
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
    while (gates.length < 3) {
      for (const gate of nextGate(city, tail, rand)) {
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
    gates.forEach(({ mesh }, i) => ((mesh.material as THREE.MeshBasicMaterial).opacity = i === 0 ? 0.95 : 0.35));
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
    trailCount = 0;
    clock = START_TIME;
    boost = 0.5;
    boosting = false;
    gust = 0;
    combo = 0;
    ringPoints = 0;
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
      if (mode === "attract") for (let i = 0; i < 120 * 4; i++) physics(STEP); // start mid-glide
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
    if (assisted) assist(glider, input);
    else {
      glider.controls.roll = input.roll;
      glider.controls.pitch = input.pitch * 0.8;
    }
    const firing = (keys.has(" ") || keys.has("Shift") || boostHeld) && boost > 0;
    glider.controls.thrust = firing ? BOOST_THRUST : 0;
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
    if (boosting) boost = Math.max(0, boost - dt * 0.22);
    gust = Math.max(0, gust - dt);
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
      ringsPassed++;
      combo++;
      const extra = perfect ? 2 : 0;
      clock += head.gate.bonus + extra;
      ringPoints += (100 + (perfect ? 50 : 0)) * multiplier();
      boost = Math.min(1, boost + (perfect ? 0.3 : 0.15));
      sound?.ring(head.gate.kind === "climb" || perfect);
      flash(`${perfect ? "Perfect! " : ""}+${head.gate.bonus + extra}s${multiplier() > 1 ? `  ×${multiplier()}` : ""}`);
      dropGate(head);
      gates.shift();
      fillGates();
    } else if (result === "missed" || strayed) {
      sound?.miss();
      combo = 0;
      flash("Missed", "bad");
      restartCourse();
    }
  }

  function syncPlane() {
    const b = glider.body;
    plane.position.set(b.position.x, b.position.y, b.position.z);
    plane.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  }

  function updateTrails() {
    for (let s = 0; s < 2; s++) {
      const attr = trails[s].geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      arr.copyWithin(3, 0, (TRAIL - 1) * 3);
      tmp.set(s ? 1.8 : -1.8, 0.15, 1.4).applyQuaternion(plane.quaternion).add(plane.position);
      arr[0] = tmp.x;
      arr[1] = tmp.y;
      arr[2] = tmp.z;
      if (trailCount < TRAIL) for (let i = trailCount; i < TRAIL; i++) arr.set([tmp.x, tmp.y, tmp.z], i * 3);
      attr.needsUpdate = true;
    }
    trailCount = Math.min(TRAIL, trailCount + 1);
  }

  function updateCamera(snap = false) {
    const forward = tmp.set(0, 0, -1).applyQuaternion(plane.quaternion);
    forward.y *= 0.35;
    forward.normalize();
    const attract = mode === "attract";
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const swing = attract ? Math.sin(elapsed * 0.06) * 0.7 : 0;
    // Hands off, the plane sits in the right third, clear of the words.
    const frameRight = attract && root.clientWidth > 900 ? 1 : 0;
    const speed = glider.telemetry.airspeed;
    const back = attract ? -15 : -11 - Math.max(0, speed - 20) * 0.12;
    const wantPos = plane.position.clone().addScaledVector(forward, back).add(new THREE.Vector3(0, attract ? 4 : 3, 0)).addScaledVector(side, swing * 8 - frameRight * 4);
    const wantLook = plane.position.clone().addScaledVector(forward, 16).addScaledVector(side, -frameRight * 9).add(new THREE.Vector3(0, -1, 0));
    if (snap) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
    } else {
      camPos.lerp(wantPos, attract ? 0.08 : 0.14);
      camLook.lerp(wantLook, 0.2);
    }
    // Lean into turns: the camera banks with the plane, a little less than it does.
    planeUp.set(0, 1, 0).applyQuaternion(plane.quaternion);
    camUp.lerp(new THREE.Vector3(0, 1, 0).lerp(planeUp, attract ? 0.15 : 0.45), 0.08).normalize();
    camera.up.copy(camUp);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // Speed widens the view.
    const fov = clamp(60 + (speed - 20) * 0.6 + (boosting ? 8 : 0), 56, 88) + (root.clientWidth < root.clientHeight ? 12 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();
    }
    if (built) {
      // Keep the sun's shadow map centred on the plane.
      built.sun.target.position.copy(plane.position);
      built.sun.position.copy(plane.position).addScaledVector(built.sunDirection, 900);
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
    syncPlane();
    updateCamera(true);
    built?.update(elapsed);
    if (built) built.render(scene, camera);
    else renderer.render(scene, camera);
  }

  function loop(now: number) {
    frame = 0;
    if (!visible || document.hidden || options.isStill() || !city) {
      last = 0;
      return;
    }
    const raw = last ? (now - last) / 1000 : STEP;
    // At the lowest quality, draw every other frame.
    if (quality === 0 && last && raw < 1 / 40) {
      frame = requestAnimationFrame(loop);
      return;
    }
    last = now;
    // Step quality down when frames are consistently slow.
    slowFrames = raw > 1 / 38 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 45 && quality > 0) {
      quality--;
      slowFrames = 0;
      applyQuality();
      void buildScene();
    }
    acc += Math.min(raw, 0.05);
    while (acc >= STEP) {
      physics(STEP);
      elapsed += STEP;
      acc -= STEP;
    }
    syncPlane();
    if (!crashed && countdown <= 0) updateTrails();
    updateCamera();
    gates.forEach(({ mesh, gate, orb }, i) => {
      mesh.rotation.z = gate.kind === "climb" ? elapsed * 0.15 : elapsed * 0.4 + i;
      if (orb) {
        orb.rotation.set(elapsed * 1.3, elapsed * 0.9, 0);
        orb.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.08);
      }
    });
    built?.update(elapsed);
    updateHud();
    updatePointer();
    if (built) built.render(scene, camera);
    else renderer.render(scene, camera);
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

  function setMode(next: "attract" | "play") {
    mode = next;
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
    if (city && effective() !== builtQuality) void buildScene();
    launch();
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
    if (target.hasAttribute("data-sky-play")) setMode("play");
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
    void buildScene().then(() => city && render());
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
      built?.dispose();
      renderer.dispose();
    },
  };
}
