import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorld, createGlider, cityWind, thermalCore } from "../src/sky/glider";
import { prepareCity, type CityFile, type CityId } from "../src/sky/citydata";
import { autopilot, assist, launchPoint } from "../src/sky/pilot";

const load = (id: CityId) => prepareCity(JSON.parse(readFileSync(`public/assets/sky/${id}.json`, "utf8")) as CityFile);

function fly(id: CityId, seconds: number, pilot: "auto" | ((g: ReturnType<typeof createGlider>, t: number) => void)) {
  const city = load(id);
  const world = createWorld();
  const g = createGlider(world);
  g.setWind(cityWind(city.breeze, city.thermals, city.obstacles));
  const start = launchPoint(city);
  g.launch(start.x, start.y, start.z, -start.heading, 20);
  const state = { leg: 0, climbing: false };
  let crashed = "";
  for (let i = 0; i < seconds * 120 && !crashed; i++) {
    if (pilot === "auto") autopilot(g, city, state);
    else pilot(g, i / 120);
    world.step(1 / 120);
    const p = g.body.position;
    if (city.hits(p.x, p.y, p.z)) crashed = `building at ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`;
    else if (p.y < 0.5) crashed = "ground";
  }
  return { city, g, crashed, legs: state.leg };
}

for (const id of ["dubai", "bengaluru", "delhi"] as CityId[]) {
  test(`over real ${id}, the autopilot hops thermals for four minutes without touching a building`, () => {
    const { city, crashed, g } = fly(id, 240, "auto");
    assert.ok(city.thermals.length >= 4, `${city.thermals.length} thermals`);
    assert.equal(crashed, "", crashed);
    assert.ok(g.body.position.y > city.tallest * 0.5, `still flying at ${g.body.position.y.toFixed(0)} m`);
  });
}

test("with the assist, a visitor who circles in a thermal climbs", () => {
  const city = load("bengaluru");
  const t = city.thermals[0];
  const { g, crashed } = fly("bengaluru", 60, (glider) => {
    // Circle in the core; drifting out, turn back toward it, as a person would.
    const p = glider.body.position;
    const core = thermalCore(t, p.y, city.breeze);
    const d = Math.hypot(p.x - core.x, p.z - core.z);
    const toward = Math.atan2(core.x - p.x, -(core.z - p.z)) - Math.atan2(glider.body.velocity.x, -glider.body.velocity.z);
    const err = Math.atan2(Math.sin(toward), Math.cos(toward));
    assist(glider, { roll: d > 90 ? Math.max(-1, Math.min(1, 1.5 * err)) : 0.9, pitch: 0 });
  });
  const start = launchPoint(city).y;
  assert.equal(crashed, "");
  assert.ok(g.body.position.y > start, `climbed from ${start.toFixed(0)} to ${g.body.position.y.toFixed(0)}`);
});

test("hands off, the assist levels the wings and holds best-glide speed", () => {
  const { g } = fly("delhi", 25, (glider, time) => assist(glider, { roll: time < 3 ? 1 : 0, pitch: 0 }));
  assert.ok(Math.abs(g.telemetry.bank) < 0.1, `bank ${g.telemetry.bank}`);
  assert.ok(Math.abs(g.telemetry.airspeed - 19) < 2.5, `airspeed ${g.telemetry.airspeed}`);
});

test("the sea floods from open water and stops at the coast", () => {
  const dubai = load("dubai");
  assert.ok(dubai.sea, "Dubai has a sea mask");
  assert.ok(dubai.isWater(-1500, -1500), "the Gulf is water");
  assert.ok(!dubai.isWater(1200, 1200), "inland is dry");
  assert.ok(dubai.tallest > 350, "the Marina's tallest towers come from real heights");
});

import { nextGate, exitOf, crossing, seeded, START_TIME, type Gate } from "../src/sky/course";

/** A plain player: steer at the next ring, ask for climb or dive by height error, circle in climb rings. */
function play(id: CityId, seconds: number) {
  const city = load(id);
  const world = createWorld();
  const g = createGlider(world);
  g.setWind(cityWind(city.breeze, city.thermals, city.obstacles));
  const start = launchPoint(city);
  g.launch(start.x, start.y, start.z, -start.heading, 20);
  const rand = seeded(7);
  const gates: Gate[] = [];
  let tail = { x: start.x, y: start.y, z: start.z, heading: start.heading };
  let prev = { x: start.x, z: start.z };
  const fill = () => {
    while (gates.length < 3) {
      const made = nextGate(city, tail, rand);
      for (const gate of made) {
        gates.push(gate);
        tail = exitOf(gate, prev);
        prev = { x: gate.x, z: gate.z };
      }
    }
  };
  fill();
  let clock = START_TIME;
  let passed = 0;
  let climbs = 0;
  let crashed = "";
  for (let i = 0; i < seconds * 120 && !crashed && clock > 0; i++) {
    const p = g.body.position;
    const gate = gates[0];
    const heading = Math.atan2(g.body.velocity.x, -g.body.velocity.z);
    const toward = Math.atan2(gate.x - p.x, -(gate.z - p.z)) - heading;
    const err = Math.atan2(Math.sin(toward), Math.cos(toward));
    if (gate.kind === "climb") {
      const core = thermalCore(city.thermals.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a)), p.y, city.breeze);
      const d = Math.hypot(core.x - p.x, core.z - p.z);
      const t2 = Math.atan2(core.x - p.x, -(core.z - p.z)) - heading;
      assist(g, { roll: d > 90 ? Math.max(-1, Math.min(1, 1.5 * Math.atan2(Math.sin(t2), Math.cos(t2)))) : 0.9, pitch: 0 });
    } else {
      const dist = Math.hypot(gate.x - p.x, gate.z - p.z);
      const want = (gate.y - p.y) / Math.max(30, dist);
      assist(g, { roll: Math.max(-1, Math.min(1, 1.6 * err)), pitch: Math.max(-1, Math.min(1, want * 4 + 0.3)) });
    }
    const a = { x: p.x, y: p.y, z: p.z };
    world.step(1 / 120);
    clock -= 1 / 120;
    const b = { x: g.body.position.x, y: g.body.position.y, z: g.body.position.z };
    if (city.hits(b.x, b.y, b.z)) crashed = `building at ${b.x.toFixed(0)},${b.y.toFixed(0)},${b.z.toFixed(0)}`;
    else if (b.y < 0.6) crashed = "ground";
    const result = crossing(gates[0], a, b);
    if (result === "through" || result === "perfect") {
      passed++;
      if (gates[0].kind === "climb") climbs++;
      clock += gates[0].bonus;
      gates.shift();
      fill();
    } else if (result === "missed") {
      gates.shift();
      fill();
    }
  }
  return { passed, climbs, crashed, clock };
}

for (const id of ["dubai", "bengaluru", "delhi"] as CityId[]) {
  test(`the ring course over ${id} is playable with the assist: three minutes, no buildings hit, the clock holds`, () => {
    const { passed, crashed, clock, climbs } = play(id, 180);
    assert.equal(crashed, "", crashed);
    assert.ok(clock > 0, `ran out of time after ${passed} rings`);
    assert.ok(passed >= 6, `passed ${passed} rings (${climbs} climbs), ${clock.toFixed(0)} s left`);
  });
}
