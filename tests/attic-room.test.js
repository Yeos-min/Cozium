import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTIC_BOOKS, ATTIC_BOX, ATTIC_CARD, ATTIC_FLOOR, ATTIC_FLOOR_LAYOUT, ATTIC_HALF, ATTIC_HOME_CAPACITY, ATTIC_OBSTACLES, ATTIC_PILE,
  ATTIC_PINBOARD, ATTIC_SHELF_RUNS, ATTIC_SPAWN, ATTIC_STACK, ATTIC_WALK, atticCeilingAt, atticFloorBounds, atticSlotArea, bookSlot, pinboardPose,
} from "../js/three/attic-room.js";
import { wallShelfSlots } from "../js/three/folder-shelves.js";
import { overlaps, rotatedSize } from "../js/three/box-placement.js";
import { walkBlocked } from "../js/three/walk-collision.js";
import { floorSlotCount, floorSlots, rotatedRect } from "../js/ui/floor-layout.js";
import { TUNING, UNIT } from "../js/three/tuning.js";

const floorRect = {
  x: (ATTIC_FLOOR.minX + ATTIC_FLOOR.maxX) / 2, z: (ATTIC_FLOOR.minZ + ATTIC_FLOOR.maxZ) / 2,
  width: ATTIC_FLOOR.maxX - ATTIC_FLOOR.minX, depth: ATTIC_FLOOR.maxZ - ATTIC_FLOOR.minZ,
};
const shelves = wallShelfSlots(ATTIC_SHELF_RUNS, ATTIC_BOX, { ...ATTIC_STACK, height: TUNING.box.height });
const config = { card: ATTIC_CARD, floor: ATTIC_FLOOR_LAYOUT, slotArea: atticSlotArea(UNIT) };

test("the attic floor holds a full wave of 24 cards in its first slots, all on the open floor", () => {
  const bounds = atticFloorBounds(UNIT);
  assert.equal(floorSlotCount(bounds, config), 24);
  for (const slot of floorSlots(bounds, config, 7)) {
    const rect = rotatedRect({ ...slot, ...ATTIC_CARD });
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= bounds.width && rect.y + rect.height <= bounds.height);
    const world = { x: ATTIC_FLOOR.minX + (rect.x + rect.width / 2) * UNIT, z: ATTIC_FLOOR.minZ + (rect.y + rect.height / 2) * UNIT,
      width: rect.width * UNIT, depth: rect.height * UNIT };
    assert.equal(ATTIC_OBSTACLES.some((obstacle) => overlaps(world, obstacle)), false, "a card under furniture");
  }
  assert.equal(ATTIC_OBSTACLES.some((obstacle) => overlaps(floorRect, obstacle, 0)), false);
  // turned so their tops face the box wall, in rows parallel to it, between the player and the boxes
  const slots = floorSlots(bounds, config, 7);
  assert.ok(slots.every((slot) => Math.abs(slot.rot - 90) <= 7.0001));
  const worldX = slots.map((slot) => ATTIC_FLOOR.minX + (slot.x + ATTIC_CARD.width / 2) * UNIT);
  assert.equal(new Set(worldX.map((x) => x.toFixed(2))).size, 4, "four rows across the room");
  const boxFront = Math.max(...shelves.map((slot) => slot.x + rotatedSize(slot).width / 2));
  assert.ok(Math.min(...worldX) - boxFront > 3, "a clear walk in front of the boxes");
  assert.ok(Math.max(...worldX) < ATTIC_SPAWN.x - 3);
});

test("folder boxes line the low −x eave wall in two stacks, clear of furniture, the file floor and the sloping roof", () => {
  assert.ok(shelves.length >= 16, `${shelves.length} slots`);
  assert.equal(new Set(shelves.map((slot) => slot.slotId)).size, shelves.length);
  for (const [i, slot] of shelves.entries()) {
    const size = rotatedSize(slot);
    assert.ok(Math.abs(slot.x) + size.width / 2 < ATTIC_HALF.x && Math.abs(slot.z) + size.depth / 2 < ATTIC_HALF.z);
    assert.equal(ATTIC_OBSTACLES.some((obstacle) => overlaps(slot, obstacle)), false, `slot ${slot.slotId} in furniture`);
    assert.equal(overlaps(slot, floorRect), false, `slot ${slot.slotId} on the file floor`);
    // the top box must stay under the roof at its outer edge (no shelf board any more)
    const outer = Math.abs(slot.x) + size.width / 2;
    assert.ok(slot.y + slot.height < atticCeilingAt(outer) - 0.1, `slot ${slot.slotId} pokes through the roof`);
    // against the −x wall, front (+Z) turned to face the room (+x)
    assert.ok(slot.x < -ATTIC_HALF.x + 1.6 && Math.abs(Math.sin(slot.yaw) - 1) < 1e-9);
    assert.equal(shelves.slice(0, i).some((other) => other.y === slot.y && overlaps(slot, other)), false);
  }
  // the first boxes sit in the middle of the wall, one either side; the second level stands right on the first
  assert.ok(Math.abs(shelves[0].z) < 1.2 && Math.abs(shelves[1].z) < 1.2 && shelves[0].z * shelves[1].z < 0);
  const ground = shelves.filter((slot) => slot.y === 0), upper = shelves.filter((slot) => slot.y > 0);
  assert.equal(ground.length, upper.length);
  for (const slot of upper) assert.ok(ground.some((g) => g.x === slot.x && g.z === slot.z && Math.abs(slot.y - TUNING.box.height) < 0.05));
});

test("the player starts clear of furniture, under a high enough roof, with the pile and books beside them", () => {
  const context = { obstacles: ATTIC_OBSTACLES, radius: TUNING.firstPerson.bodyRadius, bounds: ATTIC_WALK };
  assert.equal(walkBlocked(ATTIC_SPAWN, context), false);
  for (const x of [ATTIC_WALK.minX, ATTIC_WALK.maxX]) assert.ok(atticCeilingAt(x) > TUNING.firstPerson.eyeHeight + 0.4);
  const pile = { ...ATTIC_PILE, width: 1.3, depth: 0.9 };
  assert.equal(shelves.some((slot) => overlaps(pile, { ...slot, width: slot.width + 0.2 })), false);
  assert.equal(overlaps(pile, floorRect), false);
});

test("pinboard and book slots are distinct, inside their places, and cover the home capacity", () => {
  const pins = Array.from({ length: ATTIC_HOME_CAPACITY.pinboard }, (_, i) => pinboardPose(i));
  for (const pose of pins) {
    assert.ok(pose.x > ATTIC_PINBOARD.minX - 0.1 && pose.x < ATTIC_PINBOARD.maxX + 0.1);
    assert.ok(pose.y > ATTIC_PINBOARD.minY - 0.1 && pose.y < ATTIC_PINBOARD.maxY + 0.1);
    assert.equal(pose.facePitch, Math.PI / 2);
  }
  const cells = new Set(pins.map((pose) => `${Math.round(pose.x * 4)}:${Math.round(pose.y * 4)}`));
  assert.equal(cells.size, pins.length);
  // the first image goes top left as seen from the room (room left = +x when facing the +z wall)
  assert.ok(pins[0].x > pins[1].x && pins[0].y > pins[ATTIC_PINBOARD.cols].y);
  const books = Array.from({ length: ATTIC_HOME_CAPACITY.books }, (_, i) => bookSlot(i));
  assert.equal(new Set(books.map((slot) => `${slot.stack}:${slot.level}`)).size, books.length);
  assert.deepEqual(bookSlot(1), { stack: 0, level: 1 }, "one pile fills before the next");
  assert.ok(books.every((slot) => slot.level < ATTIC_BOOKS.perStack));
});
