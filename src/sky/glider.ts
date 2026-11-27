// A paper glider flown by real forces. cannon-es integrates the rigid body
// (Newton's laws, gravity, collisions); this module supplies the aerodynamics:
// lift and induced drag from thin-airfoil theory, parasitic drag, a stall,
// sideslip force, and the stability derivatives that make a paper plane
// self-righting. Every force is computed against the air, not the ground, so
// wind, thermals and ridge lift change the flight the way they do outdoors.
import * as CANNON from "cannon-es";

export const AIR_DENSITY = 1.225; // kg/m³, sea level
export const GRAVITY = 9.81; // m/s²

/**
 * A large folded-paper glider: 3.6 m span, 16 kg. Heavier and cleaner than a
 * desk-sized dart, so it cruises near 70 km/h with a glide ratio around 11,
 * fast enough to thread between towers and still bound by the same physics.
 */
export const GLIDER = {
  mass: 16,
  span: 3.6, // b, m
  chord: 0.62, // mean chord c, m
  area: 2.2, // S, m²
  cd0: 0.02, // parasitic drag
  oswald: 0.85, // span efficiency e
  clAlpha: 4.7, // per rad: 2πA/(A+2) for aspect ratio ≈ 5.9
  stall: 0.26, // rad (≈15°)
  // Stability derivatives (non-dimensional)
  cm0: 0.05,
  cmAlpha: -0.75,
  cmQ: -10,
  clBeta: -0.1, // dihedral effect
  clP: -0.45, // roll damping
  cnBeta: 0.12, // weathervane
  cnR: -0.18, // yaw damping
  cyBeta: -0.7,
  // Control authority (paper elevons)
  pitchControl: 0.16,
  rollControl: 0.09,
};

export interface Controls {
  /** -1 push (nose down) … 1 pull (nose up) */
  pitch: number;
  /** -1 bank left … 1 bank right */
  roll: number;
  /** Booster thrust along the nose, newtons (0 when idle). */
  thrust: number;
  /** Airbrakes (spoilers), 0 closed … 1 fully open: extra drag for steep, slow descents. */
  brake: number;
}

export type WindField = (p: CANNON.Vec3, out: CANNON.Vec3) => CANNON.Vec3;

export interface Telemetry {
  airspeed: number;
  groundSpeed: number;
  altitude: number;
  vario: number;
  alpha: number;
  bank: number;
  stalled: boolean;
  lift: number;
  /** Vertical speed relative to the air, m/s: what a flight path through the air means. */
  airVy: number;
}

const FORWARD = new CANNON.Vec3(0, 0, -1);
const UP = new CANNON.Vec3(0, 1, 0);
const RIGHT = new CANNON.Vec3(1, 0, 0);

/** Lift coefficient with a soft stall: linear, then falling as flow separates. */
export function liftCoefficient(alpha: number) {
  const { clAlpha, stall } = GLIDER;
  const a = Math.abs(alpha);
  if (a <= stall) return clAlpha * alpha;
  // Past the stall, lift collapses toward a flat plate's sin 2α.
  const peak = clAlpha * stall;
  const plate = 0.9 * Math.sin(2 * a);
  const blend = Math.min(1, (a - stall) / 0.25);
  return Math.sign(alpha) * (peak * (1 - blend) + plate * blend);
}

export function createGlider(world: CANNON.World) {
  const half = new CANNON.Vec3(GLIDER.span / 2, 0.08, GLIDER.chord / 2);
  const body = new CANNON.Body({
    mass: GLIDER.mass,
    shape: new CANNON.Box(half),
    linearDamping: 0,
    angularDamping: 0,
    allowSleep: false,
  });
  // A plate is much stiffer in roll and yaw than its bounding box suggests
  // about the pitch axis; use plate inertia directly.
  const { mass, span, chord } = GLIDER;
  body.inertia.set((mass * chord * chord) / 12 + 0.05, (mass * (span * span + chord * chord)) / 12, (mass * span * span) / 12);
  body.updateMassProperties = () => {
    body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
    body.updateInertiaWorld(true);
  };
  body.updateMassProperties();
  world.addBody(body);

  const controls: Controls = { pitch: 0, roll: 0, thrust: 0, brake: 0 };
  const telemetry: Telemetry = { airspeed: 0, groundSpeed: 0, altitude: 0, vario: 0, alpha: 0, bank: 0, stalled: false, lift: 0, airVy: 0 };
  let wind: WindField = (_p, out) => out.set(0, 0, 0);

  const f = new CANNON.Vec3();
  const u = new CANNON.Vec3();
  const r = new CANNON.Vec3();
  const air = new CANNON.Vec3();
  const va = new CANNON.Vec3();
  const lift = new CANNON.Vec3();
  const force = new CANNON.Vec3();
  const torque = new CANNON.Vec3();
  const tmp = new CANNON.Vec3();

  function applyAerodynamics() {
    body.quaternion.vmult(FORWARD, f);
    body.quaternion.vmult(UP, u);
    body.quaternion.vmult(RIGHT, r);
    wind(body.position, air);
    body.velocity.vsub(air, va); // velocity relative to the air mass
    const V = va.length();
    telemetry.airspeed = V;
    telemetry.groundSpeed = Math.hypot(body.velocity.x, body.velocity.z);
    telemetry.altitude = body.position.y;
    telemetry.vario = body.velocity.y;
    telemetry.bank = Math.atan2(r.y, u.y) * -1;
    telemetry.airVy = va.y;
    if (V < 0.05) return;

    const vf = va.dot(f);
    const vu = va.dot(u);
    const vr = va.dot(r);
    const alpha = Math.atan2(-vu, vf);
    const beta = Math.asin(Math.max(-1, Math.min(1, vr / V)));
    telemetry.alpha = alpha;
    telemetry.stalled = Math.abs(alpha) > GLIDER.stall;

    const q = 0.5 * AIR_DENSITY * V * V; // dynamic pressure
    const { area: S, span: b, chord: c } = GLIDER;
    const aspect = (b * b) / S;
    const cl = liftCoefficient(alpha);
    // Ground effect: within about a span of the ground the wingtip vortices are
    // squashed, cutting induced drag (Wieselsberger) — a cushion when skimming low.
    const hb = Math.max(0.05, body.position.y / b);
    const ground = hb < 1.5 ? ((16 * hb) ** 2) / (1 + (16 * hb) ** 2) : 1;
    const cd = GLIDER.cd0 + 0.09 * controls.brake + (ground * cl * cl) / (Math.PI * GLIDER.oswald * aspect) + 1.1 * Math.sin(alpha) ** 2;
    const cy = GLIDER.cyBeta * beta;

    // Lift is perpendicular to the relative wind, in the plane of symmetry.
    r.cross(va, lift);
    lift.normalize();
    force.set(0, 0, 0);
    lift.scale(q * S * cl, tmp);
    force.vadd(tmp, force);
    telemetry.lift = q * S * cl;
    va.scale(-(q * S * cd) / V, tmp); // drag opposes the relative wind
    force.vadd(tmp, force);
    r.scale(q * S * cy, tmp);
    force.vadd(tmp, force);
    // A booster pushes along the nose: one more force, same Newtonian sum.
    if (controls.thrust) force.vadd(f.scale(controls.thrust, tmp), force);
    body.applyForce(force); // at the centre of mass; moments are applied below

    // Body rates: roll about the nose, pitch about the right wing, yaw about up.
    const w = body.angularVelocity;
    const p = w.dot(f);
    const qr = w.dot(r);
    const yr = w.dot(u);
    const cm = GLIDER.cm0 + GLIDER.cmAlpha * alpha + GLIDER.cmQ * ((qr * c) / (2 * V)) + GLIDER.pitchControl * controls.pitch;
    // Sliding right (β > 0) rolls the glider back left: dihedral.
    // Past the stall the separated flow buffets: an uneven, shaking roll.
    const buffet = telemetry.stalled ? Math.sin(body.position.x * 1.7 + body.position.z * 2.3) * 0.02 * Math.min(1, (Math.abs(alpha) - GLIDER.stall) / 0.1) : 0;
    const croll = GLIDER.clBeta * beta + GLIDER.clP * ((p * b) / (2 * V)) + GLIDER.rollControl * controls.roll + buffet;
    // Positive torque about up yaws the nose left; sideslip right should yaw right.
    const cn = -GLIDER.cnBeta * beta + GLIDER.cnR * ((yr * b) / (2 * V));
    torque.set(0, 0, 0);
    r.scale(q * S * c * cm, tmp);
    torque.vadd(tmp, torque);
    f.scale(q * S * b * croll, tmp);
    torque.vadd(tmp, torque);
    u.scale(q * S * b * cn, tmp);
    torque.vadd(tmp, torque);
    body.applyTorque(torque);
  }
  world.addEventListener("preStep", applyAerodynamics);

  /** Release from a hand-launch: position, heading (rad, 0 = -Z), speed. */
  function launch(x: number, y: number, z: number, heading: number, speed = 20) {
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(0, heading, 0, "YXZ");
    const dir = new CANNON.Vec3();
    body.quaternion.vmult(FORWARD, dir);
    // Released slightly nose-up so it settles into its trimmed glide.
    body.velocity.set(dir.x * speed, -0.6, dir.z * speed);
    body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    controls.pitch = 0;
    controls.roll = 0;
    controls.thrust = 0;
    controls.brake = 0;
  }

  return {
    body,
    controls,
    telemetry,
    launch,
    setWind(field: WindField) {
      wind = field;
    },
    destroy() {
      world.removeEventListener("preStep", applyAerodynamics);
      world.removeBody(body);
    },
  };
}
export type Glider = ReturnType<typeof createGlider>;

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  world.allowSleep = false;
  world.broadphase = new CANNON.SAPBroadphase(world);
  return world;
}

/** Thermals: columns of rising air with a Gaussian core (strength in m/s). */
export interface Thermal {
  x: number;
  z: number;
  radius: number;
  strength: number;
  top: number;
}
/** A building that deflects the breeze upward along its windward face. */
export interface Obstacle {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/**
 * Where a thermal's core is at a given height. Rising air is carried downwind
 * by the breeze as it climbs, so the column leans: the higher you are, the
 * further downwind the core.
 */
export function thermalCore(t: Thermal, y: number, breeze: { x: number; z: number }) {
  const rise = Math.max(0, y) / Math.max(0.5, t.strength);
  return { x: t.x + breeze.x * rise, z: t.z + breeze.z * rise };
}

/**
 * The air over a city: a steady breeze, thermals over hot ground, and ridge
 * lift where the breeze is forced up a facade. Vertical speeds stay within
 * what glider pilots meet in practice (≤ 4 m/s).
 */
export function cityWind(breeze: { x: number; z: number }, thermals: Thermal[], obstacles: Obstacle[]): WindField {
  const speed = Math.hypot(breeze.x, breeze.z) || 1;
  const bx = breeze.x / speed;
  const bz = breeze.z / speed;
  return (p, out) => {
    let lift = 0;
    for (const t of thermals) {
      const core = thermalCore(t, p.y, breeze);
      const dx = p.x - core.x;
      const dz = p.z - core.z;
      const profile = Math.exp(-(dx * dx + dz * dz) / (t.radius * t.radius));
      const fade = p.y > t.top ? Math.exp(-(p.y - t.top) / 25) : 1;
      lift += t.strength * profile * fade;
    }
    // Ridge lift: upwind of a tower, within ~1.5 widths, below its roof.
    for (const o of obstacles) {
      if (p.y > o.h + 20) continue;
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const along = dx * bx + dz * bz; // negative = upwind
      const across = Math.abs(-dx * bz + dz * bx);
      const halfFace = (Math.abs(bx) * o.d + Math.abs(bz) * o.w) / 2 + 4;
      const halfDepth = (Math.abs(bx) * o.w + Math.abs(bz) * o.d) / 2;
      if (along > -halfDepth || along < -halfDepth - 40 || across > halfFace) continue;
      const gap = -halfDepth - along; // metres in front of the face
      const height = p.y < o.h ? 1 : Math.exp(-(p.y - o.h) / 8);
      lift += speed * 0.7 * Math.exp(-gap / 14) * height;
    }
    return out.set(breeze.x, Math.min(lift, 4.5), breeze.z);
  };
}
