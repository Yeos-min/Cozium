import assert from "node:assert/strict";
import test from "node:test";
import { getDesktopTransition, getDesktopAutoProgress, DESKTOP_HOLD, DESKTOP_DURATION } from "../../js/landing/desktop-scene.js";
import { getOverheadMatrix } from "../../js/landing/tape-renderer.js";

const FRAME = { width: 1672, height: 941 };
const PORTAL = [[364, 199], [1307, 199], [1316, 693], [355, 693]];
const viewports = [[1280, 720], [1920, 1080], [2934, 1532], [2400, 1000], [1024, 768], [390, 844]];

test("the complete box-to-desktop entry is 1.5 times faster", () => {
  assert.equal(DESKTOP_HOLD, 120);
  assert.ok(Math.abs((180 + 2000) / (DESKTOP_HOLD + DESKTOP_DURATION) - 1.5) < 1e-10);
});

test("automatic entry holds the fully open frame, then reaches the desktop without an input value", () => {
  for (const elapsed of [0, 80, DESKTOP_HOLD]) assert.equal(getDesktopAutoProgress(elapsed), 0);
  assert.equal(getDesktopAutoProgress(DESKTOP_HOLD + DESKTOP_DURATION / 2), .5);
  assert.equal(getDesktopAutoProgress(DESKTOP_HOLD + DESKTOP_DURATION), 1);
  let previous = 0;
  for (let elapsed = 0; elapsed < 5000; elapsed++) {
    const next = getDesktopAutoProgress(elapsed);
    assert.ok(next >= previous && next <= 1);
    previous = next;
  }
});

test("automatic timing clamps safely, can restart at zero, and reduced motion skips the zoom", () => {
  for (const elapsed of [-100, -Infinity, NaN, undefined, "invalid"]) assert.equal(getDesktopAutoProgress(elapsed), 0);
  for (const elapsed of [Infinity, 10000]) assert.equal(getDesktopAutoProgress(elapsed), 1);
  getDesktopAutoProgress(1700);
  assert.equal(getDesktopAutoProgress(0), 0);
  const progress = getDesktopAutoProgress(0, true);
  assert.equal(progress, 1);
  const pose = getDesktopTransition(1280, 720, progress, true);
  assert.equal(pose.phase, "desktop");
  assert.equal(pose.cameraZoom, 1);
});
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);

function inside(point, quad, tolerance = 1e-8) {
  return quad.every((corner, index) => cross(corner, quad[(index + 1) % 4], point) >= -tolerance);
}

test("progress zero exactly preserves the approved overhead camera and portal", () => {
  for (const [width, height] of viewports) {
    const pose = getDesktopTransition(width, height, 0);
    const overhead = getOverheadMatrix(width, height);
    assert.deepEqual(pose.camera, overhead);
    assert.deepEqual(pose.overhead, overhead);
    assert.deepEqual(pose.quad, PORTAL.map(([x, y]) => [overhead.x + x * overhead.scale, overhead.y + y * overhead.scale]));
    assert.equal(pose.cameraZoom, 1);
    assert.equal(pose.desktopOpacity, 0);
    assert.equal(pose.bezelOpacity, 0);
    assert.equal(pose.phase, "open-box");
  }
});

test("the monitor fills every viewport while icons and the collection box retain uniform scale", () => {
  for (const [width, height] of viewports) {
    const end = getDesktopTransition(width, height, 1), rect = end.desktopRect;
    assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8);
    assert.ok(rect.x + rect.width <= width + 1e-8 && rect.y + rect.height <= height + 1e-8);
    near(rect.width / rect.height, FRAME.width / FRAME.height);
    near(rect.width, FRAME.width * rect.scale);
    near(rect.height, FRAME.height * rect.scale);
    assert.ok(Math.abs(rect.width - width) < 1e-8 || Math.abs(rect.height - height) < 1e-8);
    assert.deepEqual(end.monitorRect, { x: 0, y: 0, width, height });
    assert.deepEqual(end.quad, [[0, 0], [width, 0], [width, height], [0, height]]);
    near(rect.y + rect.height, height);
    for (const [x, y] of [[0, 0], [1672, 0], [1672, 941], [0, 941], [1653, 878], [1550, 830]]) assert.ok(inside([rect.x + x * rect.scale, rect.y + y * rect.scale], end.quad));
    assert.equal(end.desktopOpacity, 1);
    assert.equal(end.bezelOpacity, 1);
    assert.equal(end.phase, "desktop");
    assert.equal(end.done, true);
  }
});

test("the taskbar reaches both monitor sides and remains anchored below the file pile", () => {
  for (const [width, height] of viewports) {
    const pose = getDesktopTransition(width, height, 1);
    const rect = pose.taskbarRect, scale = pose.desktopRect.scale;
    near(rect.x, 19 * scale);
    near(rect.x + rect.width, width - 19 * scale);
    near(rect.y + rect.height, height - 35 * scale);
    near(rect.height, 56 * scale);
    assert.ok(rect.y > pose.desktopRect.y + 820 * scale);
  }
});

test("the zoom reaches a centered portal covering the viewport before it settles", () => {
  for (const [width, height] of viewports) {
    const zoom = getDesktopTransition(width, height, .75);
    near(zoom.camera.x + 835.5 * zoom.camera.scale, width / 2);
    near(zoom.camera.y + 446 * zoom.camera.scale, height / 2);
    for (const corner of [[0, 0], [width, 0], [width, height], [0, height]]) assert.ok(inside(corner, zoom.portalQuad), `${width}×${height} misses ${corner}`);
    assert.ok(zoom.cameraZoom > 1);
  }
});

test("all intermediate camera values stay finite, zoom grows monotonically and both quads remain convex", () => {
  for (const [width, height] of viewports) {
    let previousZoom = 1;
    for (let step = 0; step <= 1000; step++) {
      const pose = getDesktopTransition(width, height, step / 1000);
      assert.ok([pose.camera.scale, pose.camera.x, pose.camera.y, pose.cameraZoom, ...pose.quad.flat(), ...pose.portalQuad.flat()].every(Number.isFinite));
      assert.ok(pose.cameraZoom >= previousZoom - 1e-9);
      previousZoom = pose.cameraZoom;
      for (const quad of [pose.quad, pose.portalQuad]) for (let corner = 0; corner < 4; corner++) assert.ok(cross(quad[corner], quad[(corner + 1) % 4], quad[(corner + 2) % 4]) > 0);
      for (const key of ["desktopOpacity", "bezelOpacity", "morph"]) assert.ok(pose[key] >= 0 && pose[key] <= 1);
      if (pose.bezelOpacity > 0) assert.equal(pose.desktopOpacity, 1);
    }
  }
});

test("the desktop appears only late and the surrounding box is retained throughout that fade", () => {
  for (const p of [0, .1, .3, .57, .58]) assert.equal(getDesktopTransition(1920, 1080, p).desktopOpacity, 0);
  const fading = getDesktopTransition(1920, 1080, .7);
  assert.ok(fading.desktopOpacity > 0 && fading.desktopOpacity < 1);
  assert.equal(fading.bezelOpacity, 0);
  assert.equal(getDesktopTransition(1920, 1080, .95).morph, 1);
});

test("reduced motion keeps the exact open pose at zero and switches without zoom for positive progress", () => {
  for (const [width, height] of viewports) {
    const start = getDesktopTransition(width, height, 0, true);
    assert.deepEqual(start.camera, getOverheadMatrix(width, height));
    assert.equal(start.desktopOpacity, 0);
    for (const p of [.0001, .1, .5, 1]) {
      const pose = getDesktopTransition(width, height, p, true);
      const end = getDesktopTransition(width, height, 1);
      assert.deepEqual(pose.camera, start.camera);
      assert.equal(pose.cameraZoom, 1);
      assert.deepEqual(pose.quad, end.quad);
      assert.equal(pose.desktopOpacity, 1);
      assert.equal(pose.bezelOpacity, 1);
    }
  }
});

test("progress clamps safely and calling zero again restores the initial pose", () => {
  const start = getDesktopTransition(1920, 1080, 0), end = getDesktopTransition(1920, 1080, 1);
  for (const p of [-100, -.01, -Infinity, NaN, undefined, "invalid"]) assert.deepEqual(getDesktopTransition(1920, 1080, p), start);
  for (const p of [1.01, 100, Infinity]) assert.deepEqual(getDesktopTransition(1920, 1080, p), end);
  getDesktopTransition(1920, 1080, .8);
  assert.deepEqual(getDesktopTransition(1920, 1080, 0), start);
  for (const [width, height] of [[0, 0], [-10, NaN], [Infinity, undefined]]) {
    const pose = getDesktopTransition(width, height, .5);
    assert.ok([pose.width, pose.height, pose.camera.scale, ...pose.quad.flat()].every(Number.isFinite));
  }
});
