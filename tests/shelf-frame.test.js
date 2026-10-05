import test from "node:test";
import assert from "node:assert/strict";
import { shelfFrames } from "../js/three/shelf-frame.js";
import { folderShelfSlots } from "../js/three/folder-shelves.js";

const slot = (column, level = 0) => ({
  x: column * 1.94, z: -4.82, y: 0.34 + level * 1.33, yaw: 0,
  width: 1.7, depth: 1.12, height: 1.08, slotId: `${level}:${column}`,
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`);

test("four adjacent boxes share two boards and five posts instead of four separate frames", () => {
  const input = Array.from({ length: 4 }, (_, i) => slot(i));
  const snapshot = structuredClone(input);
  const [frame] = shelfFrames(input);
  assert.equal(shelfFrames(input).length, 1);
  assert.equal(frame.parts.filter(part => part.kind === "board").length, 2);
  assert.equal(frame.parts.filter(part => part.kind === "divider").length, 5);
  assert.equal(frame.parts.filter(part => part.kind === "back").length, 1);
  assert.equal(frame.parts.filter(part => part.kind === "foot").length, 3);
  close(frame.parts.find(part => part.kind === "board").size[0], 4 * 1.94);
  assert.deepEqual(input, snapshot);
});

test("two tiers share their middle board and leave each box's full volume clear", () => {
  const input = [0, 1].flatMap(level => [0, 1, 2, 3].map(column => slot(column, level)));
  const [frame] = shelfFrames(input);
  assert.equal(frame.parts.filter(part => part.kind === "board").length, 3);
  assert.equal(frame.parts.filter(part => part.kind === "back").length, 1);
  assert.equal(frame.parts.filter(part => part.kind === "divider").length, 5);
  for (const box of input) for (const part of frame.parts) {
    const center = [box.x - frame.x, box.y + box.height / 2, 0];
    const size = [box.width, box.height, box.depth];
    const intersects = size.every((extent, axis) =>
      Math.abs(center[axis] - part.position[axis]) < (extent + part.size[axis]) / 2 - 0.0001);
    assert.equal(intersects, false, `${box.slotId} intersects ${part.kind}`);
  }
});

test("empty wall gaps and room corners are never bridged by a shared cabinet", () => {
  const input = [slot(0), slot(1), slot(4),
    { ...slot(0), x: -7.62, z: -2.88, yaw: Math.PI / 2, slotId: "side:0" },
    { ...slot(1), x: -7.62, z: -0.94, yaw: Math.PI / 2, slotId: "side:1" }];
  const frames = shelfFrames(input);
  assert.equal(frames.length, 3);
  const side = frames.find(frame => frame.yaw === Math.PI / 2);
  close(side.x, -7.62);
  close(side.z, -1.91);
  assert.deepEqual(side.slotIds, ["side:1", "side:0"]);
  assert.equal(side.parts.filter(part => part.kind === "board").length, 2);
});

test("4, 10 and 30 home slots remain covered exactly once without expanding into furniture", () => {
  const half = { x: 8.6, z: 5.8 };
  const furniture = [
    { x: -7.12, z: -0.9, width: 2.65, depth: 4.25 },
    { x: 7.48, z: -0.3, width: 1.95, depth: 3.6 },
    { x: 6.58, z: 0.65, width: 0.95, depth: 1.1 },
    { x: -7.07, z: -4.35, width: 1.2, depth: 1.2 },
    { x: 7.45, z: -3.7, width: 1.4, depth: 1.4 },
  ];
  const available = folderShelfSlots(half, furniture);
  for (const count of [4, 10, 30]) {
    const input = available.slice(0, count);
    const frames = shelfFrames(input);
    assert.deepEqual(frames.flatMap(frame => frame.slotIds).sort(), input.map(box => box.slotId).sort());
    for (const frame of frames) for (const part of frame.parts) {
      assert.ok(part.size.every(value => Number.isFinite(value) && value > 0));
      const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
      const x = frame.x + part.position[0] * c + part.position[2] * s;
      const z = frame.z - part.position[0] * s + part.position[2] * c;
      const width = Math.abs(c) * part.size[0] + Math.abs(s) * part.size[2];
      const depth = Math.abs(s) * part.size[0] + Math.abs(c) * part.size[2];
      assert.ok(Math.abs(x) + width / 2 < half.x);
      assert.ok(Math.abs(z) + depth / 2 < half.z);
      assert.equal(furniture.some(other =>
        Math.abs(x - other.x) < (width + other.width) / 2 - 0.0001 &&
        Math.abs(z - other.z) < (depth + other.depth) / 2 - 0.0001), false);
    }
  }
});

test("resyncing a duplicated slot does not add another board or post", () => {
  const input = [slot(0), slot(1)];
  assert.deepEqual(shelfFrames([...input, { ...input[0] }]), shelfFrames(input));
});
