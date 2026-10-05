import assert from "node:assert/strict";
import test from "node:test";
import { FLAPS, OPEN_SPEED, OPEN_DURATION, getFlapPose, getFlapStates } from "../../js/landing/flap-geometry.js";

function area(quad) {
  return quad.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = quad[(index + 1) % quad.length];
    return sum + x * nextY - nextX * y;
  }, 0) / 2;
}

test("closed and open poses exactly match the approved geometry", () => {
  for (const [name, flap] of Object.entries(FLAPS)) {
    const closed = getFlapPose(name, 0), open = getFlapPose(name, 1);
    assert.deepEqual(closed.quad, [flap.hinge[0], flap.hinge[1], flap.closed[1], flap.closed[0]]);
    assert.deepEqual(open.quad, [flap.hinge[0], flap.hinge[1], flap.open[1], flap.open[0]]);
    assert.equal(closed.edgeExposure, 0);
    assert.equal(open.edgeExposure, 1);
    assert.equal(closed.back, false);
    assert.equal(open.back, true);
    assert.equal(closed.lift, 0);
    assert.equal(open.lift, 0);
  }
});

test("hinges stay fixed while every flap passes through its lift arc", () => {
  for (const [name, flap] of Object.entries(FLAPS)) {
    let previousExposure = -1;
    for (let step = 0; step <= 100; step++) {
      const progress = step / 100, pose = getFlapPose(name, progress);
      assert.deepEqual(pose.quad.slice(0, 2), flap.hinge);
      assert.ok(pose.edgeExposure >= previousExposure);
      previousExposure = pose.edgeExposure;
      assert.ok(pose.lift <= 0);
      if (progress > 0 && progress < 1) assert.ok(pose.lift < 0);
      assert.equal(pose.back, area(pose.quad) * area(getFlapPose(name, 0).quad) < 0);
    }
    assert.equal(getFlapPose(name, .5).lift, -flap.liftHeight);
  }
});

test("face switching follows projected geometry instead of a shared halfway cutoff", () => {
  assert.equal(getFlapPose("upper", .5).back, true);
  assert.equal(getFlapPose("lower", .5).back, false);
  assert.equal(getFlapPose("left", .5).back, false);
  assert.equal(getFlapPose("right", .5).back, false);
});

test("top and bottom start first; delayed sides remain closed without exposed thickness", () => {
  const start = getFlapStates(0), early = getFlapStates(400 / OPEN_SPEED), stagger = getFlapStates(800 / OPEN_SPEED);
  assert.equal(start.done, false);
  assert.equal(start.phase, "top-bottom");
  assert.ok(early.flaps.upper.progress > early.flaps.lower.progress);
  for (const name of ["left", "right"]) {
    assert.equal(early.flaps[name].progress, 0);
    assert.equal(early.flaps[name].edgeExposure, 0);
  }
  assert.equal(stagger.phase, "side-flaps");
  assert.ok(stagger.flaps.left.progress > 0);
  assert.equal(stagger.flaps.right.progress, 0);
  assert.ok(stagger.flaps.upper.progress > stagger.flaps.left.progress);
  const late = getFlapStates(1700 / OPEN_SPEED);
  assert.equal(late.flaps.left.progress, 1);
  assert.ok(late.flaps.right.progress < 1);
  assert.equal(late.done, false);
  const finished = getFlapStates(OPEN_DURATION);
  assert.equal(OPEN_SPEED, 1.5);
  assert.equal(OPEN_DURATION, 1730 / 1.5);
  assert.equal(finished.done, true);
  assert.equal(finished.phase, "open");
  assert.ok(Object.values(finished.flaps).every(({ progress }) => progress === 1));
});

test("invalid and out-of-range inputs stay finite and cannot move past endpoints", () => {
  for (const name of Object.keys(FLAPS)) {
    assert.deepEqual(getFlapPose(name, -100), getFlapPose(name, 0));
    assert.deepEqual(getFlapPose(name, 100), getFlapPose(name, 1));
    assert.deepEqual(getFlapPose(name, NaN), getFlapPose(name, 0));
    assert.deepEqual(getFlapPose(name, Infinity), getFlapPose(name, 1));
    assert.deepEqual(getFlapPose(name, -Infinity), getFlapPose(name, 0));
  }
  for (const elapsed of [-1000, 1e9, NaN, Infinity, -Infinity]) {
    const states = getFlapStates(elapsed);
    for (const pose of Object.values(states.flaps)) {
      assert.ok([pose.progress, pose.edgeExposure, pose.angle, pose.lift, pose.area, ...pose.quad.flat()].every(Number.isFinite));
    }
  }
});

test("returned coordinates cannot mutate the hinge or endpoint configuration", () => {
  const pose = getFlapPose("upper", 0);
  pose.quad[0][0] = -100;
  pose.quad[2][1] = -100;
  assert.deepEqual(getFlapPose("upper", 0).quad[0], [369, 199]);
  assert.deepEqual(getFlapPose("upper", 0).quad[2], [1301, 430]);
});

test("reduced motion returns the final open pose immediately", () => {
  const states = getFlapStates(0, true);
  assert.equal(states.done, true);
  assert.equal(states.phase, "open");
  for (const [name, pose] of Object.entries(states.flaps)) assert.deepEqual(pose, getFlapPose(name, 1));
});
