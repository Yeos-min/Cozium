import assert from "node:assert/strict";
import test from "node:test";
import { CLOSED_RECT, FOCUS_DURATION, ROOM_FRONT, ROOM_RIGHT, ROOM_TOP, getFocusTransition } from "../../js/landing/scene-transition.js";
import { getOverheadMatrix } from "../../js/landing/tape-renderer.js";

const viewports = [[1280, 720], [1920, 1080], [2934, 1532], [1024, 768], [390, 844]];
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function initialRoom(width, height) {
  const scale = Math.max(width / 1672, height / 941) * 1.02;
  return { scale, ix: (width - 1672 * scale) / 2 + 3, iy: (height - 941 * scale) / 2 - 2, iw: 1672 * scale, ih: 941 * scale };
}

function expectedQuad(points, matrix) {
  return points.map(([x, y]) => [matrix.x + x * matrix.scale, matrix.y + y * matrix.scale]);
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
}

function area(quad) {
  const [originX, originY] = quad[0];
  return quad.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = quad[(index + 1) % quad.length];
    return sum + (x - originX) * (nextY - originY) - (nextX - originX) * (y - originY);
  }, 0) / 2;
}

test("the first transition frame matches the clicked room camera and existing box top", () => {
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height), start = getFocusTransition(room, width, height, 0);
    for (const [property, value] of Object.entries(room)) near(start.room[property], value);
    const target = expectedQuad(ROOM_TOP, { x: room.ix, y: room.iy, scale: room.scale });
    start.quad.forEach((point, index) => point.forEach((value, axis) => near(value, target[index][axis])));
    assert.equal(start.foreground, 1);
    assert.equal(start.roomBox, 1);
    for (const property of ["face", "floor", "shadow", "handoff"]) assert.equal(start[property], 0);
    assert.equal(start.done, false);
  }
});

test("the settled frame exactly reaches the existing overhead camera without extra zoom", () => {
  assert.ok(FOCUS_DURATION > 0 && Number.isFinite(FOCUS_DURATION));
  for (const [width, height] of viewports) {
    const end = getFocusTransition(initialRoom(width, height), width, height, 1);
    const overhead = getOverheadMatrix(width, height);
    assert.deepEqual(end.overhead, overhead);
    const target = expectedQuad(CLOSED_RECT, overhead);
    end.quad.forEach((point, index) => point.forEach((value, axis) => near(value, target[index][axis])));
    near(end.room.scale, overhead.scale * 2.4);
    near(end.room.ix + 852 * end.room.scale, overhead.x + 835.5 * overhead.scale);
    near(end.room.iy + 581.5 * end.room.scale, overhead.y + 446 * overhead.scale);
    assert.equal(end.foreground, 0);
    assert.equal(end.roomBox, 0);
    for (const property of ["face", "floor", "shadow", "handoff"]) assert.equal(end[property], 1);
    assert.equal(end.done, true);
  }
});

test("invalid and out-of-range progress stays at the first or last pose", () => {
  const room = initialRoom(1920, 1080);
  for (const progress of [-1e6, -.01, -Infinity, NaN, undefined, "invalid"]) assert.deepEqual(getFocusTransition(room, 1920, 1080, progress), getFocusTransition(room, 1920, 1080, 0));
  for (const progress of [1.01, 1e6, Infinity]) assert.deepEqual(getFocusTransition(room, 1920, 1080, progress), getFocusTransition(room, 1920, 1080, 1));
});

test("the moving box remains finite and strictly convex without reversing its faces", () => {
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height);
    for (let step = 0; step <= 1000; step++) {
      const state = getFocusTransition(room, width, height, step / 1000);
      assert.ok([...state.quad.flat(), state.room.ix, state.room.iy, state.room.scale].every(Number.isFinite));
      for (let corner = 0; corner < 4; corner++) assert.ok(cross(state.quad[corner], state.quad[(corner + 1) % 4], state.quad[(corner + 2) % 4]) > 0);
      for (const property of ["foreground", "roomBox", "face", "floor", "shadow", "handoff"]) assert.ok(state[property] >= 0 && state[property] <= 1);
    }
  }
});

test("zoom keeps the box anchor between its clicked position and overhead target without overshooting", () => {
  const tolerance = 1e-9;
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height), matrix = getOverheadMatrix(width, height);
    const start = [room.ix + 852 * room.scale, room.iy + 581.5 * room.scale];
    const target = [matrix.x + 835.5 * matrix.scale, matrix.y + 446 * matrix.scale];
    const limits = [width, height];
    let previousAnchor = start, previousCenter = start;
    for (let step = 0; step <= 1000; step++) {
      const state = getFocusTransition(room, width, height, step / 1000);
      const anchor = [state.room.ix + 852 * state.room.scale, state.room.iy + 581.5 * state.room.scale];
      const center = state.quad.reduce((sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4], [0, 0]);
      for (let axis = 0; axis < 2; axis++) {
        const low = Math.min(start[axis], target[axis]), high = Math.max(start[axis], target[axis]);
        for (const point of [anchor, center]) {
          assert.ok(point[axis] >= low - tolerance && point[axis] <= high + tolerance, `box focus overshot at ${width}×${height}, progress ${step / 1000}`);
          assert.ok(point[axis] >= -tolerance && point[axis] <= limits[axis] + tolerance, `box focus left the viewport at ${width}×${height}`);
        }
        assert.ok(Math.abs(target[axis] - anchor[axis]) <= Math.abs(target[axis] - previousAnchor[axis]) + tolerance);
        assert.ok(Math.abs(target[axis] - center[axis]) <= Math.abs(target[axis] - previousCenter[axis]) + tolerance);
      }
      previousAnchor = anchor;
      previousCenter = center;
    }
  }
});

test("foreground leaves before the new floor appears and the replacement top owns the disappearing box", () => {
  const room = initialRoom(1920, 1080);
  for (let step = 0; step <= 1000; step++) {
    const state = getFocusTransition(room, 1920, 1080, step / 1000);
    if (state.floor > 0) assert.equal(state.foreground, 0);
    if (state.roomBox === 0) assert.equal(state.face, 1);
    if (state.handoff > 0) {
      assert.equal(state.foreground, 0);
      assert.equal(state.roomBox, 0);
      assert.equal(state.face, 1);
      assert.equal(state.floor, 1);
      assert.equal(state.shadow, 1);
    }
  }
});

test("a partial final handoff cannot report completion before tape input may be enabled", () => {
  const room = initialRoom(1920, 1080);
  for (const progress of [0, .38, .8, .92, .93, .99, .999999]) assert.equal(getFocusTransition(room, 1920, 1080, progress).done, false);
  const mixed = getFocusTransition(room, 1920, 1080, .96);
  assert.ok(mixed.handoff > 0 && mixed.handoff < 1);
  assert.equal(mixed.done, false);
  assert.equal(getFocusTransition(room, 1920, 1080, 1).done, true);
});

test("the full-scene handoff starts only after the warped box is within a small edge tolerance", () => {
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height), matrix = getOverheadMatrix(width, height);
    const target = expectedQuad(CLOSED_RECT, matrix);
    for (let step = 921; step <= 1000; step++) {
      const state = getFocusTransition(room, width, height, step / 1000);
      for (let corner = 0; corner < 4; corner++) {
        const distance = Math.hypot(state.quad[corner][0] - target[corner][0], state.quad[corner][1] - target[corner][1]);
        assert.ok(distance <= 3 * matrix.scale, `handoff edge shifted ${distance / matrix.scale} source pixels`);
      }
    }
  }
});

test("mutating a returned quad cannot alter later transition poses or source geometry", () => {
  const room = initialRoom(1280, 720), snapshot = structuredClone(room);
  const pose = getFocusTransition(room, 1280, 720, .6), original = structuredClone(pose);
  pose.quad[0][0] = -99999;
  pose.room.ix = -99999;
  assert.deepEqual(getFocusTransition(room, 1280, 720, .6), original);
  assert.deepEqual(room, snapshot);
});

test("the first side faces match the room box geometry and share the existing top creases", () => {
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height), start = getFocusTransition(room, width, height, 0);
    const matrix = { x: room.ix, y: room.iy, scale: room.scale };
    for (const [name, source] of [["front", ROOM_FRONT], ["right", ROOM_RIGHT]]) {
      const expected = expectedQuad(source, matrix);
      start[name].forEach((point, index) => point.forEach((value, axis) => near(value, expected[index][axis])));
    }
    assert.deepEqual(start.front[0], start.quad[3]);
    assert.deepEqual(start.front[1], start.quad[2]);
    assert.deepEqual(start.right[0], start.quad[2]);
    assert.deepEqual(start.right[1], start.quad[1]);
    assert.deepEqual(start.right[3], start.front[2]);
    assert.equal(start.rightFace, 1);
  }
});

test("the front settles into the approved thin lip while the right face fully fades", () => {
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height), matrix = getOverheadMatrix(width, height);
    const end = getFocusTransition(room, width, height, 1);
    const lip = expectedQuad([[1277, 721], [391, 721]], matrix);
    end.front.slice(2).forEach((point, index) => point.forEach((value, axis) => near(value, lip[index][axis])));
    assert.deepEqual(end.front[0], end.quad[3]);
    assert.deepEqual(end.front[1], end.quad[2]);
    assert.equal(end.rightFace, 0);
    let previous = 1;
    for (let step = 0; step <= 1000; step++) {
      const state = getFocusTransition(room, width, height, step / 1000);
      assert.ok([...state.front.flat(), ...state.right.flat(), state.rightFace].every(Number.isFinite));
      assert.ok(state.rightFace >= 0 && state.rightFace <= previous);
      previous = state.rightFace;
      assert.deepEqual(state.front.slice(0, 2), [state.quad[3], state.quad[2]]);
      assert.deepEqual(state.right.slice(0, 2), [state.quad[2], state.quad[1]]);
    }
  }
});

test("the visible right face keeps its original orientation until it folds into zero thickness", () => {
  const sourceArea = area(ROOM_RIGHT);
  assert.ok(sourceArea > 0);
  for (const [width, height] of viewports) {
    const room = initialRoom(width, height);
    for (let step = 0; step <= 1000; step++) {
      const state = getFocusTransition(room, width, height, step / 1000);
      if (state.rightFace > 0) assert.ok(area(state.right) * sourceArea > 0, `visible right face reversed at ${width}×${height}, progress ${step / 1000}`);
    }
    const end = getFocusTransition(room, width, height, 1);
    assert.equal(area(end.right), 0);
    assert.deepEqual(end.right[1], end.right[2]);
    assert.deepEqual(end.right[0], end.right[3]);
  }
});
