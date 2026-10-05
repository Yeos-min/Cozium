import test from "node:test";
import assert from "node:assert/strict";
import { TAPE, getTapePose } from "../../js/landing/tape-renderer.js";

test("hover and a tiny drag detach only the corner, leaving the lower tape attached", () => {
  for (const pose of [getTapePose(0, 1), getTapePose(.003, 1)]) {
    assert.equal(pose.frontAt(TAPE.height), 0);
    assert.ok(pose.frontAt(0) <= 40);
    assert.ok(pose.frontAt(50) === 0);
  }
});

test("the grabbed material point stays exactly at the held tip", () => {
  const held = { x: 876, y: 214 };
  const pose = getTapePose(.4, 0, held);
  const tip = pose.point(0, 0);
  assert.ok(Math.abs(tip.x - held.x) < 1e-8);
  assert.ok(Math.abs(tip.y - held.y) < 1e-8);
});

test("the curved surface stays joined to the attached tape along the whole boundary", () => {
  for (const progress of [0, .001, .02, .07, .25, .7, 1]) {
    const pose = getTapePose(progress, .5);
    for (let v = 0; v <= TAPE.height; v += 5) {
      const front = pose.frontAt(v);
      const point = pose.point(front, v);
      assert.ok(Math.abs(point.x - TAPE.left - front) < 1e-8);
      assert.ok(Math.abs(point.y - TAPE.top - v) < 1e-8);
      assert.ok(Number.isFinite(pose.point(0, v).x));
      assert.ok(Number.isFinite(pose.point(0, v).y));
    }
  }
});
