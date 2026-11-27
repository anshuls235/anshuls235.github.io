// Two pilots for the same glider and the same physics. The autopilot hops
// between thermals like a cross-country glider pilot. The assist helps a
// visitor: their stick asks for a bank angle and a speed, and it moves the
// control surfaces to get there, levelling the wings when they let go.
import * as CANNON from "cannon-es";
import { thermalCore, type Glider } from "./glider";
import type { City } from "./citydata";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const NOSE = new CANNON.Vec3(0, 0, -1);
const RIGHT = new CANNON.Vec3(1, 0, 0);
const nose = new CANNON.Vec3();
const right = new CANNON.Vec3();

/** Best glide airspeed for this glider, m/s (≈ 72 km/h). */
export const BEST_GLIDE = 20;
/** The assist never lets airspeed fall below this: comfortably above the 10 m/s stall. */
export const MIN_SPEED = 13.5;

/** Ground track, radians: 0 is -Z (north), positive turns right toward +X. */
export function heading(glider: Glider) {
  const v = glider.body.velocity;
  return Math.atan2(v.x, -v.z);
}
function rollRate(glider: Glider) {
  glider.body.quaternion.vmult(NOSE, nose);
  return glider.body.angularVelocity.dot(nose);
}
/** Hold a bank angle and an airspeed. */
export function hold(glider: Glider, bank: number, speed: number) {
  const t = glider.telemetry;
  glider.controls.roll = clamp(2.5 * (bank - t.bank) - 0.6 * rollRate(glider), -1, 1);
  glider.controls.pitch = clamp(0.1 + 0.05 * (t.airspeed - speed) + 0.3 * Math.abs(t.bank), -0.6, 0.7);
}
/** Bank toward a heading at best-glide speed. */
export function steer(glider: Glider, target: number, maxBank = 0.5) {
  hold(glider, clamp(1.4 * wrap(target - heading(glider)), -maxBank, maxBank), BEST_GLIDE);
}

/**
 * A visitor's stick, -1…1 each way. Roll asks for a bank angle (up to ~50°).
 * Pitch asks for a climb or a dive: the assist holds that flight-path angle
 * while the speed lasts, and lowers the nose itself before a stall. Let go and
 * it rolls level and settles at best-glide speed.
 */
export function assist(glider: Glider, stick: { roll: number; pitch: number }, boosting = false) {
  const t = glider.telemetry;
  glider.body.quaternion.vmult(NOSE, nose);
  glider.body.quaternion.vmult(RIGHT, right);
  const bank = clamp(stick.roll, -1, 1) * 0.88;
  glider.controls.roll = clamp(2.5 * (bank - t.bank) - 0.6 * glider.body.angularVelocity.dot(nose), -1, 1);
  const turn = 0.3 * Math.abs(t.bank);
  // Flight path through the air, not over the ground: rising air should not fool it.
  const gamma = Math.asin(clamp(t.airVy / Math.max(1, t.airspeed), -1, 1));
  // Hands off: the best-glide path (≈ −5°), nudged steeper when slow and flatter when fast.
  // In a steep turn it aims slower, as pilots do to circle tightly in a thermal.
  const target = BEST_GLIDE - 4.5 * Math.min(1, Math.abs(t.bank) / 0.6);
  const glide = -0.087 + clamp(0.03 * (t.airspeed - target), -0.15, 0.12);
  // Under boost, hands off holds the height: the thrust becomes speed toward the
  // ring, not a climb away from it.
  const neutral = boosting ? 0 : glide;
  const diving = stick.pitch < -0.06 && !boosting;
  const want = Math.abs(stick.pitch) < 0.06 ? neutral : stick.pitch > 0 ? stick.pitch * 0.22 : stick.pitch * 0.62; // up to +12° climb, −36° dive
  // Pushing down opens the airbrakes as speed builds, so a dive stays a dive
  // (≈ 120–140 km/h) instead of the over-speed guard pulling the nose back up.
  glider.controls.brake = diving ? clamp((t.airspeed - 30) / 8, 0, 1) : 0;
  // A push answers quicker than a pull: diving for a low ring should feel immediate.
  let pitch = 0.1 + (diving ? 3.4 : 2.4) * (want - gamma) - 0.35 * glider.body.angularVelocity.dot(right) + turn;
  // Stall protection: below the floor, the nose comes down whatever the stick says.
  if (t.airspeed < MIN_SPEED) pitch = Math.min(pitch, -0.25 * (MIN_SPEED - t.airspeed) + turn * 0.5);
  // Over-speed protection: gliding, ease off above 42 m/s; diving with brakes, past 46; boosting, past 60.
  if (t.airspeed > (boosting ? 60 : diving ? 46 : 42)) pitch = Math.max(pitch, 0.25);
  glider.controls.pitch = clamp(pitch, -0.8, 0.8);
}

export interface PilotState {
  leg: number;
  climbing: boolean;
}

/** Thermal hopping: climb in a thermal until the next leg is safe, then glide to the next one. */
export function autopilot(glider: Glider, city: City, state: PilotState) {
  if (!city.legs.length) return hold(glider, 0, BEST_GLIDE);
  const p = glider.body.position;
  const leg = city.legs[state.leg % city.legs.length];
  if (state.climbing) {
    if (p.y >= leg.depart) state.climbing = false;
    else {
      // Circle where the thermal's core is at this height: it leans downwind.
      const thermal = city.thermals.reduce((a, b) => (Math.hypot(b.x - leg.from[0], b.z - leg.from[1]) < Math.hypot(a.x - leg.from[0], a.z - leg.from[1]) ? b : a));
      const core = thermalCore(thermal, p.y, city.breeze);
      const [tx, tz] = [core.x, core.z];
      const dx = p.x - tx;
      const dz = p.z - tz;
      const dist = Math.hypot(dx, dz);
      if (dist > 170) return steer(glider, Math.atan2(tx - p.x, -(tz - p.z)));
      const tangent = Math.atan2(-dz, -dx); // clockwise around the core
      return steer(glider, tangent + clamp((dist - 60) / 60, -0.6, 0.6), 0.78);
    }
  }
  const [tx, tz] = leg.to;
  if (Math.hypot(tx - p.x, tz - p.z) < 90) {
    state.leg = (state.leg + 1) % city.legs.length;
    state.climbing = p.y < city.legs[state.leg].depart;
  }
  steer(glider, Math.atan2(tx - p.x, -(tz - p.z)));
}

/** Where a flight starts: over the first thermal, high enough for the first leg. */
export function launchPoint(city: City) {
  const leg = city.legs[0];
  if (!leg) return { x: 0, y: city.tallest + 80, z: 0, heading: 0 };
  const h = Math.atan2(leg.to[0] - leg.from[0], -(leg.to[1] - leg.from[1]));
  const y = leg.depart + 20;
  // Start in the first thermal's core at that height: it leans downwind.
  const thermal = city.thermals.reduce((a, b) => (Math.hypot(b.x - leg.from[0], b.z - leg.from[1]) < Math.hypot(a.x - leg.from[0], a.z - leg.from[1]) ? b : a));
  const core = thermalCore(thermal, y, city.breeze);
  return { x: core.x, y, z: core.z, heading: h };
}

export type LaunchSpot = { x: number; y: number; z: number; heading: number; name?: string };

/**
 * Where play flights start, in turn: the classic opening, then a run-in towards each
 * far-apart landmark, so every flight shows a different part of the city instead of
 * always the same corner. Heights are a floor; the game lifts them clear of the
 * roofs once the tiles there are loaded.
 */
export function launchSpots(city: City): LaunchSpot[] {
  const first = launchPoint(city);
  const spots: LaunchSpot[] = [first];
  const [hx, hz] = city.data.half;
  const margin = 900;
  const taken = [{ x: first.x, z: first.z }];
  // Landmarks first, tallest first; then the postcard spots, to reach the rest of a big map.
  const byHeight = [...city.landmarks].sort((a, b) => b.height - a.height);
  for (const lm of [...byHeight, ...(city.index.postcards ?? [])]) {
    if (spots.length >= 6) break;
    if (taken.some((t) => Math.hypot(t.x - lm.x, t.z - lm.z) < 2500)) continue;
    // Approach from the side of the map's middle, 700 m out, facing the landmark.
    const len = Math.hypot(lm.x, lm.z) || 1;
    const x = Math.max(-hx + margin, Math.min(hx - margin, lm.x - (lm.x / len) * 700));
    const z = Math.max(-hz + margin, Math.min(hz - margin, lm.z - (lm.z / len) * 700));
    const heading = Math.atan2(lm.x - x, -(lm.z - z));
    spots.push({ x, y: first.y, z, heading, name: lm.name });
    taken.push({ x: lm.x, z: lm.z });
  }
  return spots;
}
