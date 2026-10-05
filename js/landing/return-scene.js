import { getOverheadMatrix } from "./tape-renderer.js";

export const RETURN_FOCUS_MS = 875;
export const FILLED_HOLD_MS = 375;
export const RETURN_ROOM_MS = 1125;
export const RETURN_DURATION = RETURN_FOCUS_MS + FILLED_HOLD_MS + RETURN_ROOM_MS;
export const REDUCED_FILLED_HOLD_MS = 375;
export const REDUCED_RETURN_MS = 312.5;
const FRAME = { width: 1672, height: 941 };
const BOX_CENTER = { x: 835.5, y: 446 };
const ROOM_BOX_CENTER = { x: 852, y: 630 };
const PORTAL = [[364, 199], [1307, 199], [1316, 693], [355, 693]];
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const dimension = (value) => Math.max(1, finite(value, 1));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (n, start = 0, end = 1) => { const t = clamp((n - start) / (end - start)); return t * t * (3 - 2 * t); };

function roomMatrix(width, height) {
  const zoom = 1.02, scale = Math.max(width / FRAME.width, height / FRAME.height) * zoom;
  const iw = FRAME.width * scale, ih = FRAME.height * scale;
  return { ix: (width - iw) / 2, iy: (height - ih) / 2, iw, ih, scale, marginX: Math.max(0, (iw - width) / 2), marginY: Math.max(0, (ih - height) / 2), panX: 0, panY: 0, zoom };
}

function collectionRect(width, height, rect) {
  const scale = Math.min(width / FRAME.width, height / FRAME.height);
  const fallback = { x: (width - FRAME.width * scale) / 2 + 1280 * scale, y: (height - FRAME.height * scale) / 2 + 608 * scale, width: 280 * scale, height: 210 * scale };
  return { x: finite(rect?.x, fallback.x), y: finite(rect?.y, fallback.y), width: Math.max(.01, finite(rect?.width, fallback.width)), height: Math.max(.01, finite(rect?.height, fallback.height)) };
}

function rectQuad(rect, camera) {
  return [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]].map(([x, y]) => [camera.x + x * camera.scale, camera.y + y * camera.scale]);
}

// Geometry stays independent of the landing orchestrator. Both ending shots use
// the original world coordinates and the neutral initial room camera.
export function getReturnPose(width, height, elapsed, reducedMotion = false, boxRect = null) {
  const w = dimension(width), h = dimension(height);
  const reduced = Boolean(reducedMotion);
  const duration = reduced ? REDUCED_FILLED_HOLD_MS + REDUCED_RETURN_MS : RETURN_DURATION;
  const time = clamp(Math.max(0, Number(elapsed) || 0), 0, duration);
  const overhead = getOverheadMatrix(w, h), room = roomMatrix(w, h);
  const box = collectionRect(w, h, boxRect);
  const boxCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const overheadCenter = { x: overhead.x + BOX_CENTER.x * overhead.scale, y: overhead.y + BOX_CENTER.y * overhead.scale };
  const roomCenter = { x: room.ix + ROOM_BOX_CENTER.x * room.scale, y: room.iy + ROOM_BOX_CENTER.y * room.scale };
  const focusProgress = reduced ? 1 : clamp(time / RETURN_FOCUS_MS);
  const focusTravel = smooth(focusProgress, 0, .9);
  const targetZoom = clamp(Math.min(961 * overhead.scale / box.width, 494 * overhead.scale / box.height), 1, 4.5);
  const sourceScale = reduced ? 1 : mix(1, targetZoom, focusTravel);
  const sourceCamera = {
    scale: sourceScale,
    x: mix(boxCenter.x, overheadCenter.x, focusTravel) - boxCenter.x * sourceScale,
    y: mix(boxCenter.y, overheadCenter.y, focusTravel) - boxCenter.y * sourceScale,
  };
  const roomStart = reduced ? REDUCED_FILLED_HOLD_MS : RETURN_FOCUS_MS + FILLED_HOLD_MS;
  const roomProgress = clamp((time - roomStart) / (reduced ? REDUCED_RETURN_MS : RETURN_ROOM_MS));
  const roomTravel = reduced ? 1 : smooth(roomProgress);
  const anchor = { x: mix(overheadCenter.x, roomCenter.x, roomTravel), y: mix(overheadCenter.y, roomCenter.y, roomTravel) };
  const filledScale = reduced ? overhead.scale : mix(overhead.scale, room.scale * .32, roomTravel);
  const filledCamera = roomProgress === 0 || reduced ? { ...overhead } : { scale: filledScale, x: anchor.x - BOX_CENTER.x * filledScale, y: anchor.y - BOX_CENTER.y * filledScale };
  const roomScale = reduced ? room.scale : mix(room.scale * 2.8, room.scale, roomTravel);
  const roomCamera = roomProgress === 1 || reduced ? { scale: room.scale, x: room.ix, y: room.iy } : { scale: roomScale, x: anchor.x - ROOM_BOX_CENTER.x * roomScale, y: anchor.y - ROOM_BOX_CENTER.y * roomScale };
  const entryOpacity = reduced ? 1 : smooth(focusProgress, .3, 1);
  const roomOpacity = reduced ? smooth(roomProgress) : smooth(roomProgress, 0, .88);
  const phase = time === duration ? "tidy-room" : time < roomStart ? reduced || time >= RETURN_FOCUS_MS ? "filled-box" : "return-to-box" : "return-to-room";
  return {
    width: w, height: h, elapsed: time, duration, progress: time / duration, reducedMotion: reduced,
    phase, done: time === duration, focusProgress, roomProgress,
    sourceCamera, focusQuad: rectQuad(box, sourceCamera), boxRect: box,
    overhead, filledCamera, roomCamera, roomMatrix: room,
    portalQuad: PORTAL.map(([x, y]) => [filledCamera.x + x * filledCamera.scale, filledCamera.y + y * filledCamera.scale]),
    desktopOpacity: reduced ? 0 : 1 - entryOpacity,
    filledOpacity: entryOpacity * (1 - roomOpacity), roomOpacity,
  };
}

export function mountReturnScene(root, { getDesktopPlate, getCollectionBoxRect, onPhase, onComplete } = {}) {
  const canvas = root.querySelector("canvas"), status = root.querySelector(".status"), liveStatus = root.querySelector(".sr-only");
  const ctx = canvas?.getContext("2d");
  let images = null, source = null, sourceView = null, sourceBox = null;
  let active = true, started = false, elapsed = 0, last = 0, frame = 0, generation = 0, completed = false, reducedMotion = false, lastPhase = "";
  const record = (data) => { Object.assign(root.dataset, data); if (canvas) Object.assign(canvas.dataset, data); };
  function message(value, error = false) {
    if (status) { status.hidden = false; status.textContent = value; status.dataset.state = error ? "error" : "loading"; }
    if (liveStatus) liveStatus.textContent = value;
  }
  record({ ready: "false", expected: "2", loaded: "0", playback: "idle", phase: "idle", elapsed: "0" });
  message("제자리를 찾은 방을 준비하고 있어요.");
  const ready = (async () => {
    try {
      if (!ctx) throw new Error("Canvas 2D is unavailable for the return scene.");
      let loaded = 0;
      const results = await Promise.allSettled(["box-overhead-filled-v1.png", "room-tidy-v1.png"].map(async (file) => {
        const image = new Image();
        image.src = new URL(`../../assets/landing/box/${file}`, import.meta.url).href;
        await image.decode();
        const aspect = image.naturalWidth / image.naturalHeight;
        if (!(image.naturalWidth > 0 && image.naturalHeight > 0) || Math.abs(aspect / (FRAME.width / FRAME.height) - 1) > .02) throw new Error(`${file}: a 1672 × 941 composition is required.`);
        record({ loaded: String(++loaded) });
        return image;
      }));
      const errors = results.filter((result) => result.status === "rejected");
      if (errors.length) throw new Error(errors.map((result) => result.reason?.message || result.reason).join("; "));
      images = { filled: results[0].value, room: results[1].value };
      record({ ready: "true", loaded: "2" });
      if (status) status.hidden = true;
      return images;
    } catch (error) {
      record({ ready: "error", playback: "error", error: String(error?.message || error) });
      message("마무리 장면을 불러오지 못했어요. 페이지를 새로고침해 주세요.", true);
      throw error;
    }
  })();
  ready.catch(() => {});

  function bounds() {
    const rect = root.getBoundingClientRect();
    return { width: dimension(rect.width || sourceView?.width), height: dimension(rect.height || sourceView?.height) };
  }
  function stopFrame() { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; }
  function wake() { if (active && started && !completed && !document.hidden && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
  function drawWorld(image, camera) {
    ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.scale, camera.scale);
    ctx.drawImage(image, 0, 0, FRAME.width, FRAME.height); ctx.restore();
  }
  function render() {
    if (!started || !images || !source || !ctx) return null;
    const view = bounds(), sx = view.width / sourceView.width, sy = view.height / sourceView.height;
    const box = { x: sourceBox.x * sx, y: sourceBox.y * sy, width: sourceBox.width * sx, height: sourceBox.height * sy };
    const pose = getReturnPose(view.width, view.height, elapsed, reducedMotion, box);
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 2);
    const pw = Math.max(1, Math.round(view.width * dpr)), ph = Math.max(1, Math.round(view.height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = "#eae3ce"; ctx.fillRect(0, 0, view.width, view.height);
    if (pose.roomProgress > 0) drawWorld(images.room, pose.roomCamera);
    if (pose.desktopOpacity > 0) {
      ctx.save(); ctx.translate(pose.sourceCamera.x, pose.sourceCamera.y); ctx.scale(pose.sourceCamera.scale, pose.sourceCamera.scale);
      ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, view.width, view.height); ctx.restore();
    }
    if (pose.filledOpacity > 0) {
      ctx.save(); ctx.globalAlpha = pose.filledOpacity; drawWorld(images.filled, pose.filledCamera); ctx.restore();
    }
    record({ phase: pose.phase, elapsed: pose.elapsed.toFixed(1), progress: pose.progress.toFixed(4), filledOpacity: pose.filledOpacity.toFixed(4), roomOpacity: pose.roomOpacity.toFixed(4), sourceCamera: JSON.stringify(pose.sourceCamera), filledCamera: JSON.stringify(pose.filledCamera), roomCamera: JSON.stringify(pose.roomCamera), boxRect: JSON.stringify(pose.boxRect), focusQuad: JSON.stringify(pose.focusQuad), reducedMotion: String(reducedMotion) });
    if (pose.phase !== lastPhase) {
      lastPhase = pose.phase;
      if (liveStatus) liveStatus.textContent = pose.phase === "filled-box" ? "파일들이 Cozium 상자 안에 담겼어요." : pose.phase === "tidy-room" ? "흩어진 것들이 제자리를 찾은 방이에요." : "상자와 방으로 돌아가고 있어요.";
      onPhase?.(pose.phase, pose);
    }
    return pose;
  }
  function tick(time) {
    frame = 0;
    if (!active || !started || document.hidden) return;
    const token = generation;
    const dt = last ? Math.max(0, time - last) : 0;
    last = time; elapsed += dt;
    const pose = render();
    if (token !== generation || !started) return;
    if (pose?.done) {
      completed = true; record({ playback: "complete" });
      onComplete?.(pose);
    } else if (active && started && !frame) frame = requestAnimationFrame(tick);
  }
  async function start({ reducedMotion: reduce = false } = {}) {
    const token = ++generation;
    stopFrame(); started = false; completed = false; elapsed = 0; lastPhase = ""; reducedMotion = Boolean(reduce); active = true;
    try {
      if (typeof getDesktopPlate !== "function") throw new Error("getDesktopPlate must be a function.");
      const plate = getDesktopPlate();
      if (!(plate?.width > 0 && plate?.height > 0)) throw new Error("The completed desktop plate is unavailable.");
      const view = bounds();
      const frozen = document.createElement("canvas"); frozen.width = plate.width; frozen.height = plate.height;
      const frozenCtx = frozen.getContext("2d");
      if (!frozenCtx) throw new Error("Canvas 2D is unavailable for the desktop snapshot.");
      frozenCtx.drawImage(plate, 0, 0);
      source = frozen; sourceView = view; sourceBox = collectionRect(view.width, view.height, getCollectionBoxRect?.());
      record({ playback: "preparing", elapsed: "0" });
      await ready;
      if (token !== generation) return false;
      started = true; record({ playback: "automatic" });
      if (status) status.hidden = true;
      render();
      if (token !== generation || !started) return false;
      wake();
      return true;
    } catch (error) {
      if (token !== generation) return false;
      active = false; started = false; record({ playback: "error", error: String(error?.message || error) });
      message("마무리 장면을 준비하지 못했어요. 페이지를 새로고침해 주세요.", true);
      return false;
    }
  }
  function reset() {
    generation++; stopFrame(); started = false; completed = false; elapsed = 0; lastPhase = ""; source = null; sourceView = null; sourceBox = null;
    record({ playback: "idle", phase: "idle", elapsed: "0", progress: "0.0000" });
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  function setActive(value) { active = Boolean(value); if (!active) stopFrame(); else wake(); }
  function setReducedMotion(value) {
    const next = Boolean(value);
    if (next === reducedMotion) return started ? render() : null;
    const current = getReturnPose(1, 1, elapsed, reducedMotion);
    if (started) {
      if (current.phase === "tidy-room") elapsed = next ? REDUCED_FILLED_HOLD_MS + REDUCED_RETURN_MS : RETURN_DURATION;
      else if (current.phase === "return-to-room") elapsed = next ? REDUCED_FILLED_HOLD_MS + current.roomProgress * REDUCED_RETURN_MS : RETURN_FOCUS_MS + FILLED_HOLD_MS + current.roomProgress * RETURN_ROOM_MS;
      else if (current.phase === "filled-box") {
        const holdProgress = reducedMotion ? elapsed / REDUCED_FILLED_HOLD_MS : (elapsed - RETURN_FOCUS_MS) / FILLED_HOLD_MS;
        elapsed = next ? holdProgress * REDUCED_FILLED_HOLD_MS : RETURN_FOCUS_MS + holdProgress * FILLED_HOLD_MS;
      } else elapsed = next ? 0 : RETURN_FOCUS_MS;
    }
    reducedMotion = next; last = 0;
    const pose = render();
    wake();
    return pose;
  }
  function visibility() { if (document.hidden) stopFrame(); else wake(); }
  function resize() { if (started) render(); }
  document.addEventListener("visibilitychange", visibility);
  globalThis.addEventListener?.("resize", resize);
  function destroy() { reset(); document.removeEventListener("visibilitychange", visibility); globalThis.removeEventListener?.("resize", resize); }
  return { ready, start, render, reset, setActive, setReducedMotion, destroy };
}
