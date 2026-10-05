import { BOX_CONFIG, drawRoomBox } from "./room-box.js";
import { mountBoxScene } from "./box-drag.js";
import { mountDesktopScene, getDesktopAutoProgress } from "./desktop-scene.js";
import { mountReturnScene } from "./return-scene.js";
import { mapQuad } from "./flap-renderer.js";
import { CLOSED_RECT, ROOM_FRONT, ROOM_RIGHT, FOCUS_DURATION, getFocusTransition } from "./scene-transition.js";

const ROOM_WIDTH = 1672;
const ROOM_HEIGHT = 941;
const BOX_FOOT = BOX_CONFIG.foot;
const BOX_WIDTH = BOX_CONFIG.width;
const BOX_SOURCE_RECT = BOX_CONFIG.sourceRect;
const BOX_HEIGHT = BOX_CONFIG.height;
const DROP_DURATION = 700;
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const mix = (a, b, t) => a + (b - a) * t;
const phase = (n, start, end) => {
  const t = clamp((n - start) / (end - start));
  return t * t * (3 - 2 * t);
};

export function getBoxPose(progress, boxHeight = BOX_HEIGHT, reduceMotion = false) {
  const value = clamp(progress);
  const flight = clamp(value / .72);
  const bounceTime = clamp((value - .72) / .28);
  const airborne = value > 0 && value < .72;
  const bouncing = value >= .72 && value < 1 && !reduceMotion;
  const lift = bouncing ? Math.sin(bounceTime * Math.PI) * 15 : 0;
  const impact = bouncing ? 1 - phase(bounceTime, 0, .33) : 0;
  const footY = airborne ? mix(-boxHeight - 200, BOX_FOOT.y, flight * flight) : BOX_FOOT.y - lift;
  const rotation = reduceMotion ? 0 : airborne ? clamp(Math.sin(flight * Math.PI) * 3 - (1 - flight) * 2, -3, 3) : bouncing ? -Math.sin(bounceTime * Math.PI) * 1.2 : 0;
  return {
    visible: value > 0,
    shot: value === 0 ? "room" : value < 1 ? "drop" : "landed",
    x: BOX_FOOT.x, y: footY, offsetY: footY - BOX_FOOT.y,
    width: BOX_WIDTH, height: boxHeight,
    scaleX: 1 + impact * .044, scaleY: 1 - impact * .036,
    rotation: rotation * Math.PI / 180, flight, lift,
  };
}

export function getNextBoxState(state, action) {
  if (state === "room" && action === "drop") return "falling";
  if (state === "falling" && action === "land") return "landed";
  if (state === "landed" && action === "select") return "selected";
  return state;
}

export function getRoomMatrix(width, height, progress, pointerX = 0, pointerY = 0, reduceMotion = false) {
  const zoom = 1.02;
  const scale = Math.max(width / ROOM_WIDTH, height / ROOM_HEIGHT) * zoom;
  const iw = ROOM_WIDTH * scale, ih = ROOM_HEIGHT * scale;
  const marginX = Math.max(0, (iw - width) / 2), marginY = Math.max(0, (ih - height) / 2);
  const panX = reduceMotion ? 0 : clamp(pointerX * 7, -marginX, marginX);
  const panY = reduceMotion ? 0 : clamp(pointerY * 4, -marginY, marginY);
  return { ix: (width - iw) / 2 + panX, iy: (height - ih) / 2 + panY, iw, ih, scale, marginX, marginY, panX, panY, zoom };
}

export function getRoomLayerMatrix(room, depth, progress, pointerX = 0, pointerY = 0, reduceMotion = false) {
  const relativeDepth = depth - .15;
  const panX = reduceMotion ? 0 : clamp(room.panX + pointerX * 10 * relativeDepth, -room.marginX, room.marginX);
  const panY = reduceMotion ? 0 : clamp(room.panY + pointerY * 6 * relativeDepth, -room.marginY, room.marginY);
  return { ...room, ix: room.ix - room.panX + panX, iy: room.iy - room.panY + panY, panX, panY };
}

if (typeof document !== "undefined") {
  const stage = document.querySelector(".stage");
  const journey = document.querySelector(".journey");
  const canvas = document.querySelector(".room-canvas");
  const title = document.querySelector(".title");
  const endingActions = title.querySelector(".ending-actions");
  const status = document.querySelector(".room-status");
  const captionNumber = document.querySelector(".caption > span");
  const captionLabel = document.querySelector(".caption-label");
  const boxAction = document.querySelector(".box-action");
  const overheadRoot = stage.querySelector(".overhead-scene");
  const desktopRoot = stage.querySelector(".desktop-scene");
  const returnRoot = stage.querySelector(".return-scene");
  const header = stage.querySelector("header");
  const caption = stage.querySelector(".caption");
  const resetButton = stage.querySelector(".reset");
  const boxScene = mountBoxScene(overheadRoot, { active: false });
  const desktopScene = mountDesktopScene(desktopRoot, {
    getOpenPlate: boxScene.getOpenPlate,
    onCollectionBoxSelected: selectCollectionBox,
  });
  let returnDesktopPlate = null, returnBoxRect = null, endingRun = 0;
  const returnScene = mountReturnScene(returnRoot, {
    getDesktopPlate: () => returnDesktopPlate,
    getCollectionBoxRect: () => returnBoxRect,
    onPhase: showReturnPhase,
  });
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const assetBase = new URL("../../assets/landing/parts/room-v3/", import.meta.url);
  let width = 1, height = 1, ratio = 1, progress = 0, elapsed = 0;
  let state = "room", wheelDistance = 0, scrollPosition = 0;
  let x = 0, y = 0, tx = 0, ty = 0, frame = 0, last = 0, ready = false;
  let layers = [], boxImage, floorImage, boxHeight = BOX_HEIGHT;
  let focusElapsed = 0, keyboardSelect = false;
  let desktopReady = false, desktopProgress = 0, desktopElapsed = 0, desktopFrame = 0, desktopLast = 0;
  const inspection = new URLSearchParams(location.search).get("inspectFocus");
  const inspectFocus = inspection !== null && Number.isFinite(Number(inspection)) ? clamp(Number(inspection)) : null;
  const desktopInspection = new URLSearchParams(location.search).get("inspectDesktop");
  const inspectDesktop = desktopInspection !== null && Number.isFinite(Number(desktopInspection)) ? clamp(Number(desktopInspection)) : null;
  // Attach the rejection handler immediately, even if the room manifest is slow.
  const boxPrepared = boxScene.ready.then(() => ({ ok: true }), (error) => ({ ok: false, error }));
  desktopScene.ready.then(() => {
    desktopReady = true;
    if (isDesktopState()) {
      if (inspectDesktop !== null) { desktopProgress = inspectDesktop; renderDesktop(); }
      else startDesktopTransition();
    }
  }, (error) => {
    console.error("Cozium desktop:", error);
    if (isDesktopState()) showDesktopError();
  });
  returnScene.ready.catch((error) => console.error("Cozium return:", error));

  function isDesktopState() {
    return state === "open" || state === "desktop-transition" || state === "desktop";
  }
  function isReturnState() {
    return ["return-to-box", "filled-box", "return-to-room", "tidy-room"].includes(state);
  }
  function showReturnPhase(next, pose) {
    if (!isReturnState()) return;
    state = next;
    stage.dataset.scene = state;
    canvas.dataset.boxGate = state;
    const finished = next === "tidy-room";
    endingActions.hidden = !finished;
    endingActions.inert = !finished;
    header.style.opacity = finished ? "1" : "0";
    header.inert = !finished;
    caption.style.opacity = finished ? "1" : "0";
    title.style.setProperty("--opacity", finished ? "1" : "0");
    title.setAttribute("aria-hidden", String(!finished));
    if (finished) {
      const room = pose.roomMatrix;
      title.style.setProperty("--x", clamp(room.ix + room.iw * .524, width * .33, width * .76) + "px");
      title.style.setProperty("--y", clamp(room.iy + room.ih * .16, height * .10, height * .30) + "px");
      title.style.setProperty("--type", Math.min(124, room.iw * .057, width * .245) + "px");
      captionNumber.textContent = "06";
      captionLabel.textContent = "제자리를 찾은 방";
    }
  }
  async function selectCollectionBox() {
    if (state !== "desktop") return;
    const run = ++endingRun;
    returnDesktopPlate = desktopScene.getDesktopPlate();
    returnBoxRect = desktopScene.getCollectionBoxState().displayRect;
    desktopScene.setActive(false);
    cancelAnimationFrame(desktopFrame); desktopFrame = desktopLast = 0;
    state = "return-to-box";
    stage.dataset.scene = state;
    canvas.dataset.boxGate = state;
    returnRoot.hidden = false;
    returnRoot.setAttribute("aria-hidden", "false");
    const started = await returnScene.start({ reducedMotion: reduced.matches });
    if (run !== endingRun || !isReturnState()) return;
    if (started) {
      desktopRoot.hidden = true;
      desktopRoot.setAttribute("aria-hidden", "true");
      returnRoot.querySelector("canvas").focus?.({ preventScroll: true });
    }
  }
  function showDesktopError() {
    const message = overheadRoot.querySelector(".status");
    message.hidden = false;
    message.textContent = "바탕화면을 불러오지 못했어요. 페이지를 새로고침해 주세요.";
  }
  function renderDesktop() {
    if (!desktopReady) return;
    desktopRoot.hidden = false;
    desktopRoot.setAttribute("aria-hidden", String(desktopProgress === 0));
    overheadRoot.style.opacity = desktopProgress === 0 ? "1" : "0";
    overheadRoot.setAttribute("aria-hidden", String(desktopProgress > 0));
    desktopScene.render(desktopProgress, reduced.matches);
    desktopRoot.hidden = desktopProgress === 0;
    state = desktopProgress === 0 ? "open" : desktopProgress === 1 ? "desktop" : "desktop-transition";
    stage.dataset.scene = state;
    canvas.dataset.boxGate = state;
    const chrome = 1 - phase(desktopProgress, .15, .5);
    header.style.opacity = String(chrome);
    header.inert = chrome === 0;
    caption.style.opacity = String(chrome);
    stage.style.setProperty("--cue", "0");
  }
  function animateDesktop(time) {
    desktopFrame = 0;
    if (!isDesktopState() || document.hidden) return;
    const dt = desktopLast ? Math.max(0, time - desktopLast) : 0;
    desktopLast = time;
    desktopElapsed += dt;
    desktopProgress = getDesktopAutoProgress(desktopElapsed, reduced.matches);
    desktopRoot.dataset.elapsed = desktopElapsed.toFixed(1);
    renderDesktop();
    if (desktopProgress < 1) desktopFrame = requestAnimationFrame(animateDesktop);
  }
  function startDesktopTransition() {
    if (!desktopReady || !isDesktopState() || desktopProgress === 1 || inspectDesktop !== null) return;
    desktopRoot.dataset.playback = "automatic";
    if (!document.hidden && !desktopFrame) {
      desktopLast = 0;
      desktopFrame = requestAnimationFrame(animateDesktop);
    }
  }

  function startDrop() {
    if (!ready || state !== "room") return;
    state = getNextBoxState(state, "drop");
    elapsed = 0;
    last = 0;
  }
  function scroll() {
    const next = Math.max(0, -journey.getBoundingClientRect().top);
    const distance = next - scrollPosition;
    scrollPosition = next;
    if (!ready || state !== "room") return;
    wheelDistance = Math.max(0, wheelDistance + distance);
    if (wheelDistance >= 6) startDrop();
  }
  function resize() {
    width = stage.clientWidth; height = stage.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    scrollPosition = Math.max(0, -journey.getBoundingClientRect().top);
    if (isDesktopState() && desktopReady) renderDesktop();
    if (isReturnState()) {
      const pose = returnScene.render();
      if (pose) showReturnPhase(pose.phase, pose);
    }
  }
  function layerMatrix(layer, room) {
    return getRoomLayerMatrix(room, layer.depth, progress, x, y, reduced.matches);
  }
  function drawPart(layer, room) {
    const scale = layer.scale ?? 1;
    const anchor = layer.anchor || [1, 1], offset = layer.offset || [0, 0];
    const sx = ROOM_WIDTH * anchor[0] * (1 - scale) + offset[0];
    const sy = ROOM_HEIGHT * anchor[1] * (1 - scale) + offset[1];
    ctx.drawImage(layer.image, room.ix + sx * room.scale, room.iy + sy * room.scale, room.iw * scale, room.ih * scale);
  }
  function drawBox(pose, room) {
    if (!pose.visible) return;
    ctx.save(); ctx.translate(room.ix, room.iy); ctx.scale(room.scale, room.scale);
    drawRoomBox(ctx, boxImage, pose);
    ctx.restore();
  }
  function draw(time) {
    if (!ready || document.hidden || state === "overhead" || isDesktopState() || isReturnState()) { frame = 0; return; }
    const dt = Math.min(60, time - (last || time)); last = time;
    if (state === "falling") {
      elapsed += dt;
      progress = reduced.matches ? 1 : clamp(elapsed / DROP_DURATION);
      if (progress === 1) state = getNextBoxState(state, "land");
    }
    if (state !== "selected") { x += (tx - x) * .06; y += (ty - y) * .06; }
    const baseRoom = getRoomMatrix(width, height, progress, x, y, reduced.matches);
    if (state === "selected") focusElapsed += dt;
    const focus = state === "selected" ? getFocusTransition(baseRoom, width, height, inspectFocus ?? (reduced.matches ? 1 : focusElapsed / FOCUS_DURATION)) : null;
    const room = focus?.room ?? baseRoom;
    const pose = getBoxPose(progress, boxHeight, reduced.matches);
    const matrices = layers.map((layer) => focus ? room : layerMatrix(layer, room));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    drawPart(layers[0], matrices[0]);
    ctx.save(); ctx.globalAlpha = focus?.roomBox ?? 1;
    drawBox(pose, matrices[0]); ctx.restore();
    ctx.save(); ctx.globalAlpha = focus?.foreground ?? 1;
    layers.slice(1).forEach((layer, index) => drawPart(layer, matrices[index + 1])); ctx.restore();
    if (focus) drawFocus(focus);
    const bg = matrices[0];
    title.style.setProperty("--x", clamp(bg.ix + bg.iw * .524, width * .33, width * .76) + "px");
    title.style.setProperty("--y", clamp(bg.iy + bg.ih * .16, height * .10, height * .30) + "px");
    title.style.setProperty("--type", Math.min(124, bg.iw * .057, width * .245) + "px");
    title.style.setProperty("--opacity", String(1 - phase(progress, .03, .24)));
    title.setAttribute("aria-hidden", String(progress >= .24));
    stage.style.setProperty("--cue", String(1 - phase(progress, .03, .18)));
    if (captionNumber) captionNumber.textContent = pose.shot === "room" ? "01" : "02";
    if (captionLabel) captionLabel.textContent = pose.shot === "landed" ? "새 자리에 도착한 것들" : "아직, 자리를 찾는 중";
    if (focus && focus.progress > .58) {
      stage.dataset.scene = "focus";
      captionNumber.textContent = "03";
      captionLabel.textContent = "새 자리를 위한 준비";
    }
    const footX = bg.ix + pose.x * bg.scale, footY = bg.iy + pose.y * bg.scale;
    boxAction.hidden = state !== "landed";
    boxAction.disabled = state !== "landed";
    Object.assign(boxAction.style, {
      left: bg.ix + BOX_SOURCE_RECT.x * bg.scale + "px",
      top: bg.iy + BOX_SOURCE_RECT.y * bg.scale + "px",
      width: BOX_WIDTH * bg.scale + "px", height: BOX_HEIGHT * bg.scale + "px",
    });
    Object.assign(canvas.dataset, {
      ready: "true", progress: progress.toFixed(4), shot: pose.shot, boxVisible: String(pose.visible),
      boxFoot: [footX, footY].map((n) => n.toFixed(2)).join(","),
      boxGround: [bg.ix + BOX_FOOT.x * bg.scale, bg.iy + BOX_FOOT.y * bg.scale].map((n) => n.toFixed(2)).join(","),
      boxTransform: [footX, footY, pose.width * bg.scale * pose.scaleX, pose.height * bg.scale * pose.scaleY, pose.offsetY, pose.rotation * 180 / Math.PI].map((n) => n.toFixed(3)).join(","),
      spriteCrop: [BOX_SOURCE_RECT.x, BOX_SOURCE_RECT.y, BOX_SOURCE_RECT.w, BOX_SOURCE_RECT.h].join(","),
      boxSprite: BOX_CONFIG.file, sourceContact: BOX_CONFIG.sourceContact.join(","),
      boxGate: state, nextSceneRequested: String(state === "selected"), cameraZoom: String(room.zoom),
      layers: layers.map((layer) => layer.id).join(","),
      drawOrder: pose.visible ? "background,shadow,box,left,files,door" : "background,left,files,door",
      pan: [bg.panX, bg.panY].map((n) => n.toFixed(3)).join(","),
      layerPan: JSON.stringify(Object.fromEntries(layers.map((layer, index) => [layer.id, [matrices[index].panX, matrices[index].panY].map((n) => +n.toFixed(3))]))),
      imageRect: [bg.ix, bg.iy, bg.iw, bg.ih].map((n) => n.toFixed(2)).join(","),
      focusProgress: (focus?.progress ?? 0).toFixed(4),
      focusQuad: focus ? JSON.stringify(focus.quad) : "",
    });
    if (focus?.done) {
      state = "overhead";
      stage.dataset.scene = "overhead";
      canvas.dataset.boxGate = state;
      canvas.hidden = true;
      overheadRoot.style.opacity = "1";
      overheadRoot.setAttribute("aria-hidden", "false");
      overheadRoot.dataset.active = "true";
      boxScene.setActive(true);
      if (keyboardSelect) overheadRoot.querySelector(".tape-grip").focus({ preventScroll: true });
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(draw);
  }
  function drawFocus(focus) {
    const overhead = focus.overhead;
    ctx.save(); ctx.globalAlpha = focus.floor;
    ctx.drawImage(floorImage, overhead.x, overhead.y, 1672 * overhead.scale, 941 * overhead.scale); ctx.restore();
    if (focus.face > 0) {
      const offset = [90 * overhead.scale * focus.shadow, 94 * overhead.scale * focus.shadow];
      const footprint = [focus.quad[0], focus.quad[1], focus.front[2], focus.front[3]];
      ctx.save(); ctx.globalAlpha = .16 * focus.shadow;
      ctx.filter = `blur(${9 * overhead.scale}px)`;
      ctx.fillStyle = "#715536";
      ctx.beginPath();
      footprint.map(([px, py]) => [px + offset[0], py + offset[1]]).forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
      ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalAlpha = .10 * focus.shadow;
      ctx.filter = `blur(${2 * overhead.scale}px)`;
      ctx.fillStyle = "#62452d"; ctx.beginPath();
      footprint.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
      ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalAlpha = focus.face * focus.rightFace;
      mapQuad(ctx, boxImage, ROOM_RIGHT, focus.right);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = focus.face;
      mapQuad(ctx, boxImage, ROOM_FRONT, focus.front);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = focus.face;
      mapQuad(ctx, boxScene.getClosedPlate(), CLOSED_RECT, focus.quad);
      ctx.restore();
    }
    if (focus.handoff > 0) {
      ctx.save(); ctx.globalAlpha = focus.handoff;
      ctx.drawImage(boxScene.getClosedPlate(), overhead.x, overhead.y, 1672 * overhead.scale, 941 * overhead.scale);
      ctx.restore();
    }
  }
  async function loadImage(file) {
    const image = new Image(); image.src = new URL(file, assetBase).href;
    try { await image.decode(); } catch { throw new Error(`${file} 이미지를 불러오지 못했습니다.`); }
    return image;
  }

  addEventListener("scroll", scroll, { passive: true });
  addEventListener("wheel", (event) => {
    if (event.ctrlKey || !ready) return;
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    if (isDesktopState() || isReturnState()) {
      event.preventDefault();
      return;
    }
    if (state !== "room") return;
    wheelDistance = Math.max(0, wheelDistance + event.deltaY * units);
    if (wheelDistance >= 6) startDrop();
  }, { passive: false });
  const isControl = (target) => target instanceof Element && Boolean(target.closest("a,button,input,textarea,select,[contenteditable]"));
  addEventListener("keydown", (event) => {
    if (!(isDesktopState() || isReturnState()) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isControl(event.target)) return;
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) event.preventDefault();
  });
  boxAction.addEventListener("click", (event) => {
    const next = getNextBoxState(state, "select");
    if (next === state) return;
    state = next;
    focusElapsed = 0; last = 0; keyboardSelect = event.detail === 0;
    boxAction.hidden = true; boxAction.disabled = true;
    resetButton.hidden = false;
    stage.dispatchEvent(new CustomEvent("cozium:box-selected", { bubbles: true, detail: { next: "box-focus" } }));
  });
  overheadRoot.addEventListener("cozium:box-opened", () => {
    if (state !== "overhead") return;
    boxScene.setActive(false);
    overheadRoot.dataset.active = "false";
    state = "open";
    stage.dataset.scene = state;
    canvas.dataset.boxGate = state;
    desktopElapsed = desktopProgress = desktopLast = 0;
    stage.style.setProperty("--cue", "0");
    captionNumber.textContent = "04";
    captionLabel.textContent = "비어 있는 상자, 새로운 시작";
    if (inspectDesktop !== null && desktopReady) {
      desktopProgress = inspectDesktop;
      renderDesktop();
    } else if (desktopRoot.querySelector("canvas").dataset.ready === "error") showDesktopError();
    else startDesktopTransition();
  });
  resetButton.addEventListener("click", () => {
    endingActions.hidden = true;
    endingActions.inert = true;
    endingRun++;
    returnScene.reset();
    returnDesktopPlate = returnBoxRect = null;
    returnRoot.hidden = true;
    returnRoot.setAttribute("aria-hidden", "true");
    cancelAnimationFrame(desktopFrame);
    desktopFrame = desktopLast = desktopProgress = desktopElapsed = 0;
    desktopRoot.dataset.playback = "idle";
    desktopRoot.dataset.elapsed = "0";
    desktopScene.reset(); desktopRoot.hidden = true;
    desktopRoot.setAttribute("aria-hidden", "true");
    header.style.opacity = "1"; header.inert = false; caption.style.opacity = "1";
    boxScene.setActive(false); boxScene.reset();
    overheadRoot.style.opacity = "0";
    overheadRoot.setAttribute("aria-hidden", "true");
    overheadRoot.dataset.active = "false";
    canvas.hidden = false;
    state = "room"; stage.dataset.scene = "room";
    progress = elapsed = focusElapsed = wheelDistance = 0;
    x = y = tx = ty = last = 0;
    scrollPosition = Math.max(0, -journey.getBoundingClientRect().top);
    resetButton.hidden = true;
    if (ready && !document.hidden && !frame) frame = requestAnimationFrame(draw);
  });
  addEventListener("resize", resize);
  addEventListener("pointermove", (event) => {
    if (state === "selected" || state === "overhead" || isDesktopState() || isReturnState()) return;
    const bounds = stage.getBoundingClientRect();
    tx = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1, -1, 1);
    ty = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1, -1, 1);
  }, { passive: true });
  reduced.addEventListener("change", () => {
    tx = ty = x = y = 0;
    if (isDesktopState()) {
      if (reduced.matches && desktopReady && inspectDesktop === null) {
        cancelAnimationFrame(desktopFrame); desktopFrame = desktopLast = 0;
        desktopProgress = 1;
      }
      renderDesktop();
    }
    if (isReturnState()) returnScene.setReducedMotion(reduced.matches);
  });
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame); frame = 0;
    cancelAnimationFrame(desktopFrame); desktopFrame = 0;
    if (state === "overhead") { boxScene.setActive(!document.hidden); return; }
    if (isReturnState()) { returnScene.setActive(!document.hidden); return; }
    if (isDesktopState()) {
      if (!document.hidden) {
        renderDesktop();
        startDesktopTransition();
      }
      return;
    }
    if (ready && !document.hidden) { last = 0; frame = requestAnimationFrame(draw); }
  });
  new ResizeObserver(resize).observe(stage);

  try {
    if (!ctx) throw new Error("Canvas 2D를 사용할 수 없습니다.");
    const response = await fetch(new URL("manifest.json", assetBase), { cache: "no-store" });
    if (!response.ok) throw new Error("방 파츠 목록을 불러오지 못했습니다.");
    const manifest = await response.json();
    if (manifest.canvas?.width !== ROOM_WIDTH || manifest.canvas?.height !== ROOM_HEIGHT) throw new Error("방 파츠의 기준 캔버스가 다릅니다.");
    const ids = ["background", "left", "files", "door"];
    const configs = ids.map((id) => manifest.layers.find((layer) => layer.id === id));
    if (configs.some((layer) => !layer)) throw new Error("방 파츠가 빠져 있습니다.");
    const results = await Promise.all([
      Promise.all(configs.map(async (layer) => ({ ...layer, image: await loadImage(layer.file) }))),
      loadImage(BOX_CONFIG.file), document.fonts.load("600 100px Room"),
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("클로즈업의 바닥을 불러오지 못했습니다."));
        image.src = new URL("../../assets/landing/box/box-opening-v1/floor.png", import.meta.url).href;
      }),
      boxPrepared,
    ]);
    layers = results[0]; boxImage = results[1];
    floorImage = results[3];
    if (!results[4].ok) throw results[4].error;
    if (layers.some((layer) => layer.image.naturalWidth !== ROOM_WIDTH || layer.image.naturalHeight !== ROOM_HEIGHT)) throw new Error("방 파츠의 출력 크기가 다릅니다.");
    if (BOX_SOURCE_RECT.x + BOX_SOURCE_RECT.w > boxImage.naturalWidth || BOX_SOURCE_RECT.y + BOX_SOURCE_RECT.h > boxImage.naturalHeight) throw new Error("상자의 내용 경계가 잘못됐습니다.");
    boxHeight = BOX_CONFIG.height;
    ready = true; status.hidden = true; resize();
    if (!document.hidden) frame = requestAnimationFrame(draw);
  } catch (error) {
    status.hidden = false; status.textContent = "방의 파츠와 상자를 불러오지 못했어요.";
    canvas.dataset.ready = "error"; canvas.dataset.error = error.message;
    console.error("Cozium room:", error);
  }
}
