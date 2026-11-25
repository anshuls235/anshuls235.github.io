import { test } from "node:test";
import assert from "node:assert/strict";
import { Vec3 } from "cannon-es";
import { createWorld, createGlider, cityWind } from "../src/sky/glider";

function fly(seconds: number, setup?: (g: ReturnType<typeof createGlider>, t: number) => void) {
  const world = createWorld();
  const glider = createGlider(world);
  glider.launch(0, 300, 0, 0, 20);
  const dt = 1 / 120;
  for (let i = 0; i < seconds / dt; i++) {
    setup?.(glider, i * dt);
    world.step(dt);
  }
  return glider;
}

test("hands-off, the glider settles into a steady, stable glide", () => {
  const g = fly(40);
  const { airspeed, vario, alpha } = g.telemetry;
  const ratio = g.telemetry.groundSpeed / -vario;
  assert.ok(airspeed > 15 && airspeed < 26, `airspeed ${airspeed}`);
  assert.ok(vario < -0.8 && vario > -3, `sink ${vario}`);
  assert.ok(ratio > 8 && ratio < 16, `glide ratio ${ratio}`);
  assert.ok(alpha > 0 && alpha < 0.26, `trim alpha ${alpha}`);
  assert.ok(Math.abs(g.body.angularVelocity.length()) < 0.05, "settled");
});

test("energy is never created: total energy only falls in still air", () => {
  const world = createWorld();
  const g = createGlider(world);
  g.launch(0, 300, 0, 0, 20);
  const energy = () => 0.5 * g.body.mass * g.body.velocity.lengthSquared() + g.body.mass * 9.81 * g.body.position.y;
  let last = energy();
  for (let i = 0; i < 120 * 30; i++) {
    world.step(1 / 120);
    if (i % 60 === 0) {
      const now = energy();
      assert.ok(now <= last + 0.5, `energy rose from ${last} to ${now}`);
      last = now;
    }
  }
});

test("a right bank turns right and the glider rolls back level", () => {
  const start = fly(10);
  const heading0 = Math.atan2(start.body.velocity.x, -start.body.velocity.z);
  const g = fly(18, (gl, t) => {
    gl.controls.roll = t > 10 && t < 11.2 ? 1 : 0;
  });
  const heading = Math.atan2(g.body.velocity.x, -g.body.velocity.z);
  assert.ok(heading - heading0 > 0.3, `turned right by ${heading - heading0}`);
  const later = fly(45, (gl, t) => {
    gl.controls.roll = t > 10 && t < 11.2 ? 1 : 0;
  });
  assert.ok(Math.abs(later.telemetry.bank) < 0.25, `bank ${later.telemetry.bank}`);
});

test("pulling up trades speed for height, then the glider stalls and recovers", () => {
  let stalled = false;
  const g = fly(30, (gl, t) => {
    gl.controls.pitch = t > 10 && t < 13 ? 1 : 0;
    if (gl.telemetry.stalled) stalled = true;
  });
  assert.ok(stalled, "a sustained pull reaches the stall");
  assert.ok(!g.telemetry.stalled && g.telemetry.airspeed > 7, "recovered");
});

test("a thermal stronger than the sink rate lifts a circling glider", () => {
  const thermal = cityWind({ x: 0, z: 0 }, [{ x: 0, z: 0, radius: 150, strength: 4.2, top: 600 }], []);
  const world = createWorld();
  const g = createGlider(world);
  g.setWind(thermal);
  g.launch(-20, 300, 0, 0, 18);
  const start = g.body.position.y;
  for (let i = 0; i < 120 * 40; i++) {
    const p = g.body.angularVelocity.dot(g.body.quaternion.vmult(new Vec3(0, 0, -1)));
    g.controls.roll = Math.max(-1, Math.min(1, 2.5 * (0.62 - g.telemetry.bank) - 0.6 * p));
    g.controls.pitch = 0.15;
    world.step(1 / 120);
  }
  assert.ok(g.body.position.y > start, `gained ${g.body.position.y - start} m`);
});

test("the booster is a force along the nose: it speeds the glider up, and stops when released", () => {
  const world = createWorld();
  const g = createGlider(world);
  g.launch(0, 300, 0, 0, 20);
  for (let i = 0; i < 120 * 10; i++) world.step(1 / 120);
  const cruise = g.telemetry.airspeed;
  g.controls.thrust = 160;
  for (let i = 0; i < 120 * 3; i++) world.step(1 / 120);
  assert.ok(g.telemetry.airspeed > cruise + 4, `boosted from ${cruise.toFixed(1)} to ${g.telemetry.airspeed.toFixed(1)}`);
  g.controls.thrust = 0;
  // The phugoid swings for a while once the thrust stops; average over the last cycles.
  let sum = 0;
  for (let i = 0; i < 120 * 60; i++) {
    world.step(1 / 120);
    if (i >= 120 * 40) sum += g.telemetry.airspeed;
  }
  const settled = sum / (120 * 20);
  assert.ok(Math.abs(settled - cruise) < 3, `drag brings it back to its glide (${settled.toFixed(1)} vs ${cruise.toFixed(1)})`);
});
