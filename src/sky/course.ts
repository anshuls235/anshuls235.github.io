// The game: an endless course of rings laid out ahead of the plane. Each ring
// is reachable on a gentle glide and clear of every building on the way, and
// the course prefers lines that thread past tall towers. When it runs low it
// leads into a thermal and stacks a climb ring above it: circle up through it.
import { thermalCore } from "./glider";
import type { City } from "./citydata";

export type PickupKind = "boost" | "lift" | "time";
export interface Pickup {
  x: number;
  y: number;
  z: number;
  kind: PickupKind;
}

export interface Gate {
  /** Something to collect on the way to this gate. */
  pickup?: Pickup;
  x: number;
  y: number;
  z: number;
  /** Direction to fly through it; a climb ring faces up. */
  nx: number;
  ny: number;
  nz: number;
  kind: "ring" | "climb";
  radius: number;
  /** Seconds the gate adds to the clock. */
  bonus: number;
}

export const START_TIME = 75;
const GLIDE = 9; // a conservative 9:1, the glider manages about 10–11
const CLEAR = 25; // metres above any roof along the line

export function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Lowest height at which the straight line from a to b clears every roof. */
function clearOver(city: City, ax: number, az: number, bx: number, bz: number) {
  const length = Math.hypot(bx - ax, bz - az);
  let top = 0;
  for (let s = 0; s <= length; s += 18) {
    const t = length ? s / length : 0;
    top = Math.max(top, city.roofAt(ax + (bx - ax) * t, az + (bz - az) * t, 30));
  }
  return top + CLEAR;
}

export function nextGate(
  city: City,
  from: { x: number; y: number; z: number; heading: number },
  rand: () => number,
  difficulty = 0,
): Gate[] {
  const diff = Math.max(0, Math.min(1, difficulty));
  const [hx, hz] = city.data.half;
  const maxTurn = 0.95 + diff * 0.45; // sharper banking turns as difficulty ramps
  const ringRadius = 18 - diff * 5.5; // tightens from 18 m down to 12.5 m
  const timeCushion = Math.round(4 - diff * 2.5); // tighter clock margin at higher streaks
  let best: { gate: Gate; score: number } | null = null;
  for (let i = 0; i < 24; i++) {
    const turn = (rand() - 0.5) * 2 * maxTurn;
    const heading = from.heading + turn;
    const dist = 185 + rand() * 85;
    const x = from.x + Math.sin(heading) * dist;
    const z = from.z - Math.cos(heading) * dist;
    if (Math.abs(x) > hx - 220 || Math.abs(z) > hz - 220) continue;
    const y = from.y - dist / GLIDE - (4 + diff * 2);
    // The whole line, start to gate, must clear the roofs at the height the glide allows there.
    if (y < 52 || y < clearOver(city, from.x, from.z, x, z)) continue;
    // Prefer lines that thread close past tall towers, and sharper turns at higher difficulty.
    const nearby = city.roofAt(x, z, 90);
    const towerBonus = (Math.min(nearby, y - CLEAR) / Math.max(1, y)) * (1 + diff * 0.6);
    const turnBias = (0.15 - diff * 0.25) * Math.abs(turn);
    const score = towerBonus + rand() * 0.3 - turnBias;
    if (!best || score > best.score) {
      best = {
        gate: {
          x,
          y,
          z,
          nx: Math.sin(heading),
          ny: 0,
          nz: -Math.cos(heading),
          kind: "ring",
          radius: ringRadius,
          bonus: Math.max(6, Math.round(dist / (18 + diff * 2.5)) + timeCushion),
        },
        score,
      };
    }
  }
  if (best && best.gate.y > Math.max(90, Math.min(city.tallest, 420) * 0.44)) {
    // A pickup on the approach, a little off the line: worth a small detour.
    const g = best.gate;
    const t = 0.45 + rand() * 0.2;
    const side = (rand() - 0.5) * 30;
    const roll = rand();
    const kind: PickupKind = roll < 0.5 ? "boost" : roll < 0.75 ? "lift" : "time";
    g.pickup = {
      x: from.x + (g.x - from.x) * t + g.nz * -side,
      y: from.y + (g.y - from.y) * t + 4,
      z: from.z + (g.z - from.z) * t + g.nx * side,
      kind,
    };
    return [g];
  }
  // Running low: into the nearest thermal, then up through a climb ring above it.
  const t = city.thermals.reduce((a, b) => (Math.hypot(b.x - from.x, b.z - from.z) < Math.hypot(a.x - from.x, a.z - from.z) ? b : a));
  const reach = Math.hypot(t.x - from.x, t.z - from.z);
  const entry = Math.max(40, from.y - reach / GLIDE - 6);
  const at = thermalCore(t, entry, city.breeze);
  const heading = Math.atan2(at.x - from.x, -(at.z - from.z));
  const top = entry + 110;
  const above = thermalCore(t, top, city.breeze);
  return [
    { x: at.x, y: entry, z: at.z, nx: Math.sin(heading), ny: 0, nz: -Math.cos(heading), kind: "ring", radius: 22, bonus: Math.round(reach / 19) + 4 },
    // A climb of 110 m takes about a minute at 2 m/s; the ring pays for it.
    { x: above.x, y: top, z: above.z, nx: 0, ny: 1, nz: 0, kind: "climb", radius: 120, bonus: 60 },
  ];
}

/** Heading out of a gate, for laying the next one. */
export function exitOf(gate: Gate, previous: { x: number; z: number }) {
  const heading = gate.kind === "climb" ? Math.atan2(gate.x - previous.x, -(gate.z - previous.z)) : Math.atan2(gate.nx, -gate.nz);
  return { x: gate.x, y: gate.y, z: gate.z, heading };
}

/** Whether the step from a to b passed through the gate (dead centre counts as perfect), or left it behind. */
export function crossing(gate: Gate, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): "perfect" | "through" | "missed" | null {
  const da = (a.x - gate.x) * gate.nx + (a.y - gate.y) * gate.ny + (a.z - gate.z) * gate.nz;
  const db = (b.x - gate.x) * gate.nx + (b.y - gate.y) * gate.ny + (b.z - gate.z) * gate.nz;
  if (da < 0 && db >= 0) {
    const t = da / (da - db);
    const px = a.x + (b.x - a.x) * t - gate.x;
    const py = a.y + (b.y - a.y) * t - gate.y;
    const pz = a.z + (b.z - a.z) * t - gate.z;
    const off = Math.hypot(px, py, pz);
    if (off <= gate.radius) return off <= gate.radius * 0.35 && gate.kind === "ring" ? "perfect" : "through";
  }
  return db > 60 && gate.kind === "ring" ? "missed" : null;
}
