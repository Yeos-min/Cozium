import test from "node:test";
import assert from "node:assert/strict";
import { FolderShelfAssignments, wallShelfSlots } from "../js/three/folder-shelves.js";
import { ATTIC_BOX, ATTIC_SHELF_RUNS, ATTIC_STACK } from "../js/three/attic-room.js";
import { TUNING } from "../js/three/tuning.js";

// the attic's box row (−x eave wall, two levels); the slot layout itself is checked in attic-room.test.js
const slots = wallShelfSlots(ATTIC_SHELF_RUNS, ATTIC_BOX, { ...ATTIC_STACK, height: TUNING.box.height });
const ids = n => Array.from({ length: n }, (_, i) => `folder-${i}`);

test("default assignment stays stable after adding and reordering folders", () => {
  const state = new FolderShelfAssignments();
  const initial = state.assign(ids(4), slots);
  const expanded = state.assign(ids(30).reverse(), slots);
  for (const [id, index] of initial) assert.equal(expanded.get(id), index);
  assert.equal(new Set(expanded.values()).size, 30);
});

test("new folders skip slots occupied by manually moved boxes", () => {
  const state = new FolderShelfAssignments();
  state.assign(ids(4), slots);
  const moved = { ...slots[4] };
  const assigned = state.assign(ids(5), slots, new Map([["folder-0", moved]]));
  assert.equal(assigned.get("folder-0"), 0);
  assert.equal(assigned.get("folder-4"), 5);
  assert.deepEqual(moved, slots[4]);
});

test("overflow uses another area rather than shrinking or placing boxes outside the room", () => {
  const assigned = new FolderShelfAssignments().assign(ids(70), slots);
  assert.equal(assigned.size, 70);
  assert.equal(new Set(assigned.values()).size, 70);
  assert.equal(Math.floor(assigned.get("folder-69") / slots.length), Math.floor(69 / slots.length));
  assert.ok(slots[assigned.get("folder-69") % slots.length]);
});
