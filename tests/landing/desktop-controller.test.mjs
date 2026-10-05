import assert from "node:assert/strict";
import test from "node:test";
import { mountDesktopInteraction } from "../../js/landing/desktop-interaction.js";

const grid = Array.from({ length: 80 }, (_, index) => ({
  id: `file-r${String(Math.floor(index / 10) + 1).padStart(2, "0")}-c${String(index % 10 + 1).padStart(2, "0")}`,
  offset: [54 + index % 10 * 94, 45 + Math.floor(index / 10) * 100], image: {},
}));

async function harness(t, options = {}) {
  const names = ["document", "Image", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"];
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const captures = new Set(), frames = new Map(), timers = new Map();
  const attributes = new Map(), liveStatus = { textContent: "" }, selections = [];
  const canvas = new EventTarget();
  Object.assign(canvas, {
    setAttribute: (name, value) => attributes.set(name, value),
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture(id) {
      if (captures.delete(id)) canvas.dispatchEvent(new Event("lostpointercapture"));
    },
  });
  const document = new EventTarget(); document.hidden = false;
  let now = 1000, sequence = 0, renders = 0;
  Object.assign(globalThis, {
    document,
    Image: class { decode() { return options.decode ? options.decode(this.src) : Promise.resolve(); } },
    requestAnimationFrame: (callback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++sequence, { callback, due: now + delay }); return sequence; },
    clearTimeout: (id) => timers.delete(id),
  });
  const bounds = { left: 17, top: 39 };
  const rect = { x: 80, y: 10, scale: .6 };
  const root = { dataset: {}, querySelector: (selector) => selector === "canvas" ? canvas : liveStatus, getBoundingClientRect: () => bounds };
  const controller = mountDesktopInteraction(root, { items: grid, boxUrl: "box-collection-draft3.png", boxClosedUrl: "box-collection-closed-v1.png", requestRender: () => { renders++; }, onCollectionBoxSelected: (state) => selections.push(state) });
  if (options.waitReady !== false) await controller.ready;
  controller.configure(rect, true, false);
  t.after(() => {
    controller.reset();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  function dispatch(type, data) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, data); canvas.dispatchEvent(event);
  }
  function pointer(type, point, pointerId = 1) {
    dispatch(type, { clientX: bounds.left + rect.x + point.x * rect.scale, clientY: bounds.top + rect.y + point.y * rect.scale, pointerId, isPrimary: true, button: 0 });
  }
  function click(point = { x: 1150, y: 300 }) { pointer("pointerdown", point); pointer("pointerup", point); }
  function key(value, extra = {}) { dispatch("keydown", { key: value, ctrlKey: false, metaKey: false, altKey: false, repeat: false, shiftKey: false, ...extra }); }
  function advance(seconds, fps = 45) {
    for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / fps) {
      now += 1000 / fps;
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
      const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(now));
    }
  }
  const items = () => JSON.parse(root.dataset.gameItems);
  function collectStage() { click(); advance(3.8); }
  function holdIcon(item) {
    const point = { x: item.x + 34, y: item.y + 34 };
    pointer("pointerdown", point); advance(.32);
    assert.equal(root.dataset.dragging, "true");
    return JSON.parse(root.dataset.grabbedIds);
  }
  function holdTopIcon() { return holdIcon(items().filter((entry) => !entry.deposited).at(-1)); }
  function dropCenter() {
    const drop = JSON.parse(root.dataset.dropRect);
    return { x: drop.x + drop.width / 2, y: drop.y + drop.height / 2 };
  }
  return { root, canvas, controller, captures, frames, timers, liveStatus, document, rect, pointer, click, key, advance, items, collectStage, holdIcon, holdTopIcon, dropCenter, selections, renders: () => renders };
}

function boxEntry(h) {
  h.click();
  for (let frame = 0; frame < 180 && h.root.dataset.boxVisible !== "true"; frame++) h.advance(1 / 45);
  assert.equal(h.root.dataset.boxVisible, "true");
}

function fillBox(h) {
  h.collectStage();
  for (let trip = 0; trip < 4 && Number(h.root.dataset.remaining) > 0; trip++) {
    const remaining = h.items().filter((item) => !item.deposited).sort((a, b) => a.x - b.x);
    h.holdIcon(remaining[0]);
    const far = remaining.at(-1);
    h.pointer("pointermove", { x: far.x + 34, y: far.y + 34 }); h.advance(.5);
    const destination = h.dropCenter();
    h.pointer("pointermove", destination); h.advance(.6); h.pointer("pointerup", destination);
    if (Number(h.root.dataset.remaining) > 0) h.advance(2.5);
  }
  assert.equal(h.root.dataset.remaining, "0");
}

function drawCalls(h, opacity = 1) {
  const calls = [], stack = [];
  const ctx = {
    globalAlpha: opacity, clipped: false,
    save() { stack.push({ opacity: this.globalAlpha, clipped: this.clipped }); },
    restore() { const previous = stack.pop(); this.globalAlpha = previous.opacity; this.clipped = previous.clipped; },
    clip() { this.clipped = true; },
    drawImage(image, ...args) { calls.push({ source: image.src, args, opacity: this.globalAlpha, clipped: this.clipped }); },
  };
  for (const name of ["translate", "rotate", "scale", "beginPath", "roundRect", "stroke", "ellipse", "fill", "moveTo", "lineTo", "closePath"]) ctx[name] = () => {};
  h.controller.draw(ctx);
  assert.equal(ctx.globalAlpha, opacity, "rendering must restore the caller's opacity");
  return calls;
}

test("the box begins a 240ms fade immediately on landing, before the pile settles", async (t) => {
  const h = await harness(t);
  const original = h.items();
  h.advance(1);
  assert.deepEqual(h.items(), original);
  h.click({ x: -40, y: 200 });
  assert.equal(h.root.dataset.gamePhase, "grid", "letterbox input must be ignored");
  h.click();
  assert.equal(h.root.dataset.gamePhase, "falling");
  assert.equal(h.root.dataset.boxVisible, "false");
  h.advance(.5);
  assert.equal(h.root.dataset.boxVisible, "false");
  for (let frame = 0; frame < 180 && h.root.dataset.boxVisible !== "true"; frame++) h.advance(1 / 45);
  assert.equal(h.root.dataset.initialFallComplete, "true");
  assert.equal(h.root.dataset.landedCount, "80");
  assert.equal(h.root.dataset.physicsPhase, "falling", "box entry must not wait for the pile to finish settling");
  assert.equal(h.root.dataset.gamePhase, "collect");
  assert.equal(h.root.dataset.boxVisible, "true");
  assert.equal(h.root.dataset.boxReveal, "0.000");
  const box = JSON.parse(h.root.dataset.boxRect);
  const atStart = drawCalls(h).find((call) => call.source === "box-collection-draft3.png");
  assert.equal(atStart.opacity, 0);
  assert.deepEqual(atStart.args.slice(-4), [box.x, box.y, box.width, box.height]);
  assert.deepEqual(atStart.args.slice(0, 4), [43, 101, 1459, 866]);
  h.advance(.12, 100);
  assert.ok(Number(h.root.dataset.boxReveal) > .4 && Number(h.root.dataset.boxReveal) < .6);
  const halfway = drawCalls(h).find((call) => call.source === "box-collection-draft3.png");
  assert.deepEqual(halfway.args, atStart.args, "fade entry must not translate the box");
  h.advance(.12, 100);
  assert.equal(h.root.dataset.boxReveal, "1.000");
  const complete = drawCalls(h).find((call) => call.source === "box-collection-draft3.png");
  assert.ok(Math.abs(complete.opacity - 1) < 1e-7);
  assert.deepEqual(complete.args, atStart.args);
});

test("box, front lip, and packed contents share the entry opacity", async (t) => {
  const h = await harness(t); boxEntry(h); h.advance(.12, 100);
  const item = h.items().filter((entry) => !entry.deposited).at(-1);
  h.pointer("pointerdown", { x: item.x + 34, y: item.y + 34 });
  const destination = h.dropCenter();
  h.pointer("pointermove", destination); h.pointer("pointerup", destination);
  assert.ok(Number(h.root.dataset.packed) > 0);
  const calls = drawCalls(h, .8);
  const box = calls.find((call) => call.source === "box-collection-draft3.png" && !call.clipped);
  const front = calls.find((call) => call.source === "box-collection-draft3.png" && call.clipped);
  const contents = calls.filter((call) => call.source === undefined && call.clipped);
  assert.ok(box.opacity > 0 && box.opacity < .8);
  assert.ok(front && contents.length);
  assert.equal(front.opacity, box.opacity);
  assert.ok(contents.every((call) => call.opacity === box.opacity));
});

test("a slow visible frame does not stretch the entry fade beyond 240ms", async (t) => {
  const h = await harness(t); boxEntry(h);
  assert.equal(h.root.dataset.boxReveal, "0.000");
  h.advance(.25, 4);
  assert.equal(h.root.dataset.boxReveal, "1.000");
});

test("a hidden tab pauses the fade and reset removes it without a late reveal", async (t) => {
  const h = await harness(t); boxEntry(h); h.advance(.1, 100);
  const before = h.root.dataset.boxReveal;
  h.document.hidden = true; h.document.dispatchEvent(new Event("visibilitychange"));
  h.advance(30);
  assert.equal(h.root.dataset.boxReveal, before);
  h.document.hidden = false; h.document.dispatchEvent(new Event("visibilitychange"));
  h.advance(.02, 100);
  assert.ok(Number(h.root.dataset.boxReveal) < 1, "hidden time must not complete the fade");
  h.controller.reset(); h.advance(4);
  assert.equal(h.root.dataset.boxVisible, "false");
  assert.equal(h.root.dataset.boxReveal, "0.000");
  assert.equal(h.frames.size, 0);
  assert.ok(!drawCalls(h).some((call) => call.source === "box-collection-draft3.png" || call.source === "box-collection-closed-v1.png"));
});

test("reset before the fall settles prevents a collection box from appearing later", async (t) => {
  const h = await harness(t), original = h.items();
  h.click(); h.advance(.5);
  assert.equal(h.root.dataset.gamePhase, "falling");
  h.controller.reset(); h.advance(8);
  assert.equal(h.root.dataset.gamePhase, "grid");
  assert.equal(h.root.dataset.boxVisible, "false");
  assert.equal(h.root.dataset.boxReveal, "0.000");
  assert.equal(h.root.dataset.initialFallComplete, "false");
  assert.equal(h.root.dataset.landedCount, "0");
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.items(), original);
});

test("a held pointer group maps through the contained screen and deposits together", async (t) => {
  const h = await harness(t); h.collectStage();
  const initial = h.holdTopIcon();
  assert.ok(initial.length > 1 && initial.length < 80);
  assert.equal(h.captures.size, 1);
  const destination = h.dropCenter();
  h.pointer("pointermove", destination); h.advance(1);
  const ids = JSON.parse(h.root.dataset.grabbedIds);
  assert.ok(initial.every((id) => ids.includes(id)));
  h.pointer("pointerup", destination);
  assert.equal(h.root.dataset.packed, String(ids.length));
  assert.equal(h.root.dataset.remaining, String(80 - ids.length));
  assert.deepEqual(new Set(h.items().filter((item) => item.deposited).map((item) => item.id)), new Set(ids));
  assert.equal(h.root.dataset.dragging, "false");
  assert.equal(h.captures.size, 0);
  assert.match(h.liveStatus.textContent, new RegExp(`${ids.length}개를 담았어요`));
  h.pointer("pointerup", destination);
  assert.equal(h.root.dataset.packed, String(ids.length), "a duplicate release cannot deposit twice");
});

test("a moving held file attracts newly encountered files along the pointer path", async (t) => {
  const h = await harness(t); h.collectStage();
  const pile = h.items().filter((item) => !item.deposited).sort((a, b) => a.x - b.x);
  const initial = h.holdIcon(pile[0]);
  assert.ok(initial.length < 28, "an edge pickup should leave capacity for encountered files");
  const encountered = pile.findLast((item) => !initial.includes(item.id));
  assert.ok(encountered);
  h.pointer("pointermove", { x: encountered.x + 34, y: encountered.y + 34 }); h.advance(.3);
  const expanded = JSON.parse(h.root.dataset.grabbedIds);
  assert.ok(expanded.length > initial.length);
  assert.ok(expanded.length <= 28);
  assert.ok(expanded.includes(encountered.id));
  assert.ok(initial.every((id) => expanded.includes(id)), "the original group must remain held");
  h.pointer("pointerup", h.dropCenter());
  assert.equal(h.root.dataset.packed, String(expanded.length));
});

test("sweeping across the remaining pile collects all 80 files in three or four trips", async (t) => {
  const h = await harness(t); h.collectStage();
  let trips = 0;
  while (Number(h.root.dataset.remaining) > 0 && trips < 4) {
    const remaining = h.items().filter((item) => !item.deposited).sort((a, b) => a.x - b.x);
    h.holdIcon(remaining[0]);
    const far = remaining.at(-1);
    h.pointer("pointermove", { x: far.x + 34, y: far.y + 34 }); h.advance(.5);
    assert.ok(JSON.parse(h.root.dataset.grabbedIds).length <= 28);
    const destination = h.dropCenter();
    h.pointer("pointermove", destination); h.advance(.8); h.pointer("pointerup", destination);
    trips++; h.advance(3.2);
  }
  assert.ok(trips >= 3 && trips <= 4);
  assert.equal(h.root.dataset.packed, "80");
  assert.equal(h.root.dataset.remaining, "0");
  assert.equal(h.root.dataset.gamePhase, "complete");
  assert.ok(h.items().every((item) => item.deposited && !item.held));
});

test("reset during a hold cancels capture and restores all source icons without late callbacks", async (t) => {
  const h = await harness(t), original = h.items();
  h.collectStage(); h.holdTopIcon();
  h.controller.reset();
  assert.equal(h.root.dataset.gamePhase, "grid");
  assert.equal(h.root.dataset.boxVisible, "false");
  assert.equal(h.root.dataset.packed, "0");
  assert.equal(h.root.dataset.remaining, "80");
  assert.equal(h.root.dataset.dragging, "false");
  assert.equal(h.captures.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.items(), original);
  h.advance(4); h.pointer("pointerup", h.dropCenter());
  assert.deepEqual(h.items(), original);
  h.controller.configure(h.rect, true, false); h.click();
  assert.equal(h.root.dataset.gamePhase, "falling");
});

test("rapid keyboard presses accumulate the group's target before the next frame", async (t) => {
  const h = await harness(t); h.collectStage(); h.key(" "); h.advance(.8);
  const chosen = JSON.parse(h.root.dataset.grabbedIds)[0];
  assert.ok(chosen);
  const before = h.items().find((item) => item.id === chosen).x;
  for (let count = 0; count < 30; count++) h.key("ArrowRight");
  h.advance(1.2);
  const after = h.items().find((item) => item.id === chosen).x;
  assert.ok(Math.abs(after - before - 900) < 1, `${after - before}px moved for 30 keyboard steps`);
  h.key("Escape");
  assert.equal(h.root.dataset.dragging, "false");
  assert.equal(h.root.dataset.packed, "0");
});

test("hiding while dragging releases the group and resumes gravity without packing it", async (t) => {
  const h = await harness(t); h.collectStage(); h.holdTopIcon();
  h.document.hidden = true; h.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.captures.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  const hiddenItems = h.items(); h.advance(30);
  assert.deepEqual(h.items(), hiddenItems);
  h.document.hidden = false; h.document.dispatchEvent(new Event("visibilitychange")); h.advance(3.2);
  assert.equal(h.root.dataset.dragging, "false");
  assert.equal(h.root.dataset.packed, "0");
  assert.equal(h.root.dataset.remaining, "80");
  assert.ok(h.items().every((item) => !item.held && !item.deposited));
});

test("enabling reduced motion mid-fall reaches a still pile and reveals the box without further input", async (t) => {
  const h = await harness(t); h.click(); h.advance(.2);
  assert.equal(h.root.dataset.gamePhase, "falling");
  h.controller.configure(h.rect, true, true);
  assert.equal(h.root.dataset.gamePhase, "collect");
  assert.equal(h.root.dataset.boxVisible, "true");
  const settled = h.items(); h.advance(1);
  assert.deepEqual(h.items(), settled);
  assert.equal(h.root.dataset.gamePhase, "collect");
  assert.equal(h.root.dataset.boxReveal, "1.000");
});

test("a held group expands the box smoothly near its mouth without moving its center", async (t) => {
  const h = await harness(t); h.collectStage();
  const base = h.controller.getCollectionBoxState();
  h.pointer("pointermove", h.dropCenter()); h.advance(.3);
  assert.equal(h.root.dataset.boxScale, "1.0000", "an ordinary hover cannot expand the box");
  h.holdTopIcon();
  h.pointer("pointermove", h.dropCenter()); h.advance(.02, 100);
  assert.ok(Number(h.root.dataset.boxScale) > 1 && Number(h.root.dataset.boxScale) < 1.12);
  h.advance(.6);
  const expanded = h.controller.getCollectionBoxState();
  assert.equal(expanded.scale, 1.12);
  assert.ok(Math.abs(expanded.rect.x + expanded.rect.width / 2 - base.rect.x - base.rect.width / 2) < 1e-8);
  assert.ok(Math.abs(expanded.rect.y + expanded.rect.height / 2 - base.rect.y - base.rect.height / 2) < 1e-8);
  const away = { x: 1050, y: 350 };
  h.pointer("pointermove", away); h.advance(.6);
  assert.equal(h.root.dataset.boxScale, "1.0000");
  h.pointer("pointerup", away);
  assert.equal(h.root.dataset.packed, "0");
});

test("closure waits for the last packing animation and only the closed box advances once", async (t) => {
  const h = await harness(t); fillBox(h);
  assert.equal(h.root.dataset.boxState, "open");
  assert.equal(h.root.dataset.boxCloseProgress, "0.0000");
  const center = () => {
    const box = h.controller.getCollectionBoxState().rect;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  h.click(center()); h.key("Enter"); h.advance(.2, 100);
  assert.equal(h.root.dataset.boxState, "open");
  assert.equal(h.selections.length, 0);
  h.advance(.2, 100);
  assert.equal(h.root.dataset.boxState, "closing");
  h.advance(.04, 100);
  const blend = drawCalls(h);
  const open = blend.find((call) => call.source === "box-collection-draft3.png" && !call.clipped);
  const closed = blend.find((call) => call.source === "box-collection-closed-v1.png");
  assert.ok(open.opacity > 0 && open.opacity < 1 && closed.opacity > 0 && closed.opacity < 1);
  assert.ok(Math.abs(open.opacity + closed.opacity - 1) < 1e-8);
  h.click(center()); h.key(" ");
  assert.equal(h.selections.length, 0, "clicks during closure must not be queued");
  h.advance(.3, 100);
  assert.equal(h.root.dataset.boxState, "closed");
  assert.equal(h.root.dataset.boxCloseProgress, "1.0000");
  h.click(); h.canvas.dispatchEvent(new Event("wheel")); h.advance(2);
  assert.equal(h.selections.length, 0, "background clicks, wheel, and elapsed time cannot continue");
  h.click(center());
  assert.equal(h.selections.length, 1);
  assert.equal(h.selections[0].closed, true);
  assert.equal(h.selections[0].image.src, "box-collection-closed-v1.png");
  assert.deepEqual(h.selections[0].sourceRect, [43, 101, 1459, 866]);
  assert.ok(Math.abs(h.selections[0].displayRect.x - h.rect.x - h.selections[0].rect.x * h.rect.scale) < 1e-8);
  h.click(center()); h.key("Enter"); h.key(" ");
  assert.equal(h.selections.length, 1);
});

test("hidden time cannot finish closure and reset restores its input gate", async (t) => {
  const h = await harness(t); fillBox(h); h.advance(.45, 100);
  assert.equal(h.root.dataset.boxState, "closing");
  const before = h.root.dataset.boxCloseProgress;
  h.document.hidden = true; h.document.dispatchEvent(new Event("visibilitychange")); h.advance(30);
  assert.equal(h.root.dataset.boxCloseProgress, before);
  h.document.hidden = false; h.document.dispatchEvent(new Event("visibilitychange"));
  h.controller.reset(); h.advance(4); h.key("Enter");
  assert.equal(h.root.dataset.boxState, "open");
  assert.equal(h.root.dataset.boxCloseProgress, "0.0000");
  assert.equal(h.root.dataset.boxVisible, "false");
  assert.equal(h.selections.length, 0);
});

test("reduced motion closes immediately but still waits for a deliberate keyboard selection", async (t) => {
  const h = await harness(t); h.controller.configure(h.rect, true, true); fillBox(h);
  assert.equal(h.root.dataset.boxState, "closed");
  assert.equal(h.root.dataset.boxCloseProgress, "1.0000");
  assert.equal(h.selections.length, 0);
  h.key("Enter"); h.key("Enter", { repeat: true }); h.key(" ");
  assert.equal(h.selections.length, 1);
  assert.equal(h.root.dataset.boxState, "selected");
});

test("interaction waits for the closed sprite to decode before accepting the first click", async (t) => {
  let resolveClosed;
  const pending = new Promise((resolve) => { resolveClosed = resolve; });
  const h = await harness(t, { waitReady: false, decode: (source) => source.includes("closed") ? pending : Promise.resolve() });
  assert.equal(h.canvas.tabIndex, -1);
  h.click(); h.key("Enter"); h.advance(1);
  assert.equal(h.root.dataset.gamePhase, "grid");
  assert.equal(h.controller.getCollectionBoxState().ready, false);
  resolveClosed(); await h.controller.ready;
  assert.equal(h.canvas.tabIndex, 0);
  h.click();
  assert.equal(h.root.dataset.gamePhase, "falling");
});

test("a closed sprite load error is reported and keeps the interaction disabled", async (t) => {
  let rejectClosed;
  const pending = new Promise((resolve, reject) => { rejectClosed = reject; });
  const h = await harness(t, { waitReady: false, decode: (source) => source.includes("closed") ? pending : Promise.resolve() });
  const failure = assert.rejects(h.controller.ready, /closed sprite failed/);
  rejectClosed(new Error("closed sprite failed")); await failure;
  assert.equal(h.root.dataset.collectionBoxReady, "error");
  assert.equal(h.canvas.tabIndex, -1);
  h.click(); h.advance(1);
  assert.equal(h.root.dataset.gamePhase, "grid");
  assert.equal(h.selections.length, 0);
});
