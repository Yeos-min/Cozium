import assert from "node:assert/strict";
import test from "node:test";
import { FILLED_HOLD_MS, REDUCED_FILLED_HOLD_MS, REDUCED_RETURN_MS, RETURN_DURATION, RETURN_FOCUS_MS, RETURN_ROOM_MS, getReturnPose, mountReturnScene } from "../../js/landing/return-scene.js";
import { getOverheadMatrix } from "../../js/landing/tape-renderer.js";

const viewports = [[1280, 720], [1920, 1080], [2934, 1532], [2400, 1000], [1024, 768], [390, 844]];
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);

test("the first frame preserves the complete native desktop and clicked box rectangle", () => {
  const rect = { x: 960, y: 460, width: 220, height: 170 };
  const pose = getReturnPose(1280, 720, 0, false, rect);
  assert.deepEqual(pose.sourceCamera, { scale: 1, x: 0, y: 0 });
  assert.deepEqual(pose.focusQuad, [[960, 460], [1180, 460], [1180, 630], [960, 630]]);
  assert.equal(pose.phase, "return-to-box");
  assert.equal(pose.desktopOpacity, 1);
  assert.equal(pose.filledOpacity, 0);
  assert.equal(pose.roomOpacity, 0);
  assert.equal(pose.done, false);
});

test("the contents shot reaches and holds the exact original overhead camera", () => {
  assert.equal(RETURN_DURATION, RETURN_FOCUS_MS + FILLED_HOLD_MS + RETURN_ROOM_MS);
  for (const [width, height] of viewports) {
    const matrix = getOverheadMatrix(width, height);
    for (const elapsed of [RETURN_FOCUS_MS, RETURN_FOCUS_MS + FILLED_HOLD_MS / 2, RETURN_FOCUS_MS + FILLED_HOLD_MS - 1]) {
      const pose = getReturnPose(width, height, elapsed);
      assert.deepEqual(pose.filledCamera, matrix);
      assert.equal(pose.phase, "filled-box");
      assert.equal(pose.filledOpacity, 1);
      assert.equal(pose.desktopOpacity, 0);
      assert.equal(pose.roomOpacity, 0);
    }
  }
});

test("the final room matches the neutral initial room cover camera", () => {
  for (const [width, height] of viewports) {
    const pose = getReturnPose(width, height, RETURN_DURATION);
    const scale = Math.max(width / 1672, height / 941) * 1.02;
    assert.deepEqual(pose.roomCamera, { scale, x: (width - 1672 * scale) / 2, y: (height - 941 * scale) / 2 });
    assert.equal(pose.roomMatrix.zoom, 1.02);
    assert.equal(pose.roomMatrix.panX, 0);
    assert.equal(pose.roomMatrix.panY, 0);
    near(pose.roomMatrix.scale, scale);
    assert.equal(pose.phase, "tidy-room");
    assert.equal(pose.done, true);
    assert.equal(pose.filledOpacity, 0);
    assert.equal(pose.roomOpacity, 1);
  }
});

test("every intermediate focus quad is convex and all camera values stay finite", () => {
  for (const [width, height] of viewports) {
    let previous = 0;
    for (let elapsed = 0; elapsed <= RETURN_DURATION; elapsed += 10) {
      const pose = getReturnPose(width, height, elapsed);
      assert.ok(pose.progress >= previous && pose.progress <= 1);
      previous = pose.progress;
      for (const camera of [pose.sourceCamera, pose.filledCamera, pose.roomCamera]) assert.ok(Object.values(camera).every(Number.isFinite));
      for (const quad of [pose.focusQuad, pose.portalQuad]) {
        assert.ok(quad.flat().every(Number.isFinite));
        for (let index = 0; index < 4; index++) assert.ok(cross(quad[index], quad[(index + 1) % 4], quad[(index + 2) % 4]) > 0);
      }
      for (const value of [pose.desktopOpacity, pose.filledOpacity, pose.roomOpacity]) assert.ok(value >= 0 && value <= 1);
    }
  }
});

test("the room pullback follows the same physical box anchor as the filled shot", () => {
  for (const progress of [0, .12, .35, .59, .82, 1]) {
    const elapsed = RETURN_FOCUS_MS + FILLED_HOLD_MS + RETURN_ROOM_MS * progress;
    const pose = getReturnPose(1920, 1080, elapsed);
    near(pose.filledCamera.x + 835.5 * pose.filledCamera.scale, pose.roomCamera.x + 852 * pose.roomCamera.scale);
    near(pose.filledCamera.y + 446 * pose.filledCamera.scale, pose.roomCamera.y + 630 * pose.roomCamera.scale);
  }
});

test("reduced motion still holds the filled box, then fades without zoom", () => {
  for (const elapsed of [0, REDUCED_FILLED_HOLD_MS / 2, REDUCED_FILLED_HOLD_MS - 1]) {
    const pose = getReturnPose(1280, 720, elapsed, true);
    assert.equal(pose.phase, "filled-box");
    assert.equal(pose.filledOpacity, 1);
    assert.equal(pose.sourceCamera.scale, 1);
    assert.deepEqual(pose.filledCamera, getOverheadMatrix(1280, 720));
  }
  const halfway = getReturnPose(1280, 720, REDUCED_FILLED_HOLD_MS + REDUCED_RETURN_MS / 2, true);
  assert.equal(halfway.phase, "return-to-room");
  near(halfway.roomOpacity, .5);
  assert.deepEqual(halfway.filledCamera, getOverheadMatrix(1280, 720));
  assert.deepEqual(halfway.roomCamera, getReturnPose(1280, 720, REDUCED_FILLED_HOLD_MS + REDUCED_RETURN_MS, true).roomCamera);
  assert.equal(getReturnPose(1280, 720, REDUCED_FILLED_HOLD_MS + REDUCED_RETURN_MS, true).done, true);
});

test("invalid dimensions, elapsed values and rectangles remain bounded and restartable", () => {
  for (const elapsed of [-Infinity, -200, NaN, undefined, "invalid"]) assert.equal(getReturnPose(1280, 720, elapsed).elapsed, 0);
  for (const elapsed of [Infinity, RETURN_DURATION + 3000]) assert.equal(getReturnPose(1280, 720, elapsed).done, true);
  for (const [width, height] of [[0, 0], [NaN, -5], [Infinity, undefined]]) {
    const pose = getReturnPose(width, height, 800, false, { x: Infinity, y: NaN, width: -5, height: Infinity });
    assert.ok([pose.width, pose.height, ...pose.focusQuad.flat(), ...pose.portalQuad.flat()].every(Number.isFinite));
    assert.ok(pose.width >= 1 && pose.height >= 1);
  }
  getReturnPose(1280, 720, RETURN_DURATION);
  assert.equal(getReturnPose(1280, 720, 0).phase, "return-to-box");
});

async function harness(t, { deferred = false, imageError = false, imageWidth = 1672, imageHeight = 941 } = {}) {
  const names = ["document", "Image", "requestAnimationFrame", "cancelAnimationFrame", "devicePixelRatio"];
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map(), pending = [], copies = [], drawing = [], phases = [], completions = [];
  let sequence = 0, now = 1000;
  const document = new EventTarget(); document.hidden = false;
  function context(calls) {
    const ctx = { globalAlpha: 1, stack: [], save() { this.stack.push(this.globalAlpha); }, restore() { this.globalAlpha = this.stack.pop(); }, drawImage(image, ...args) { calls.push({ image, args, opacity: this.globalAlpha }); } };
    for (const method of ["setTransform", "fillRect", "clearRect", "translate", "scale"]) ctx[method] = () => {};
    return ctx;
  }
  const ctx = context(drawing);
  const canvas = { dataset: {}, width: 1, height: 1, getContext: () => ctx };
  const status = { hidden: false, textContent: "", dataset: {} }, live = { textContent: "" };
  const bounds = { width: 1280, height: 720 };
  const root = { dataset: {}, getBoundingClientRect: () => bounds, querySelector: (selector) => selector === "canvas" ? canvas : selector === ".status" ? status : live };
  document.createElement = () => {
    const copy = { width: 0, height: 0, getContext: () => copyCtx };
    const copyCtx = context(copies);
    return copy;
  };
  Object.assign(globalThis, {
    document, devicePixelRatio: 2,
    Image: class {
      naturalWidth = imageWidth; naturalHeight = imageHeight;
      decode() {
        if (deferred) return new Promise((resolve, reject) => pending.push({ resolve, reject }));
        return imageError ? Promise.reject(new Error("Missing ending image")) : Promise.resolve();
      }
    },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const plate = { width: 2560, height: 1440 };
  const callbacks = { phase: null, complete: null };
  const scene = mountReturnScene(root, {
    getDesktopPlate: () => plate,
    getCollectionBoxRect: () => ({ x: 970, y: 465, width: 220, height: 170 }),
    onPhase(phase, pose) { phases.push(phase); callbacks.phase?.(phase, pose); },
    onComplete(pose) { completions.push(pose); callbacks.complete?.(pose); },
  });
  function advance(milliseconds, step = 1000 / 60) {
    for (let elapsed = 0; elapsed < milliseconds - 1e-8; elapsed += step) {
      now += Math.min(step, milliseconds - elapsed);
      const queue = [...frames.values()]; frames.clear(); queue.forEach((callback) => callback(now));
    }
  }
  function visibility(hidden) { document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")); }
  t.after(() => {
    scene.destroy();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  if (!deferred && !imageError && imageWidth === 1672 && imageHeight === 941) await scene.ready;
  return { scene, root, canvas, status, live, frames, pending, copies, drawing, plate, phases, completions, callbacks, bounds, advance, visibility };
}

test("the mounted scene copies device-resolution pixels and completes the four ending phases once", async (t) => {
  const h = await harness(t);
  assert.equal(await h.scene.start(), true);
  assert.equal(h.copies[0].image, h.plate);
  assert.equal(h.canvas.width, 2560);
  assert.equal(h.canvas.height, 1440);
  const desktopDraw = h.drawing.find((call) => call.image.width === 2560);
  assert.deepEqual(desktopDraw.args, [0, 0, 2560, 1440, 0, 0, 1280, 720]);
  h.advance(RETURN_DURATION + 200);
  assert.deepEqual(h.phases, ["return-to-box", "filled-box", "return-to-room", "tidy-room"]);
  assert.equal(h.completions.length, 1);
  assert.equal(h.root.dataset.playback, "complete");
  assert.equal(h.root.dataset.phase, "tidy-room");
  assert.equal(h.frames.size, 0);
  h.advance(4000);
  h.scene.render();
  assert.equal(h.completions.length, 1);
});

test("hidden time and explicit pauses do not consume the filled-box hold", async (t) => {
  const h = await harness(t);
  await h.scene.start(); h.advance(RETURN_FOCUS_MS + FILLED_HOLD_MS / 3);
  assert.equal(h.root.dataset.phase, "filled-box");
  const elapsed = Number(h.root.dataset.elapsed);
  h.visibility(true); h.advance(10000);
  assert.equal(Number(h.root.dataset.elapsed), elapsed);
  assert.equal(h.frames.size, 0);
  const resumeTime = FILLED_HOLD_MS / 4;
  h.visibility(false); h.advance(resumeTime);
  assert.ok(Number(h.root.dataset.elapsed) > elapsed && Number(h.root.dataset.elapsed) < elapsed + resumeTime + 1);
  h.scene.setActive(false);
  const paused = Number(h.root.dataset.elapsed);
  h.advance(5000);
  assert.equal(Number(h.root.dataset.elapsed), paused);
  h.scene.setActive(true); h.advance(5000);
  assert.equal(h.completions.length, 1);
});

test("reset cancels a start still waiting for assets and any stale frame completion", async (t) => {
  const h = await harness(t, { deferred: true });
  const starting = h.scene.start();
  assert.equal(h.root.dataset.playback, "preparing");
  h.scene.reset();
  h.pending.forEach(({ resolve }) => resolve());
  assert.equal(await starting, false);
  await h.scene.ready;
  assert.equal(h.root.dataset.playback, "idle");
  assert.equal(h.frames.size, 0);
  assert.equal(h.completions.length, 0);
  await h.scene.start(); h.advance(RETURN_FOCUS_MS / 2);
  const stale = [...h.frames.values()][0];
  h.scene.reset(); stale(10000);
  assert.equal(h.root.dataset.phase, "idle");
  assert.equal(h.completions.length, 0);
  assert.equal(h.frames.size, 0);
});

test("missing images report an error and never auto-advance to the room", async (t) => {
  const h = await harness(t, { imageError: true });
  await assert.rejects(h.scene.ready, /Missing ending image/);
  assert.equal(await h.scene.start(), false);
  assert.equal(h.root.dataset.ready, "error");
  assert.equal(h.root.dataset.playback, "error");
  assert.match(h.root.dataset.error, /Missing ending image/);
  assert.equal(h.status.dataset.state, "error");
  assert.equal(h.status.hidden, false);
  assert.equal(h.frames.size, 0);
  h.advance(10000);
  assert.equal(h.completions.length, 0);
});

test("a mismatched image aspect is reported instead of stretching the approved composition", async (t) => {
  const h = await harness(t, { imageWidth: 1536, imageHeight: 1024 });
  await assert.rejects(h.scene.ready, /1672 × 941 composition/);
  assert.equal(await h.scene.start(), false);
  assert.equal(h.frames.size, 0);
});

test("reduced playback visibly holds the contents shot and completes only after its short fade", async (t) => {
  const h = await harness(t);
  await h.scene.start({ reducedMotion: true });
  assert.equal(h.root.dataset.phase, "filled-box");
  h.advance(REDUCED_FILLED_HOLD_MS * 2 / 3);
  assert.equal(h.root.dataset.phase, "filled-box");
  assert.equal(h.completions.length, 0);
  h.advance(REDUCED_FILLED_HOLD_MS / 3 + REDUCED_RETURN_MS / 2);
  assert.equal(h.root.dataset.phase, "return-to-room");
  h.advance(REDUCED_RETURN_MS + 100);
  assert.equal(h.completions.length, 1);
  assert.deepEqual(h.phases, ["filled-box", "return-to-room", "tidy-room"]);
});

test("a phase callback can reset without triggering a stale onComplete callback", async (t) => {
  const h = await harness(t);
  h.callbacks.phase = (phase) => { if (phase === "tidy-room") h.scene.reset(); };
  await h.scene.start(); h.advance(RETURN_DURATION + 200);
  assert.equal(h.completions.length, 0);
  assert.equal(h.root.dataset.phase, "idle");
  assert.equal(h.frames.size, 0);
});

test("motion preference changes preserve hold and return phases and never replay a completed ending", async (t) => {
  const h = await harness(t);
  await h.scene.start(); h.advance(RETURN_FOCUS_MS + FILLED_HOLD_MS / 3);
  const elapsed = Number(h.root.dataset.elapsed);
  assert.equal(h.root.dataset.phase, "filled-box");
  h.scene.setReducedMotion(true);
  assert.equal(h.root.dataset.phase, "filled-box");
  near(Number(h.root.dataset.elapsed), (elapsed - RETURN_FOCUS_MS) / FILLED_HOLD_MS * REDUCED_FILLED_HOLD_MS, .1);
  h.scene.setReducedMotion(false);
  assert.equal(h.root.dataset.phase, "filled-box");
  near(Number(h.root.dataset.elapsed), elapsed, .1);
  h.advance(FILLED_HOLD_MS + RETURN_ROOM_MS / 3);
  assert.equal(h.root.dataset.phase, "return-to-room");
  const before = h.scene.render().roomProgress;
  h.scene.setReducedMotion(true);
  assert.equal(h.root.dataset.phase, "return-to-room");
  near(h.scene.render().roomProgress, before);
  h.advance(REDUCED_RETURN_MS + 100);
  assert.equal(h.completions.length, 1);
  assert.equal(h.root.dataset.phase, "tidy-room");
  h.scene.setReducedMotion(false); h.scene.setReducedMotion(true);
  h.advance(10000);
  assert.equal(h.root.dataset.phase, "tidy-room");
  assert.equal(h.completions.length, 1);
  assert.equal(h.frames.size, 0);
});

test("enabling reduced motion during the zoom skips to contents and does not zoom again when disabled", async (t) => {
  const h = await harness(t);
  await h.scene.start(); h.advance(RETURN_FOCUS_MS / 3);
  assert.equal(h.root.dataset.phase, "return-to-box");
  h.scene.setReducedMotion(true);
  assert.equal(h.root.dataset.phase, "filled-box");
  assert.equal(h.root.dataset.filledOpacity, "1.0000");
  h.scene.setReducedMotion(false);
  assert.equal(h.root.dataset.phase, "filled-box");
  assert.equal(h.root.dataset.elapsed, RETURN_FOCUS_MS.toFixed(1));
  h.advance(4000);
  assert.equal(h.completions.length, 1);
});
