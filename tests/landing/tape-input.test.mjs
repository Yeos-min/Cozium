import assert from "node:assert/strict";
import test from "node:test";
import { attachTapeDrag, getDragPeel } from "../../js/landing/tape-input.js";

class FakeHandle {
  listeners = new Map();
  captures = new Set();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    if (!this.captures.delete(id)) return;
    this.dispatch("lostpointercapture", { pointerId: id });
  }
  dispatch(type, fields = {}) {
    const event = { type, pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, prevented: false, preventDefault() { this.prevented = true; }, ...fields };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
}

function setup(width = 1000) {
  const handle = new FakeHandle(), changes = [];
  let completed = 0;
  const drag = attachTapeDrag(handle, { getTapeWidth: () => width, onChange: (state) => changes.push(state), onComplete: () => { completed++; } });
  return { handle, changes, drag, get completed() { return completed; } };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("pull response is half the previous setting across displayed tape widths", () => {
  const diagonal = Math.hypot(100, 100) / 1300;
  near(getDragPeel(0, 50, 50, 500), diagonal);
  near(getDragPeel(0, 100, 100, 1000), diagonal);
  near(getDragPeel(.2, 100, 100, 1000), .2 + diagonal);
  for (const width of [1200, 1700, 2400]) {
    near(getDragPeel(0, 400, 0, width), .5 * (400 / 680));
    assert.ok(getDragPeel(0, 1200, 0, width) >= .85);
  }
});

test("rightward and upward movement peel; leftward and downward movement do not", () => {
  near(getDragPeel(0, 100, 0, 1000), 1 / 13);
  near(getDragPeel(0, 0, 100, 1000), 1 / 13);
  assert.equal(getDragPeel(.3, -100, 0, 1000), .3);
  assert.equal(getDragPeel(.3, 0, -100, 1000), .3);
});

test("opposite movement cannot remove more tape or fall below the drag start", () => {
  assert.equal(getDragPeel(.3, -100, -200, 1000), .3);
  near(getDragPeel(.3, 100, -500, 1000), .3 + 1 / 13);
  near(getDragPeel(.3, -500, 100, 1000), .3 + 1 / 13);
  assert.equal(getDragPeel(0, 0, 0, 1000), 0);
});

test("progress clamps at both limits and invalid dimensions do not produce NaN", () => {
  assert.equal(getDragPeel(.6, 10000, 10000, 1000), 1);
  assert.equal(getDragPeel(-1, 0, 0, 1000), 0);
  assert.equal(getDragPeel(2, 0, 0, 1000), 1);
  assert.ok(Number.isFinite(getDragPeel(0, 10, 10, 0)));
  assert.equal(getDragPeel(.2, NaN, Infinity, NaN), .2);
});

test("partial release persists and the next drag starts from that progress", () => {
  const s = setup();
  assert.deepEqual(s.changes.at(-1), { progress: 0, dragging: false, pointer: null, startPointer: null, complete: false });
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  assert.equal(s.drag.dragging, true);
  assert.equal(s.handle.hasPointerCapture(1), true);
  s.handle.dispatch("pointermove", { clientX: 600, clientY: 400 });
  near(s.drag.progress, Math.hypot(100, 100) / 1300);
  assert.deepEqual(s.changes.at(-1).pointer, { x: 600, y: 400 });
  assert.deepEqual(s.changes.at(-1).startPointer, { x: 500, y: 500 });
  s.handle.dispatch("pointerup", { clientX: 600, clientY: 400 });
  near(s.drag.progress, Math.hypot(100, 100) / 1300);
  assert.equal(s.drag.dragging, false);
  assert.equal(s.handle.hasPointerCapture(1), false);
  assert.equal(s.completed, 0);
  assert.equal(s.changes.at(-1).pointer, null);
  assert.equal(s.changes.at(-1).startPointer, null);
  s.handle.dispatch("pointerdown", { clientX: 600, clientY: 400 });
  s.handle.dispatch("pointermove", { clientX: 700, clientY: 300 });
  near(s.drag.progress, Math.hypot(100, 100) / 650);
  s.handle.dispatch("pointerup", { clientX: 700, clientY: 300 });
  near(s.drag.progress, Math.hypot(100, 100) / 650);
  assert.equal(s.completed, 0);
});

test("moving back during a drag and releasing cannot reattach peeled paper", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { clientX: 100, clientY: 600 });
  s.handle.dispatch("pointermove", { clientX: 750, clientY: 600 });
  near(s.drag.progress, .5);
  s.handle.dispatch("pointermove", { clientX: 200, clientY: 550 });
  near(s.drag.progress, .5);
  assert.deepEqual(s.changes.at(-1).pointer, { x: 200, y: 550 });
  s.handle.dispatch("pointerup", { clientX: 50, clientY: 650 });
  near(s.drag.progress, .5);
  assert.equal(s.completed, 0);
});

test("callback pointer snapshots cannot mutate the gesture start", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { clientX: 100, clientY: 600 });
  s.changes.at(-1).startPointer.x = 9999;
  s.changes.at(-1).pointer.y = -9999;
  s.handle.dispatch("pointermove", { clientX: 750, clientY: 600 });
  near(s.drag.progress, .5);
  assert.deepEqual(s.changes.at(-1).startPointer, { x: 100, y: 600 });
});

test("pointer cancel restores the drag's initial partial progress", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointerup", { clientX: 600, clientY: 400 });
  const initial = s.drag.progress;
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointermove", { clientX: 2000, clientY: 0 });
  assert.equal(s.drag.progress, 1);
  s.handle.dispatch("pointercancel");
  assert.equal(s.drag.progress, initial);
  assert.equal(s.drag.dragging, false);
  assert.equal(s.completed, 0);
});

test("unexpected capture loss cancels even beyond the completion threshold", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointermove", { clientX: 2000, clientY: 0 });
  assert.equal(s.drag.progress, 1);
  s.handle.releasePointerCapture(1);
  assert.equal(s.drag.progress, 0);
  assert.equal(s.drag.dragging, false);
  assert.equal(s.completed, 0);
  s.handle.dispatch("pointerup", { clientX: 2000, clientY: 0 });
  assert.equal(s.completed, 0);
});

test("normal release completes once and ignores the capture-loss event from cleanup", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointermove", { clientX: 2000, clientY: 0 });
  s.handle.dispatch("pointerup", { clientX: 2000, clientY: 0 });
  assert.equal(s.drag.progress, 1);
  assert.equal(s.drag.dragging, false);
  assert.equal(s.completed, 1);
  assert.deepEqual(s.changes.at(-1), { progress: 1, dragging: false, pointer: null, startPointer: null, complete: true });
  const count = s.changes.length;
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointerup", { clientX: 0, clientY: 0 });
  s.handle.dispatch("keydown", { key: "Enter" });
  assert.equal(s.completed, 1);
  assert.equal(s.changes.length, count);
});

test("85 percent release finishes the rest; just below remains partial", () => {
  const s = setup(1000);
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointerup", { clientX: 500 + .849 * 1300, clientY: 500 });
  near(s.drag.progress, .849);
  assert.equal(s.completed, 0);
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointerup", { clientX: 502.6, clientY: 500 });
  assert.equal(s.completed, 1);
  const exact = setup(800);
  exact.handle.dispatch("pointerdown", { clientX: 0, clientY: 0 });
  exact.handle.dispatch("pointerup", { clientX: 884, clientY: 0 });
  assert.equal(exact.completed, 1);
});

test("secondary buttons, non-primary pointers and a second active pointer are ignored", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { button: 2 });
  s.handle.dispatch("pointerdown", { isPrimary: false, pointerId: 2 });
  assert.equal(s.drag.dragging, false);
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointerdown", { pointerId: 2, clientX: 900, clientY: 900 });
  s.handle.dispatch("pointermove", { pointerId: 2, clientX: 0, clientY: 0 });
  s.handle.dispatch("pointerup", { pointerId: 2, clientX: 0, clientY: 0 });
  s.handle.dispatch("pointercancel", { pointerId: 2 });
  assert.equal(s.drag.dragging, true);
  assert.equal(s.drag.progress, 0);
  assert.equal(s.completed, 0);
  s.handle.dispatch("pointerup", { clientX: 600, clientY: 400 });
  near(s.drag.progress, Math.hypot(100, 100) / 1300);
});

test("short pulls stay partial and can be continued to completion", () => {
  for (const end of [{ clientX: 1000, clientY: 600 }, { clientX: 600, clientY: 200 }]) {
    const s = setup(1700);
    s.handle.dispatch("pointerdown", { clientX: 600, clientY: 600 });
    s.handle.dispatch("pointermove", end);
    assert.equal(s.completed, 0);
    s.handle.dispatch("pointerup", end);
    assert.equal(s.completed, 0);
    near(s.drag.progress, 400 / 1360);
    s.handle.dispatch("pointerdown", end);
    s.handle.dispatch("pointerup", { ...end, clientX: end.clientX + 800 });
    assert.equal(s.completed, 1);
    assert.equal(s.drag.progress, 1);
  }
});

test("mouse click and scroll never complete, while Enter and Space provide keyboard access", () => {
  for (const key of ["Enter", " "]) {
    const s = setup();
    s.handle.dispatch("click");
    s.handle.dispatch("wheel", { deltaY: 200 });
    s.handle.dispatch("scroll");
    s.handle.dispatch("keydown", { key: "Escape" });
    s.handle.dispatch("keydown", { key, repeat: true });
    assert.equal(s.completed, 0);
    const event = s.handle.dispatch("keydown", { key });
    assert.equal(event.prevented, true);
    assert.equal(s.completed, 1);
    assert.equal(s.drag.progress, 1);
  }
});

test("reset clears capture and completion; destroy removes input listeners", () => {
  const s = setup();
  s.handle.dispatch("pointerdown", { clientX: 500, clientY: 500 });
  s.handle.dispatch("pointermove", { clientX: 600, clientY: 400 });
  s.drag.reset();
  assert.equal(s.drag.progress, 0);
  assert.equal(s.drag.dragging, false);
  assert.equal(s.handle.hasPointerCapture(1), false);
  assert.equal(s.completed, 0);
  s.handle.dispatch("keydown", { key: "Enter" });
  assert.equal(s.completed, 1);
  s.drag.reset();
  s.handle.dispatch("pointerdown");
  s.drag.destroy();
  assert.equal(s.drag.dragging, false);
  assert.equal(s.handle.hasPointerCapture(1), false);
  const count = s.changes.length;
  s.handle.dispatch("keydown", { key: "Enter" });
  s.handle.dispatch("pointerdown");
  s.drag.reset();
  assert.equal(s.changes.length, count);
  assert.equal(s.completed, 1);
});
