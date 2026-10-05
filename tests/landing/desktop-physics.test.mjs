import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopPhysics, MAGNET_RADIUS, MAGNET_LIMIT } from "../../js/landing/desktop-physics.js";

const grid = Array.from({ length: 80 }, (_, index) => ({ id: `file-${index}`, x: 54 + index % 10 * 94, y: 45 + Math.floor(index / 10) * 100, width: 68, height: 68 }));
const advance = (model, duration = 6, dt = 1 / 60) => { for (let elapsed = 0; elapsed < duration - 1e-8; elapsed += dt) model.step(dt); return model.snapshot(); };
const center = (item) => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("the model preserves the desktop grid until the first explicit fall", () => {
  const model = createDesktopPhysics(grid), initial = model.snapshot();
  assert.equal(initial.phase, "grid");
  assert.equal(initial.moving, false);
  assert.equal(initial.boxCount, 0);
  assert.equal(initial.initialFallComplete, false);
  assert.equal(initial.landedCount, 0);
  initial.items.forEach((item, index) => {
    assert.equal(item.id, grid[index].id);
    assert.equal(item.x, grid[index].x);
    assert.equal(item.y, grid[index].y);
    assert.equal(item.rotation, 0);
    assert.equal(item.held, false);
    assert.equal(item.landed, false);
  });
  assert.deepEqual(model.step(.2), initial);
  assert.equal(model.beginGrab("file-0", center(initial.items[0])), false);
  assert.equal(model.fall(), true);
  assert.equal(model.fall(), false);
  const falling = model.step(.25);
  assert.equal(falling.phase, "falling");
  assert.ok(falling.items[0].y > initial.items[0].y);
});

test("all 80 icons fall into a bounded floor pile and stop requesting motion", () => {
  const model = createDesktopPhysics(grid);
  model.fall();
  const end = advance(model);
  assert.equal(end.phase, "settled");
  assert.equal(end.moving, false);
  assert.equal(end.items.length, 80);
  for (const item of end.items) {
    assert.ok([item.x, item.y, item.rotation, item.scale].every(Number.isFinite));
    assert.ok(item.x >= 0 && item.x + item.width <= 1672);
    assert.ok(item.y >= 0 && item.y + item.height <= 820);
    assert.ok(item.y > 460, `${item.id} remained at ${item.y}`);
    assert.ok(Math.abs(item.rotation) <= .44);
  }
  assert.ok(end.items.some((item) => item.y === 752));
  assert.ok(Math.max(...end.items.map((item) => item.x + item.width)) < 1672 * .7);
  for (let i = 0; i < end.items.length; i++) for (let j = i + 1; j < end.items.length; j++) {
    const a = center(end.items[i]), b = center(end.items[j]);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 46, `${i} and ${j} overlap excessively`);
  }
  assert.deepEqual(advance(model), end);
});

test("fixed steps produce the same pile across different frame rates", () => {
  const a = createDesktopPhysics(grid), b = createDesktopPhysics(grid);
  a.fall(); b.fall();
  const endA = advance(a, 6, 1 / 60), endB = advance(b, 6, 1 / 120);
  assert.deepEqual(endA, endB);
});

test("the landing manifest's IDs settle in under three seconds and leave room for the box", () => {
  const sourceGrid = grid.map((item, index) => ({ ...item, id: `file-r${String(Math.floor(index / 10) + 1).padStart(2, "0")}-c${String(index % 10 + 1).padStart(2, "0")}` }));
  const model = createDesktopPhysics(sourceGrid);
  model.fall();
  const settled = advance(model, 3);
  assert.equal(settled.phase, "settled");
  assert.ok(Math.max(...settled.items.map((item) => item.x + item.width)) < 1170);
  assert.ok(Math.min(...settled.items.map((item) => item.y)) > 550);
  assert.ok(settled.items.every((item) => item.y + item.height <= 820));
});

test("initial landing completes as soon as every file reaches the floor or its pile", () => {
  const sourceGrid = grid.map((item, index) => ({ ...item, id: `file-r${String(Math.floor(index / 10) + 1).padStart(2, "0")}-c${String(index % 10 + 1).padStart(2, "0")}` }));
  const model = createDesktopPhysics(sourceGrid);
  model.fall();
  let elapsed = 0, landing = model.snapshot();
  while (!landing.initialFallComplete && elapsed < 1.2) { landing = model.step(1 / 120); elapsed += 1 / 120; }
  assert.equal(landing.initialFallComplete, true);
  assert.equal(landing.landedCount, 80);
  assert.equal(landing.phase, "falling");
  assert.equal(landing.moving, true);
  assert.ok(elapsed > .6 && elapsed < 1.2);
  assert.ok(landing.items.every((item) => item.landed));
  assert.ok(landing.items.some((item) => item.y < 700));
  const bouncing = advance(model, .2);
  assert.equal(bouncing.initialFallComplete, true);
  assert.equal(bouncing.landedCount, 80);
  assert.equal(bouncing.phase, "falling");
  const settled = advance(model, 3);
  assert.equal(settled.initialFallComplete, true);
  assert.equal(settled.phase, "settled");
});

test("airborne collisions do not count as landing", () => {
  const model = createDesktopPhysics([{ id: "air-a", x: 300, y: 100 }, { id: "air-b", x: 300, y: 110 }]);
  model.fall();
  const airborne = model.step(.25);
  assert.ok(Math.hypot(airborne.items[0].x - airborne.items[1].x, airborne.items[0].y - airborne.items[1].y) > 40);
  assert.ok(airborne.items.every((item) => item.y + item.height < 820));
  assert.ok(airborne.items.every((item) => !item.landed));
  assert.equal(airborne.landedCount, 0);
  assert.equal(airborne.initialFallComplete, false);
});

test("floor support propagates up a pile before the upper file touches the floor", () => {
  const model = createDesktopPhysics([{ id: "lower", x: 300, y: 752 }, { id: "upper", x: 300, y: 705 }]);
  model.fall();
  const supported = model.step(1 / 120);
  assert.equal(supported.landedCount, 2);
  assert.equal(supported.initialFallComplete, true);
  assert.equal(supported.phase, "falling");
  assert.ok(supported.items[1].y + supported.items[1].height < 820);
  assert.ok(supported.items.every((item) => item.landed));
});

test("initial landing stays latched through a pickup and cancellation, then reset clears it", () => {
  const model = createDesktopPhysics(grid), original = model.snapshot();
  model.fall();
  const landed = advance(model);
  assert.equal(landed.initialFallComplete, true);
  model.beginGrab(landed.items[0].id, center(landed.items[0]));
  model.moveGrab({ x: 1200, y: 300 });
  advance(model, .3);
  assert.equal(model.snapshot().initialFallComplete, true);
  assert.equal(model.snapshot().landedCount, 80);
  model.cancelGrab();
  assert.equal(model.snapshot().initialFallComplete, true);
  assert.equal(model.snapshot().landedCount, 80);
  assert.deepEqual(model.reset(), original);
  assert.equal(model.snapshot().initialFallComplete, false);
  assert.equal(model.snapshot().landedCount, 0);
  assert.ok(model.snapshot().items.every((item) => !item.landed));
});

test("magnet hold collects only nearby files and makes them follow the pointer smoothly", () => {
  const model = createDesktopPhysics(grid);
  model.fall();
  const settled = advance(model);
  const chosen = settled.items[30], point = center(chosen);
  assert.equal(model.beginGrab(chosen.id, point), true);
  const held = model.snapshot();
  assert.equal(held.phase, "held");
  assert.equal(held.grabbedIds[0], chosen.id);
  assert.ok(held.grabbedIds.length > 1 && held.grabbedIds.length <= MAGNET_LIMIT);
  for (const id of held.grabbedIds) {
    const item = settled.items.find((entry) => entry.id === id), itemCenter = center(item);
    assert.ok(Math.hypot(itemCenter.x - point.x, itemCenter.y - point.y) <= MAGNET_RADIUS + 1e-7);
  }
  assert.equal(model.beginGrab("file-2", point), false);
  const target = { x: 1280, y: 490 };
  assert.equal(model.moveGrab(target), true);
  assert.equal(model.snapshot().items[30].x, chosen.x);
  const following = advance(model, 1);
  const chosenCenter = center(following.items[30]);
  near(chosenCenter.x, target.x, .5);
  near(chosenCenter.y, target.y, .5);
  assert.ok(following.items.filter((item) => item.held).every((item) => Math.hypot(center(item).x - target.x, center(item).y - target.y) < 90));
});

test("a lone file continuously recruits a fresh pile along a fast pointer sweep", () => {
  const model = createDesktopPhysics([
    { id: "lone", x: 50, y: 700 },
    { id: "crossed", x: 610, y: 700 },
    { id: "fresh", x: 1010, y: 700 },
    { id: "distant", x: 1570, y: 700 },
  ], { pileWidth: 1672 });
  model.fall();
  const pile = advance(model);
  model.beginGrab("lone", center(pile.items[0]));
  assert.deepEqual(model.snapshot().grabbedIds, ["lone"]);
  const crossedBefore = pile.items[1];
  const end = { x: 1100, y: 786 };
  model.moveGrab(end);
  const recruited = model.snapshot();
  assert.ok(Math.hypot(center(crossedBefore).x - end.x, center(crossedBefore).y - end.y) > MAGNET_RADIUS);
  assert.deepEqual(new Set(recruited.grabbedIds), new Set(["lone", "crossed", "fresh"]));
  assert.ok(!recruited.items[3].held);
  near(recruited.items[1].x, crossedBefore.x);
  near(recruited.items[1].y, crossedBefore.y);
  const following = advance(model, 1);
  assert.ok(following.items[1].x > crossedBefore.x + 300);
  assert.ok(!following.items[3].held);
});

test("holding still continues to acquire a file that falls into the pickup radius", () => {
  const model = createDesktopPhysics([
    { id: "held", x: 50, y: 700 },
    { id: "approaching", x: 220, y: 0 },
    { id: "far", x: 1430, y: 0 },
  ], { pileWidth: 1672 });
  model.fall();
  model.beginGrab("held", center(model.snapshot().items[0]));
  assert.deepEqual(model.snapshot().grabbedIds, ["held"]);
  const after = advance(model, 1.2);
  assert.ok(after.grabbedIds.includes("approaching"));
  assert.ok(!after.grabbedIds.includes("far"));
});

test("joining a second pile preserves the anchor and existing follower slots", () => {
  const items = [{ id: "anchor", x: 50, y: 700 }, { id: "first", x: 125, y: 700 }, { id: "new", x: 880, y: 700 }];
  const growing = createDesktopPhysics(items), fixed = createDesktopPhysics(items, { maxCluster: 2 });
  growing.fall(); fixed.fall();
  advance(growing); advance(fixed);
  const point = center(growing.snapshot().items[0]);
  growing.beginGrab("anchor", point); fixed.beginGrab("anchor", point);
  assert.deepEqual(growing.snapshot().grabbedIds, ["anchor", "first"]);
  growing.moveGrab({ x: 950, y: 786 }); fixed.moveGrab({ x: 950, y: 786 });
  assert.deepEqual(growing.snapshot().grabbedIds, ["anchor", "first", "new"]);
  const a = advance(growing, .4), b = advance(fixed, .4);
  for (const id of ["anchor", "first"]) {
    const itemA = a.items.find((item) => item.id === id), itemB = b.items.find((item) => item.id === id);
    near(itemA.x, itemB.x); near(itemA.y, itemB.y); near(itemA.rotation, itemB.rotation);
  }
});

test("dropping the pointer inside the mouth deposits the entire trailing group once", () => {
  const model = createDesktopPhysics(grid);
  model.fall();
  const settled = advance(model), chosen = settled.items[0];
  model.beginGrab(chosen.id, center(chosen));
  model.moveGrab({ x: 1310, y: 620 });
  const ids = model.snapshot().grabbedIds;
  // No follow step: even the visibly trailing neighbors enter with their grip.
  const deposited = model.releaseGrab({ x: 1250, y: 590, width: 150, height: 70 });
  assert.deepEqual(deposited, ids);
  const after = model.snapshot();
  assert.equal(after.boxCount, ids.length);
  assert.deepEqual(after.grabbedIds, []);
  for (const item of after.items) {
    assert.equal(item.deposited, ids.includes(item.id));
    assert.equal(item.held, false);
    assert.equal(item.scale, item.deposited ? 0 : 1);
  }
  assert.deepEqual(model.releaseGrab({ x: 0, y: 0, width: 1672, height: 941 }), []);
  assert.equal(model.snapshot().boxCount, ids.length);
  assert.equal(model.beginGrab(chosen.id, center(chosen)), false);
});

test("repeated sweeps respect the group cap and deposit each ID only once", () => {
  const model = createDesktopPhysics(grid);
  model.fall(); advance(model);
  const item = model.snapshot().items[0];
  model.beginGrab(item.id, center(item));
  for (let index = 0; index < 10; index++) model.moveGrab({ x: index % 2 ? 50 : 1120, y: 700 });
  const heldIds = model.snapshot().grabbedIds;
  assert.equal(heldIds.length, MAGNET_LIMIT);
  assert.equal(new Set(heldIds).size, heldIds.length);
  model.moveGrab({ x: 1300, y: 620 });
  const deposited = model.releaseGrab({ x: 1250, y: 590, width: 150, height: 70 });
  assert.equal(new Set(deposited).size, MAGNET_LIMIT);
  assert.equal(model.snapshot().boxCount, MAGNET_LIMIT);
});

test("80 files pack in three deliberate sweep trips with the larger pickup defaults", () => {
  const model = createDesktopPhysics(grid);
  model.fall(); advance(model);
  const counts = [], depositedIds = new Set();
  while (model.snapshot().boxCount < grid.length) {
    const item = model.snapshot().items.filter((entry) => !entry.deposited).sort((a, b) => a.x - b.x)[0];
    assert.equal(model.beginGrab(item.id, center(item)), true);
    model.moveGrab({ x: 1120, y: 700 });
    model.moveGrab({ x: 1300, y: 620 });
    const deposited = model.releaseGrab({ x: 1250, y: 590, width: 150, height: 70 });
    for (const id of deposited) { assert.ok(!depositedIds.has(id)); depositedIds.add(id); }
    counts.push(deposited.length);
    assert.ok(counts.length <= 4);
    advance(model, .4);
  }
  assert.deepEqual(counts, [28, 28, 24]);
  assert.equal(depositedIds.size, 80);
  assert.equal(model.snapshot().phase, "complete");
});

test("an outside drop and a pointer cancellation return files to natural gravity", () => {
  for (const cancel of [false, true]) {
    const model = createDesktopPhysics(grid);
    model.fall();
    const settled = advance(model), chosen = settled.items[0];
    model.beginGrab(chosen.id, center(chosen));
    model.moveGrab({ x: 1200, y: 300 });
    advance(model, .8);
    const before = model.snapshot();
    if (cancel) model.cancelGrab();
    else assert.deepEqual(model.releaseGrab({ x: 1250, y: 590, width: 150, height: 70 }), []);
    const released = model.snapshot();
    assert.equal(released.boxCount, 0);
    assert.equal(released.phase, "falling");
    assert.ok(released.items.every((item) => !item.held && !item.deposited));
    near(released.items[0].x, before.items[0].x);
    near(released.items[0].y, before.items[0].y);
    const end = advance(model);
    assert.equal(end.phase, "settled");
    assert.ok(end.items[0].y > before.items[0].y + 100);
  }
});

test("all groups can be deposited to completion and reset exactly restores the source grid", () => {
  const model = createDesktopPhysics(grid), original = model.snapshot();
  model.fall(); advance(model);
  let pickups = 0;
  while (model.snapshot().boxCount < 80) {
    const item = model.snapshot().items.find((entry) => !entry.deposited);
    assert.equal(model.beginGrab(item.id, center(item)), true);
    model.moveGrab({ x: 1300, y: 600 });
    assert.ok(model.releaseGrab({ x: 1250, y: 590, width: 150, height: 70 }).length > 0);
    assert.ok(++pickups <= 80);
  }
  assert.equal(model.snapshot().phase, "complete");
  assert.equal(model.snapshot().moving, false);
  assert.ok(model.snapshot().items.every((item) => item.deposited && item.scale === 0));
  assert.deepEqual(model.reset(), original);
  model.fall();
  assert.deepEqual(advance(model), (() => { const fresh = createDesktopPhysics(grid); fresh.fall(); return advance(fresh); })());
});

test("invalid inputs cannot corrupt state and snapshots do not expose mutable bodies", () => {
  assert.throws(() => createDesktopPhysics(null));
  assert.throws(() => createDesktopPhysics([{ id: "same" }, { id: "same" }]));
  const model = createDesktopPhysics(grid);
  const original = model.snapshot();
  original.items[0].x = Infinity;
  assert.equal(model.snapshot().items[0].x, 54);
  model.fall();
  const falling = model.snapshot();
  for (const dt of [undefined, NaN, Infinity, -1, "bad"]) assert.deepEqual(model.step(dt), falling);
  assert.equal(model.beginGrab("missing", { x: 1, y: 1 }), false);
  assert.equal(model.beginGrab("file-0", { x: Infinity, y: 1 }), false);
  advance(model);
  assert.equal(model.beginGrab("file-0", center(model.snapshot().items[0])), true);
  const held = model.snapshot();
  assert.equal(model.moveGrab({ x: 2, y: NaN }), false);
  assert.deepEqual(model.snapshot(), held);
  assert.deepEqual(model.releaseGrab({ x: 0, y: 0, width: -10, height: 1 }), []);
});
