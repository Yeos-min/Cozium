import test from "node:test";
import assert from "node:assert/strict";
import { LookInput } from "../js/three/look-input.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("pointer lock preserves sensitivity and consumes all events on the next frame without a tail", () => {
  for (const fps of [30, 60, 120]) {
    const input = new LookInput();
    input.add(8, -4, { sensitivity: 0.075, immediate: true });
    input.add(12, 2, { sensitivity: 0.075, immediate: true });
    const step = input.consume(1 / fps);
    close(step.yaw, -1.5);
    close(step.pitch, 0.15);
    assert.deepEqual(input.consume(1 / fps), { yaw: 0, pitch: 0 });
  }
});

test("cursor drag retains the existing 0.38 smoothing at 60fps", () => {
  const input = new LookInput();
  input.add(100, -50, { sensitivity: 0.10 });
  const first = input.consume(1 / 60);
  close(first.yaw, -3.8);
  close(first.pitch, 1.9);
  const second = input.consume(1 / 60);
  close(second.yaw, -6.2 * 0.38);
  close(second.pitch, 3.1 * 0.38);
});

test("cursor drag consumes the same displacement in equal time at 30, 60 and 120fps", () => {
  for (const fps of [30, 60, 120]) {
    const input = new LookInput();
    input.add(100, -50, { sensitivity: 0.10 });
    let yaw = 0, pitch = 0;
    for (let frame = 0; frame < fps / 10; frame += 1) {
      const step = input.consume(1 / fps);
      yaw += step.yaw;
      pitch += step.pitch;
    }
    close(yaw, -10 * (1 - 0.62 ** 6));
    close(pitch, 5 * (1 - 0.62 ** 6));
    const remainder = input.consume(1 / fps, { smoothing: 1 });
    close(yaw + remainder.yaw, -10);
    close(pitch + remainder.pitch, 5);
  }
});

test("changing between drag and pointer lock clears input from the previous mode", () => {
  const input = new LookInput();
  input.add(100, 100, { sensitivity: 0.10 });
  input.consume(1 / 60);
  input.add(4, -2, { sensitivity: 0.075, immediate: true });
  const locked = input.consume(1 / 60);
  close(locked.yaw, -0.3);
  close(locked.pitch, 0.15);

  input.add(100, 100, { sensitivity: 0.075, immediate: true });
  input.add(4, -2, { sensitivity: 0.10 });
  const drag = input.consume(1 / 60);
  close(drag.yaw, -0.4 * 0.38);
  close(drag.pitch, 0.2 * 0.38);
});

test("clear removes drag and locked inputs before a camera or lock transition", () => {
  for (const immediate of [false, true]) {
    const input = new LookInput();
    input.add(100, -50, { sensitivity: 0.10, immediate });
    input.clear();
    assert.deepEqual(input.consume(1 / 60), { yaw: 0, pitch: 0 });
    input.add(10, 0, { sensitivity: 0.10 });
    close(input.consume(1 / 60).yaw, -0.38);
  }
});

test("invalid axes, sensitivity and overflow do not poison valid pending input", () => {
  const input = new LookInput();
  input.add(10, -10, { sensitivity: 0.10 });
  input.add(NaN, 10, { sensitivity: 0.10 });
  input.add(10, Infinity, { sensitivity: 0.10 });
  input.add(100, 100, { sensitivity: NaN });
  input.add(100, 100, { sensitivity: Infinity });
  input.add(Number.MAX_VALUE, Number.MAX_VALUE, { sensitivity: 2 });
  assert.deepEqual(input.consume(1 / 60, { smoothing: 1 }), { yaw: -2, pitch: 0 });

  input.add(Number.MAX_VALUE, 0, { sensitivity: 1 });
  input.add(Number.MAX_VALUE, 0, { sensitivity: 1 });
  assert.deepEqual(input.consume(1 / 60, { smoothing: 1 }), { yaw: -Number.MAX_VALUE, pitch: 0 });
});

test("invalid or zero frame time leaves drag queued while locked input still consumes in one frame", () => {
  const input = new LookInput();
  input.add(10, -10, { sensitivity: 0.10 });
  for (const dt of [NaN, Infinity, -1, 0]) {
    assert.deepEqual(input.consume(dt), { yaw: 0, pitch: 0 });
  }
  assert.deepEqual(input.consume(1 / 60, { smoothing: 1 }), { yaw: -1, pitch: 1 });
  input.add(10, -10, { sensitivity: 0.10, immediate: true });
  assert.deepEqual(input.consume(0), { yaw: -1, pitch: 1 });
  assert.deepEqual(input.consume(1 / 60), { yaw: 0, pitch: 0 });
});

test("smoothing keeps its existing limits and falls back safely for invalid numbers", () => {
  for (const [smoothing, expected] of [[0, 0.05], [2, 1], [NaN, 0.38], [Infinity, 0.38]]) {
    const input = new LookInput();
    input.add(10, -10, { sensitivity: 0.10 });
    const step = input.consume(1 / 60, { smoothing });
    close(step.yaw, -expected);
    close(step.pitch, expected);
  }
});
