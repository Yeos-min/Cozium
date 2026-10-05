import assert from "node:assert/strict";
import test from "node:test";
import { SessionStore } from "../js/state/session-store.js";
import { SAMPLE_FILES } from "../js/providers/sample-desktop.js";
import { LAYOUT_DEFAULTS, rectsOverlap } from "../js/ui/layout.js";
import { FLOOR_LAYOUT, floorSlots, placeFloorItems, rotatedRect } from "../js/ui/floor-layout.js";
import { reservePileShape, stackHeights } from "../js/three/stacking.js";
import { TUNING } from "../js/three/tuning.js";

const BOUNDS = { x: 0, y: 150, width: 1280, height: 570 };
const CARD = LAYOUT_DEFAULTS.card;
const files = (count) => Array.from({ length: count }, (_, i) => ({ ...SAMPLE_FILES[i % SAMPLE_FILES.length], id: `f${i}` }));
const rectangles = (spots) => [...spots.values()].map(spot => rotatedRect({ ...spot, ...CARD }));

test("24 files have varied rotations but never overlap, including rotated corners", () => {
  for (const seed of [0, 1, 42, 123, 999]) {
    const slots = floorSlots(BOUNDS, {}, seed);
    assert.equal(slots.length, 24);
    assert.ok(new Set(slots.map(slot => slot.rot)).size > 12);
    assert.ok(slots.some(slot => slot.rot < 0) && slots.some(slot => slot.rot > 0));
    assert.ok(slots.every(slot => Math.abs(slot.rot) <= FLOOR_LAYOUT.rotation));
    const rects = rectangles(slots);
    rects.forEach((rect, index) => {
      assert.ok(rect.x >= BOUNDS.x && rect.y >= BOUNDS.y);
      assert.ok(rect.x + rect.width <= BOUNDS.x + BOUNDS.width);
      assert.ok(rect.y + rect.height <= BOUNDS.y + BOUNDS.height);
      const overlapping = rects.filter((other, j) => j !== index && rectsOverlap(rect, other));
      assert.equal(overlapping.length, 0, "every file face must remain fully exposed");
    });
  }
});

test("photos, notes and generic cards all start directly on the floor", () => {
  const store = new SessionStore({ bounds: BOUNDS, layout: { mode: "floor" }, seed: 123 });
  const extensions = ["png", "txt", "pdf", "blend"];
  store.addFiles(files(24).map((file, i) => ({ ...file, extension: extensions[i % extensions.length] })));
  const entries = store.boardEntries.sort((a, b) => a.stackSeq - b.stackSeq);
  const heights = stackHeights(entries.map(entry => ({ id: entry.id, ...entry.position, ...entry.item })), CARD);
  assert.equal(heights.size, 24);
  for (const height of heights.values()) assert.equal(height, 0);
});

test("overflow stays queued; small areas never put files outside bounds; same seed preserves the arrangement", () => {
  for (const bounds of [BOUNDS, { x: 30, y: 15, width: 980, height: 720 },
    { x: 0, y: 0, width: 500, height: 300 }, { x: 0, y: 0, width: 100, height: 100 }]) {
    const items = files(147);
    const first = placeFloorItems({ items, bounds, seed: 123 });
    assert.equal(first.size, floorSlots(bounds).length);
    assert.deepEqual(first, placeFloorItems({ items, bounds, seed: 123 }));
    for (const rect of rectangles(first)) {
      assert.ok(rect.x >= bounds.x && rect.y >= bounds.y);
      assert.ok(rect.x + rect.width <= bounds.x + bounds.width);
      assert.ok(rect.y + rect.height <= bounds.y + bounds.height);
    }
  }
  const store = new SessionStore({ bounds: BOUNDS, layout: { mode: "floor" }, seed: 123 });
  store.addFiles(files(147));
  assert.equal(store.unprocessedCount, 24);
  assert.equal(store.queuedCount, 123);
});

function move(store, ids, batchId = "move") {
  store.beginBatch(ids, "folder");
  store.applyMoveResult({ batchId, folderId: "folder", failed: [], moved: ids.map(fileId => ({
    fileId, folderId: "folder", batchId, moveId: `${batchId}:${fileId}`, movedAt: 1,
  })) });
}

test("clearing some files leaves their floor empty and other files fixed; undo restores the same positions", () => {
  const store = new SessionStore({ bounds: BOUNDS, layout: { mode: "floor" }, seed: 123 });
  store.setFolders([{ id: "folder", name: "정리", parentId: null, path: ["정리"] }]);
  store.addFiles(files(45));
  const before = new Map(store.boardEntries.map(entry => [entry.id, { ...entry.position }]));
  const removed = store.boardEntries.sort((a, b) => a.stackSeq - b.stackSeq).slice(0, 8).map(entry => entry.id);
  move(store, removed);
  assert.equal(store.unprocessedCount, 16);
  assert.equal(store.queuedCount, 21, "empty space must not auto-refill");
  store.setBounds({ ...BOUNDS });
  for (const entry of store.boardEntries) assert.deepEqual(entry.position, before.get(entry.id));
  store.applyUndoResult({ batchId: "move", failed: [], restored: removed.map(fileId => ({ fileId })) });
  for (const entry of store.boardEntries) assert.deepEqual(entry.position, before.get(entry.id));
  move(store, store.boardEntries.map(entry => entry.id), "clear");
  assert.equal(store.unprocessedCount, 0);
  assert.equal(store.queuedCount, 21);
  assert.equal(store.supply({ force: true }).length, 21);
});

test("manual refill replaces cleared files without moving or covering any remaining file", () => {
  const store = new SessionStore({ bounds: BOUNDS, layout: { mode: "floor" }, seed: 123 });
  store.setFolders([{ id: "folder", name: "정리", parentId: null, path: ["정리"] }]);
  store.addFiles(files(45));
  const ordered = store.boardEntries.sort((a, b) => a.stackSeq - b.stackSeq);
  const keep = ordered[0];
  move(store, ordered.slice(1, 8).map(entry => entry.id));
  const existing = store.boardEntries.map(entry => ({ id: entry.id, ...entry.position, ...CARD }));
  const before = { ...keep.position };
  const ids = store.supply({ force: true });
  assert.equal(ids.length, 7, "all seven cleared positions can be reused individually");
  assert.deepEqual(keep.position, before);
  for (const id of ids) {
    const rect = rotatedRect({ ...store.entry(id).position, ...CARD });
    for (const previous of existing) assert.equal(rectsOverlap(rect, rotatedRect(previous)), false);
  }
});

test("a large pending pile shrinks with each wave and disappears at zero", () => {
  const whole = reservePileShape(147, 147);
  const first = reservePileShape(123, 147);
  const second = reservePileShape(99, 147);
  assert.ok(whole.height > first.height && first.height > second.height);
  assert.ok(whole.layers >= first.layers && first.layers >= second.layers);
  assert.deepEqual(reservePileShape(0, 147), { layers: 0, height: 0 });
  assert.deepEqual(reservePileShape(1, 1), { layers: 1, height: TUNING.card.thickness });
  assert.ok(reservePileShape(3, 3).layers <= 3);
  assert.ok(Number.isFinite(reservePileShape(1, 0).height));
});
