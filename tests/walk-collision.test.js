import test from "node:test";
import assert from "node:assert/strict";
import { moveWalker, safeWalkPosition, walkBlocked, movementKey } from "../js/three/walk-collision.js";

const furniture = [
  { x: -7.12, z: -0.9, width: 2.65, depth: 4.25 },
  { x: 7.48, z: -0.3, width: 1.95, depth: 3.6 },
  { x: 6.58, z: 0.65, width: 0.95, depth: 1.1 },
  { x: -7.07, z: -4.35, width: 1.2, depth: 1.2 },
  { x: 7.45, z: -3.7, width: 1.4, depth: 1.4 },
];
const bounds = { minX: -7.5, maxX: 7.5, minZ: -4.7, maxZ: 4.7 };
// a row of folder boxes along the back wall, as wide as the room (the old 30-folder shelves)
const shelves = Array.from({ length: 8 }, (_, i) => ({ x: -6.3 + i * 1.8, z: 4.6, width: 1.9, depth: 1.44 }));
const context = { bounds, radius: 0.7, obstacles: [...furniture, ...shelves] };

test("a full row of wall boxes traps a spawn against the wall; recovery makes WASD movement possible", () => {
  const oldSpawn = { x: 0, z: 4.7 };
  assert.equal(walkBlocked(oldSpawn, context), true);
  for (const delta of [{ x: 0.01, z: 0 }, { x: -0.01, z: 0 }, { x: 0, z: 0.01 }, { x: 0, z: -0.01 }]) {
    assert.equal(walkBlocked({ x: oldSpawn.x + delta.x, z: oldSpawn.z + delta.z }, context), true);
  }
  const safe = safeWalkPosition(oldSpawn, context);
  assert.ok(safe);
  assert.equal(walkBlocked(safe, context), false);
  assert.ok(moveWalker(oldSpawn, { x: 0, z: -0.1 }, context).z < safe.z);
});

test("normal positions do not jump and newly placed boxes allow recovery", () => {
  const point = { x: 0, z: 0 };
  assert.deepEqual(safeWalkPosition(point, context), point);
  const changed = { ...context, obstacles: [...context.obstacles, { ...point, width: 1.7, depth: 1.12, yaw: Math.PI / 4 }] };
  const safe = safeWalkPosition(point, changed);
  assert.equal(walkBlocked(safe, changed), false);
  assert.deepEqual(safeWalkPosition(safe, changed), safe);
});

test("walking slides along obstacles without crossing them or room bounds", () => {
  const wall = { bounds, radius: 0.3, obstacles: [{ x: 0, z: 0, width: 0.1, depth: 8 }] };
  const moved = moveWalker({ x: -1, z: 0 }, { x: 3, z: 1 }, wall);
  assert.ok(moved.x < 0);
  assert.ok(moved.z > 0.9);
  assert.equal(walkBlocked(moved, wall), false);
  assert.equal(walkBlocked(moveWalker({ x: -1, z: 0 }, { x: -20, z: 0 }, wall), wall), false);
});

test("no free position returns null instead of moving into furniture", () => {
  assert.equal(safeWalkPosition({ x: 0, z: 0 }, { ...context, obstacles: [{ x: 0, z: 0, width: 30, depth: 30 }] }), null);
});

test("physical WASD handles Korean IME and key release after language changes", () => {
  assert.equal(movementKey({ code: "KeyW", key: "ㅈ" }), "w");
  assert.equal(movementKey({ code: "KeyA", key: "ㅁ" }), "a");
  assert.equal(movementKey({ code: "KeyS", key: "ㄴ" }), "s");
  assert.equal(movementKey({ code: "KeyD", key: "ㅇ" }), "d");
  assert.equal(movementKey({ code: "KeyW", key: "w" }), "w");
  assert.equal(movementKey({ code: "ArrowUp", key: "ArrowUp" }), "arrowup");
});

test("jumping: a box blocks on the ground, can be cleared in the air, stood on, and furniture always blocks", async () => {
  const { groundAt, stepVertical } = await import("../js/three/walk-collision.js");
  const box = { x: 0, z: 0, width: 1.03, depth: 1.36, y: 0, height: 0.98, yaw: 0 };
  const bed = { x: 4, z: 0, width: 2, depth: 2 };
  const ctx = (feet, extra = {}) => ({ bounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 }, radius: 0.7, obstacles: [box, bed], feet, step: 0.08, ...extra });
  assert.equal(walkBlocked({ x: 0, z: 0 }, ctx(0)), true, "on the floor the box is in the way");
  assert.equal(walkBlocked({ x: 0, z: 0 }, ctx(1.0)), false, "feet above its top: over it");
  assert.equal(walkBlocked({ x: 4, z: 0 }, ctx(5)), true, "furniture has no height: never jumped over");
  assert.equal(groundAt({ x: 0, z: 0 }, ctx(1.0)), 0.98, "stands on the box");
  assert.equal(groundAt({ x: 0, z: 0 }, ctx(0)), 0, "not from below");
  // under a low sloping roof the box top is out of reach: it blocks even in the air
  const low = ctx(1.0, { ceilingAt: () => 3.5, headroom: 3.3 });
  assert.equal(walkBlocked({ x: 0, z: 0 }, low), true);
  // a jump of height 1.25 in 0.3 s peaks near 1.25 and lands back on the floor
  const g = 2 * 1.25 / 0.09;
  let state = { y: 0, vy: g * 0.3 }, peak = 0;
  for (let i = 0; i < 120; i++) { state = stepVertical(state, { dt: 1 / 120, ground: 0, gravity: g }); peak = Math.max(peak, state.y); }
  assert.ok(peak > 1.15 && peak < 1.3, `peak ${peak}`);
  assert.equal(state.y, 0);
  assert.equal(stepVertical({ y: 2, vy: 5 }, { dt: 0.1, ground: 0, gravity: g, maxFeet: 2 }).vy <= 0, true, "head hits the roof");
});
