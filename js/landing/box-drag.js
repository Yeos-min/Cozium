import { attachTapeDrag } from "./tape-input.js";
import { TAPE, getOverheadMatrix, getTapePose, createTapeMaterials, drawTapeScene } from "./tape-renderer.js";
import { getFlapStates, OPEN_DURATION } from "./flap-geometry.js";
import { createFlapMaterials, drawOpeningScene } from "./flap-renderer.js";

export function mountBoxScene(stage, { active = true } = {}) {
const canvas = stage.querySelector("canvas");
const ctx = canvas.getContext("2d");
const grip = stage.querySelector(".tape-grip");
const status = stage.querySelector(".status");
const liveStatus = stage.querySelector("#tape-status");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let ready = false, width = 0, height = 0, matrix = getOverheadMatrix(1, 1);
let input = { progress: 0, dragging: false, pointer: null, complete: false };
let progress = 0, hover = 0, hovered = false, escape = 0, completeAt = 0, lastTime = 0;
let frame = 0, pausedAt = active ? 0 : performance.now();
let end = { x: TAPE.left, y: TAPE.top }, heldTip = null, grabOffset = null, startTip = null, startProgress = 0;
const images = {};
const inspection = new URLSearchParams(location.search).get("inspectOpen");
const inspectTime = inspection !== null && Number.isFinite(Number(inspection)) ? Math.max(0, Math.min(OPEN_DURATION, Number(inspection))) : null;
let openingDone = false;

function resize() {
  const rect = stage.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  matrix = getOverheadMatrix(width, height);
  canvas.dataset.imageRect = JSON.stringify(matrix);
  if (ready) render(active ? performance.now() : pausedAt);
}

function sourcePoint(point) {
  const bounds = stage.getBoundingClientRect();
  return { x: (point.x - bounds.left - matrix.x) / matrix.scale, y: (point.y - bounds.top - matrix.y) / matrix.scale };
}

function syncGrip() {
  const enabled = ready && active && inspectTime === null && !input.complete;
  grip.hidden = !enabled;
  grip.disabled = !enabled;
  canvas.dataset.active = String(active);
}

for (const type of ["pointerdown", "pointermove", "pointerup", "keydown"]) {
  grip.addEventListener(type, (event) => {
    if (!active) event.stopImmediatePropagation();
  }, { capture: true });
}

const drag = attachTapeDrag(grip, {
  getTapeWidth: () => TAPE.width * matrix.scale,
  onChange(state) {
    if (state.dragging && !input.dragging) {
      startProgress = state.progress;
      startTip = heldTip ? { ...heldTip } : null;
      const point = sourcePoint(state.startPointer);
      grabOffset = {
        x: end.x - point.x,
        y: end.y - point.y,
      };
    }
    if (state.dragging && state.progress > 0) {
      const point = sourcePoint(state.pointer);
      heldTip = {
        x: point.x + grabOffset.x,
        y: point.y + grabOffset.y,
      };
    }
    if (!state.dragging && input.dragging && state.progress <= startProgress) heldTip = startTip;
    input = state;
    if (!state.complete) progress = state.progress;
    grip.dataset.dragging = String(state.dragging);
    stage.dataset.dragging = String(state.dragging);
    canvas.dataset.peel = state.progress.toFixed(4);
    canvas.dataset.complete = String(state.complete);
  },
  onComplete() {
    completeAt = performance.now();
    hovered = false;
    grip.hidden = true;
    grip.disabled = true;
    liveStatus.textContent = "테이프를 모두 떼었어요.";
    stage.dispatchEvent(new CustomEvent("cozium:tape-removed", { bubbles: true }));
  },
});

stage.addEventListener("pointermove", (event) => {
  if (!active || input.dragging || input.complete) return;
  const { x, y } = sourcePoint({ x: event.clientX, y: event.clientY });
  hovered = event.target === grip || (x >= TAPE.left && x <= TAPE.left + TAPE.width && y >= TAPE.top && y <= TAPE.top + TAPE.height);
});
stage.addEventListener("pointerleave", () => { hovered = false; });
grip.addEventListener("focus", () => { hovered = active; });
grip.addEventListener("blur", () => { hovered = false; });
stage.addEventListener("wheel", (event) => {
  if (active && !event.ctrlKey) event.preventDefault();
}, { passive: false });
function reset() {
  drag.reset();
  progress = 0;
  escape = 0;
  completeAt = 0;
  openingDone = false;
  hovered = false;
  end = { x: TAPE.left, y: TAPE.top };
  heldTip = null;
  grabOffset = null;
  hover = 0;
  startTip = null;
  startProgress = 0;
  lastTime = 0;
  syncGrip();
  liveStatus.textContent = "상자가 처음 상태로 돌아왔어요.";
  if (ready) render(active ? performance.now() : pausedAt);
}
stage.querySelector(".reset")?.addEventListener("click", reset);

function positionGrip() {
  if (!ready || input.complete) return;
  const point = progress > 0 ? end : { x: TAPE.left + 5, y: TAPE.top + 5 };
  const gripWidth = progress > 0 ? 86 : 112;
  grip.style.left = `${matrix.x + (point.x - 12) * matrix.scale}px`;
  grip.style.top = `${matrix.y + (point.y - 8) * matrix.scale}px`;
  grip.style.width = `${Math.max(44, gripWidth * matrix.scale)}px`;
  grip.style.height = `${Math.max(44, 92 * matrix.scale)}px`;
  canvas.dataset.gripRect = JSON.stringify({ x: point.x, y: point.y, width: gripWidth, height: 92 });
}

function render(time, advance = false) {
  const delta = advance ? Math.min(60, lastTime ? time - lastTime : 16) : 0;
  if (advance) lastTime = time;
  if (ready) {
    if (input.complete && advance) {
      progress += (1 - progress) * (reduced ? 1 : Math.min(1, delta / 45));
      if (progress > .999) progress = 1;
      escape = reduced ? 1 : Math.max(0, Math.min(1, (time - completeAt - 100) / 430));
    }
    if (advance) hover += ((hovered && !input.complete ? 1 : 0) - hover) * (reduced ? 1 : Math.min(1, delta / 100));
    const pose = getTapePose(progress, hover, heldTip);
    end = pose.tip;
    const dpr = canvas.width / width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(matrix.x, matrix.y);
    ctx.scale(matrix.scale, matrix.scale);
    const openingElapsed = inspectTime ?? (input.complete ? time - completeAt - (reduced ? 0 : 570) : -1);
    if (openingElapsed >= 0) {
      const states = getFlapStates(openingElapsed, reduced && inspectTime === null);
      drawOpeningScene(ctx, images, states);
      canvas.dataset.phase = states.phase;
      canvas.dataset.flaps = JSON.stringify(Object.fromEntries(Object.entries(states.flaps).map(([name, flap]) => [name, { progress: flap.progress, edge: flap.edgeExposure, back: flap.back }])));
      if (states.done && !openingDone && active) {
        openingDone = true;
        liveStatus.textContent = "빈 상자가 열렸어요.";
        stage.dispatchEvent(new CustomEvent("cozium:box-opened", { bubbles: true }));
      }
    } else {
      drawTapeScene(ctx, images, { progress, pose, escape, base: images.closedPlate });
      canvas.dataset.phase = input.complete ? "tape-release" : "tape";
      canvas.dataset.flaps = JSON.stringify(Object.fromEntries(["upper", "lower", "left", "right"].map((name) => [name, { progress: 0, edge: 0 }])));
    }
    positionGrip();
    canvas.dataset.hover = hover.toFixed(3);
    canvas.dataset.renderPeel = progress.toFixed(4);
    canvas.dataset.escape = escape.toFixed(3);
    canvas.dataset.tip = JSON.stringify(end);
  }
}

function draw(time) {
  frame = 0;
  if (!ready || !active) return;
  render(time, true);
  frame = requestAnimationFrame(draw);
}

function setActive(value) {
  const next = Boolean(value);
  if (next === active) return;
  const now = performance.now();
  if (next && completeAt) completeAt += now - pausedAt;
  active = next;
  if (!active) {
    pausedAt = now;
    hovered = false;
    cancelAnimationFrame(frame);
    frame = 0;
  }
  lastTime = 0;
  syncGrip();
  if (ready) {
    resize();
    if (active && !frame) frame = requestAnimationFrame(draw);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했어요: ${file}`));
    image.src = new URL(`../../assets/landing/box/${file}`, import.meta.url).href;
  });
}

resize();
addEventListener("resize", resize);
syncGrip();
const loaded = Promise.all([loadImage("box-overhead-closed-v2.png"), loadImage("box-overhead-untaped-v1.png"), loadImage("box-overhead-open-v2.png"), loadImage("box-opening-v1/floor.png"), loadImage("box-opening-v1/body.png"), loadImage("box-opening-v1/inner-closed.png")]).then(([closed, clean, open, floor, body, inner]) => {
  if (!ctx) throw new Error("Canvas 2D를 사용할 수 없어요.");
  Object.assign(images, { closed, clean, open, floor, body, inner, materials: createTapeMaterials(closed) });
  images.flapMaterials = createFlapMaterials(images);
  images.closedPlate = document.createElement("canvas");
  images.closedPlate.width = closed.naturalWidth;
  images.closedPlate.height = closed.naturalHeight;
  drawOpeningScene(images.closedPlate.getContext("2d"), images, getFlapStates(0));
  images.sealedPlate = document.createElement("canvas");
  images.sealedPlate.width = closed.naturalWidth;
  images.sealedPlate.height = closed.naturalHeight;
  drawTapeScene(images.sealedPlate.getContext("2d"), images, { progress: 0, pose: getTapePose(0, 0), escape: 0, base: images.closedPlate });
  ready = true;
  syncGrip();
  status.hidden = true;
  canvas.dataset.ready = "true";
  resize();
  if (active && !frame) frame = requestAnimationFrame(draw);
  return canvas;
}).catch((error) => {
  status.hidden = false;
  status.textContent = error.message;
  canvas.dataset.ready = "error";
  canvas.dataset.error = error.message;
  throw error;
});
function getOpenPlate() {
  if (!ready) return null;
  if (!images.openPlate) {
    images.openPlate = document.createElement("canvas");
    images.openPlate.width = images.closed.naturalWidth;
    images.openPlate.height = images.closed.naturalHeight;
    drawOpeningScene(images.openPlate.getContext("2d"), images, getFlapStates(OPEN_DURATION));
  }
  return images.openPlate;
}
return { ready: loaded, canvas, reset, setActive, getClosedPlate: () => images.sealedPlate, getOpenPlate };
}

if (typeof document !== "undefined") {
  const preview = document.querySelector("[data-box-preview]");
  if (preview) mountBoxScene(preview).ready.catch((error) => console.error("Cozium box:", error));
}
