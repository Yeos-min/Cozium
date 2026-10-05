import { createDesktopPhysics, MAGNET_RADIUS, MAGNET_LIMIT } from "./desktop-physics.js";

const HOLD_MS = 280;
const BOX_FADE_SECONDS = .24;
const BOX_CLOSE_SECONDS = .25;
const PACK_SECONDS = .38;
export const COLLECTION_BOX_DESIGN = {
  size: [1459, 866], sourceRect: [43, 101, 1459, 866],
  opening: [500, 235, 490, 100],
  interior: [[171, 325], [453, 137], [1272, 223], [1105, 452]],
  frontClip: [[171, 325], [1105, 452], [1097, 861], [137, 686], [140, 538], [41, 519]],
};
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const inside = (point, rect) => point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;

export function getCollectionBoxPose(scale = 1, geometry = COLLECTION_BOX_DESIGN) {
  const [width, height] = geometry.size;
  const boxHeight = 280 * height / width;
  const base = { x: 1280, y: 820 - boxHeight, width: 280, height: boxHeight };
  const value = Number.isFinite(Number(scale)) ? clamp(Number(scale), 1, 1.12) : 1;
  const rect = { x: base.x + base.width * (1 - value) / 2, y: base.y + base.height * (1 - value) / 2, width: base.width * value, height: base.height * value };
  const [x, y, w, h] = geometry.opening;
  const mouth = { x: rect.x + x * rect.width / width, y: rect.y + y * rect.height / height, width: w * rect.width / width, height: h * rect.height / height };
  const dropRect = { x: mouth.x - 36, y: mouth.y - 36, width: mouth.width + 72, height: mouth.height + 72 };
  return { rect, mouth, dropRect, scale: value };
}

export function getDesktopPoint(clientX, clientY, bounds, rect) {
  if (!(rect?.scale > 0)) return null;
  const local = { x: clientX - bounds.left, y: clientY - bounds.top };
  const point = { x: (local.x - rect.x) / rect.scale, y: (local.y - rect.y) / rect.scale };
  if (bounds.width > 0 && bounds.height > 0) return inside(local, { x: 0, y: 0, width: bounds.width, height: bounds.height }) ? point : null;
  return inside(point, { x: 0, y: 0, width: 1672, height: 941 }) ? point : null;
}

export function mountDesktopInteraction(root, { items, boxUrl, boxClosedUrl, boxGeometry = COLLECTION_BOX_DESIGN, requestRender, onCollectionBoxSelected }) {
  const canvas = root.querySelector("canvas");
  const liveStatus = root.querySelector(".sr-only");
  const images = new Map(items.map((asset) => [asset.id, asset.image]));
  const [boxWidth, boxHeight] = boxGeometry.size;
  const sourceRect = boxGeometry.sourceRect || [0, 0, boxWidth, boxHeight];
  const closedSourceRect = boxGeometry.closedSourceRect || sourceRect;
  const interior = boxGeometry.interior;
  const frontClip = boxGeometry.frontClip;
  const model = createDesktopPhysics(items.map((asset) => ({ id: asset.id, x: asset.offset[0], y: asset.offset[1], width: 68, height: 68 })), { floor: 820, magnetRadius: MAGNET_RADIUS, maxCluster: MAGNET_LIMIT });
  const boxImage = new Image();
  boxImage.src = boxUrl;
  const boxClosedImage = new Image();
  boxClosedImage.src = boxClosedUrl || boxUrl;
  let closedMask = null, assetsReady = false, requestedActive = false;
  const ready = Promise.all([boxImage.decode(), boxClosedImage.decode()]).then(() => {
    const mask = document.createElement?.("canvas");
    const maskCtx = mask?.getContext("2d");
    if (maskCtx?.getImageData) {
      mask.width = 256; mask.height = Math.max(1, Math.round(256 * boxHeight / boxWidth));
      maskCtx.drawImage(boxClosedImage, ...closedSourceRect, 0, 0, mask.width, mask.height);
      closedMask = { width: mask.width, height: mask.height, data: maskCtx.getImageData(0, 0, mask.width, mask.height).data };
    }
    root.dataset.collectionBoxReady = "true";
    assetsReady = true;
    if (requestedActive && rect) configure(rect, true, reducedMotion);
  }).catch((error) => {
    root.dataset.collectionBoxReady = "error";
    throw error;
  });
  let rect = null, active = false, reducedMotion = false, frame = 0, last = 0;
  let pointer = null, holdTimer = 0, boxVisible = false, reveal = 0, packing = [];
  let hoverId = null, focusedId = null, keyboardGrab = false, keyboardPoint = null, lastPhase = "";
  let boxScale = 1, boxState = "open", closeProgress = 0;

  function boxPose() { return getCollectionBoxPose(boxScale, boxGeometry); }
  function grabPoint() { return pointer?.grabbed ? pointer.point : keyboardGrab ? keyboardPoint : null; }
  function targetBoxScale() {
    const point = grabPoint();
    if (!point || boxState !== "open") return 1;
    const mouth = getCollectionBoxPose(1, boxGeometry).mouth;
    return inside(point, { x: mouth.x - 100, y: mouth.y - 100, width: mouth.width + 200, height: mouth.height + 200 }) ? 1.12 : 1;
  }
  function updateBoxScale(elapsed) {
    const target = targetBoxScale();
    boxScale = reducedMotion ? target : boxScale + (target - boxScale) * (1 - Math.exp(-elapsed / .08));
    if (Math.abs(boxScale - target) < .0001) boxScale = target;
  }
  function updateClosing(elapsed) {
    if (model.snapshot().phase !== "complete" || boxState === "closed" || boxState === "selected") return;
    if (packing.length) return;
    if (boxState === "open") { boxState = reducedMotion ? "closed" : "closing"; closeProgress = reducedMotion ? 1 : 0; if (reducedMotion) boxScale = 1; return; }
    closeProgress = reducedMotion ? 1 : Math.min(1, closeProgress + elapsed / BOX_CLOSE_SECONDS);
    if (closeProgress === 1) { boxState = "closed"; boxScale = 1; }
  }
  function getCollectionBoxState() {
    const pose = boxPose(), displayRect = rect ? { x: rect.x + pose.rect.x * rect.scale, y: rect.y + pose.rect.y * rect.scale, width: pose.rect.width * rect.scale, height: pose.rect.height * rect.scale } : null;
    return {
      ...pose, displayRect, desktopRect: rect ? { ...rect } : null,
      state: boxState, closed: closeProgress === 1, closeProgress, reveal, visible: boxVisible, ready: assetsReady,
      image: closeProgress === 1 ? boxClosedImage : boxImage,
      sourceRect: (closeProgress === 1 ? closedSourceRect : sourceRect).slice(),
      assets: { open: boxImage, closed: boxClosedImage },
    };
  }
  function hitBox(point) {
    const box = boxPose().rect;
    if (!point || !inside(point, box)) return false;
    if (!closedMask) return true;
    const x = Math.min(closedMask.width - 1, Math.floor((point.x - box.x) / box.width * closedMask.width));
    const y = Math.min(closedMask.height - 1, Math.floor((point.y - box.y) / box.height * closedMask.height));
    return closedMask.data[(y * closedMask.width + x) * 4 + 3] >= 128;
  }
  function selectBox() {
    if (!active || document.hidden || boxState !== "closed") return;
    boxState = "selected"; paint();
    onCollectionBoxSelected?.(getCollectionBoxState());
  }

  function record() {
    const snapshot = model.snapshot();
    const pose = boxPose();
    const gamePhase = snapshot.phase === "grid" ? "grid" : snapshot.phase === "complete" ? "complete" : boxVisible ? "collect" : snapshot.phase === "falling" ? "falling" : "scattered";
    Object.assign(root.dataset, {
      gamePhase, boxVisible: String(boxVisible), boxReveal: reveal.toFixed(3), packed: String(snapshot.boxCount),
      remaining: String(snapshot.items.filter((item) => !item.deposited).length), dragging: String(snapshot.phase === "held"),
      magnetRadius: String(MAGNET_RADIUS), magnetLimit: String(MAGNET_LIMIT),
      initialFallComplete: String(snapshot.initialFallComplete), landedCount: String(snapshot.landedCount), physicsPhase: snapshot.phase,
      grabbedIds: JSON.stringify(snapshot.grabbedIds), boxRect: JSON.stringify(pose.rect), dropRect: JSON.stringify(pose.dropRect),
      mouthRect: JSON.stringify(pose.mouth), boxScale: boxScale.toFixed(4), boxState, boxCloseProgress: closeProgress.toFixed(4),
      gameItems: JSON.stringify(snapshot.items.map(({ id, x, y, rotation, held, deposited }) => ({ id, x: +x.toFixed(1), y: +y.toFixed(1), rotation: +rotation.toFixed(3), held, deposited }))),
    });
    const announcementPhase = `${gamePhase}:${boxState}`;
    if (announcementPhase !== lastPhase) {
      lastPhase = announcementPhase;
      const labels = {
        grid: "파일이 놓인 바탕화면. 선택하면 파일이 바닥으로 떨어집니다.",
        falling: "파일이 바닥으로 떨어지고 있습니다.",
        scattered: "파일이 바닥에 도착하면 Cozium 상자가 나타납니다.",
        collect: "파일을 길게 잡아 주변 파일과 함께 Cozium 상자에 담을 수 있습니다. 키보드 방향키로 파일을 고르고, 스페이스로 잡거나 놓을 수 있습니다.",
        complete: closeProgress === 1 ? "파일을 모두 담은 상자. 선택하면 정리된 방으로 돌아갑니다." : "파일 80개가 모두 담겼습니다. 상자를 닫고 있어요.",
      };
      canvas.setAttribute("aria-label", labels[gamePhase]);
      if (liveStatus) liveStatus.textContent = labels[gamePhase];
    }
    return snapshot;
  }

  function paint() { record(); requestRender(); }
  function wake() {
    if (active && !document.hidden && !frame) { last = 0; frame = requestAnimationFrame(tick); }
  }
  function tick(time) {
    frame = 0;
    if (!active || document.hidden) return;
    const visibleElapsed = last ? Math.max(0, (time - last) / 1000) : 0;
    const dt = Math.min(.1, visibleElapsed);
    last = time;
    model.step(dt);
    if (boxVisible) reveal = reducedMotion ? 1 : Math.min(1, reveal + visibleElapsed / BOX_FADE_SECONDS);
    revealBoxIfLanded();
    packing.forEach((entry) => { entry.age += visibleElapsed; });
    packing = packing.filter((entry) => entry.age < PACK_SECONDS);
    updateBoxScale(visibleElapsed);
    updateClosing(visibleElapsed);
    paint();
    const snapshot = model.snapshot();
    if (snapshot.moving || snapshot.phase === "held" || (boxVisible && reveal < 1) || packing.length || boxState === "closing" || boxScale !== targetBoxScale()) frame = requestAnimationFrame(tick);
  }
  function local(event) { return getDesktopPoint(event.clientX, event.clientY, root.getBoundingClientRect(), rect); }
  function hit(point) {
    if (!point) return null;
    const bodies = model.snapshot().items;
    for (let index = bodies.length - 1; index >= 0; index--) {
      const item = bodies[index];
      if (item.deposited || item.held) continue;
      const dx = point.x - item.x - item.width / 2, dy = point.y - item.y - item.height / 2;
      const x = dx * Math.cos(item.rotation) + dy * Math.sin(item.rotation);
      const y = -dx * Math.sin(item.rotation) + dy * Math.cos(item.rotation);
      if (Math.abs(x) < 29 && Math.abs(y) < 29) return item.id;
    }
    return null;
  }
  function advance() {
    const phase = model.snapshot().phase;
    if (phase === "grid") {
      model.fall();
      if (reducedMotion) for (let i = 0; i < 720 && model.snapshot().moving; i++) model.step(1 / 60);
      revealBoxIfLanded();
      paint(); wake();
    }
  }
  function revealBoxIfLanded() {
    if (active && !boxVisible && model.snapshot().initialFallComplete) {
      boxVisible = true;
      reveal = reducedMotion ? 1 : 0;
    }
  }
  function clearHold() { clearTimeout(holdTimer); holdTimer = 0; }
  function grab() {
    clearHold();
    if (!pointer?.id || !active || !boxVisible || document.hidden) return;
    if (model.beginGrab(pointer.id, pointer.start)) {
      model.moveGrab(pointer.point);
      pointer.grabbed = true;
      focusedId = pointer.id;
      paint(); wake();
    }
  }
  function finishGrab(deposit = true) {
    const snapshot = model.snapshot();
    if (deposit) {
      const ids = model.releaseGrab(boxPose().dropRect);
      if (ids.length) {
        if (!reducedMotion) packing.push(...snapshot.items.filter((item) => ids.includes(item.id)).map((item) => ({ ...item, age: 0 })));
        if (liveStatus) liveStatus.textContent = `${ids.length}개를 담았어요. ${80 - model.snapshot().boxCount}개가 남았어요.`;
      }
    } else model.cancelGrab();
    keyboardPoint = null;
    updateClosing(0);
    paint(); wake();
  }
  function cancelPointer() {
    clearHold();
    if (pointer?.grabbed || keyboardGrab) model.cancelGrab();
    const captured = pointer?.pointerId;
    pointer = null; keyboardGrab = false; keyboardPoint = null;
    if (captured !== undefined && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!active || !event.isPrimary || event.button !== 0 || pointer) return;
    const point = local(event);
    if (!point) return;
    event.preventDefault();
    if (keyboardGrab) { finishGrab(false); keyboardGrab = false; }
    pointer = { pointerId: event.pointerId, start: point, point, id: boxVisible ? hit(point) : null, grabbed: false, select: boxState === "closed" && hitBox(point) };
    canvas.setPointerCapture(event.pointerId);
    if (pointer.id) holdTimer = setTimeout(grab, HOLD_MS);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!active) return;
    const point = local(event);
    if (!pointer) {
      const next = boxVisible ? hit(point) : null;
      if (hoverId !== next) { hoverId = next; paint(); }
      return;
    }
    if (pointer.pointerId !== event.pointerId || !point) return;
    pointer.point = point;
    if (pointer.id && !pointer.grabbed && Math.hypot(point.x - pointer.start.x, point.y - pointer.start.y) > 8) grab();
    if (pointer.grabbed) { model.moveGrab(point); wake(); }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    const current = pointer, point = local(event);
    clearHold();
    if (current.grabbed) {
      // Releases outside the monitor remain outside the drop target.
      model.moveGrab(point || { x: -1000, y: -1000 });
      finishGrab(Boolean(point));
    } else if (point && Math.hypot(point.x - current.start.x, point.y - current.start.y) < 10) {
      if (current.select && hitBox(point)) selectBox();
      else advance();
    }
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointercancel", () => { cancelPointer(); paint(); wake(); });
  canvas.addEventListener("lostpointercapture", () => { if (pointer) { cancelPointer(); paint(); wake(); } });
  canvas.addEventListener("pointerleave", () => { if (!pointer && hoverId) { hoverId = null; paint(); } });
  canvas.addEventListener("keydown", (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (event.repeat) return;
      if (boxState === "closed") { selectBox(); return; }
      if (boxState !== "open") return;
      if (!boxVisible) { advance(); return; }
      if (keyboardGrab) { finishGrab(); keyboardGrab = false; return; }
      const item = model.snapshot().items.find((item) => item.id === focusedId && !item.deposited) || model.snapshot().items.find((item) => !item.deposited);
      if (item) { focusedId = item.id; keyboardPoint = { x: item.x + 34, y: item.y + 34 }; keyboardGrab = model.beginGrab(item.id, keyboardPoint); paint(); wake(); }
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && boxVisible) {
      event.preventDefault();
      const snapshot = model.snapshot();
      const available = snapshot.items.filter((item) => !item.deposited);
      if (!available.length) return;
      if (keyboardGrab) {
        if (keyboardPoint) {
          const distance = event.shiftKey ? 72 : 30;
          keyboardPoint.x = clamp(keyboardPoint.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0), 0, 1672);
          keyboardPoint.y = clamp(keyboardPoint.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0), 0, 941);
          model.moveGrab(keyboardPoint);
          wake();
        }
      } else {
        const index = Math.max(0, available.findIndex((item) => item.id === focusedId));
        focusedId = available[(index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + available.length) % available.length].id;
        paint();
      }
    } else if (event.key === "Escape") { event.preventDefault(); cancelPointer(); paint(); wake(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = last = 0; cancelPointer(); }
    else { paint(); wake(); }
  });

  function drawItem(ctx, item, opacity = 1) {
    ctx.save(); ctx.globalAlpha *= opacity;
    ctx.translate(item.x + 34, item.y + 34); ctx.rotate(item.rotation); ctx.scale(item.scale, item.scale);
    if (item.held || item.id === hoverId || item.id === focusedId) {
      ctx.strokeStyle = item.held ? "#76978280" : "#76978245"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-31, -31, 62, 62, 12); ctx.stroke();
    }
    ctx.drawImage(images.get(item.id), -34, -34, 68, 68); ctx.restore();
  }
  function draw(ctx) {
    const snapshot = model.snapshot();
    const { rect: box, mouth } = boxPose();
    const openOpacity = reveal * (1 - closeProgress);
    snapshot.items.filter((item) => !item.deposited && !item.held).forEach((item) => drawItem(ctx, item));
    if (boxVisible) {
      ctx.save(); ctx.globalAlpha *= openOpacity;
      if (snapshot.phase === "held") {
        ctx.fillStyle = "#86a38d20"; ctx.beginPath(); ctx.ellipse(mouth.x + mouth.width / 2, mouth.y + mouth.height / 2, mouth.width * .85, mouth.height * 1.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.drawImage(boxImage, ...sourceRect, box.x, box.y, box.width, box.height); ctx.restore();
      if (snapshot.boxCount) {
        const packed = snapshot.items.filter((item) => item.deposited).slice(-4);
        ctx.save(); ctx.globalAlpha *= openOpacity;
        ctx.translate(box.x, box.y); ctx.scale(box.width / boxWidth, box.height / boxHeight);
        ctx.beginPath(); interior.forEach(([x,y],index) => index ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.clip();
        const interiorX = interior.reduce((sum,point) => sum + point[0],0) / interior.length;
        const interiorY = interior.reduce((sum,point) => sum + point[1],0) / interior.length;
        const cardScale = boxWidth / 280;
        packed.forEach((item,index) => {
          ctx.save(); ctx.translate(interiorX + (-18 + index * 12) * cardScale,interiorY + (5 - index * 2) * cardScale); ctx.rotate(-.1 + index * .08);
          ctx.drawImage(images.get(item.id),-12 * cardScale,-18 * cardScale,24 * cardScale,24 * cardScale); ctx.restore();
        });
        ctx.restore();
      }
    }
    snapshot.grabbedIds.slice().reverse().forEach((id) => {
      const item = snapshot.items.find((body) => body.id === id);
      if (item && !item.deposited) drawItem(ctx, item);
    });
    packing.forEach((entry) => {
      const t = clamp(entry.age / PACK_SECONDS), eased = 1 - (1 - t) ** 3;
      drawItem(ctx, { ...entry, x: entry.x + (mouth.x + mouth.width / 2 - 34 - entry.x) * eased, y: entry.y + (mouth.y + mouth.height / 2 - 34 - entry.y) * eased, scale: (1 - t) * entry.scale, held: false }, (1 - t * t) * openOpacity);
    });
    if (boxVisible && packing.length) {
      ctx.save(); ctx.globalAlpha *= openOpacity;
      ctx.translate(box.x, box.y); ctx.scale(box.width / boxWidth, box.height / boxHeight);
      ctx.beginPath(); frontClip.forEach(([x,y],index) => index ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.clip();
      ctx.drawImage(boxImage, ...sourceRect, 0, 0, boxWidth, boxHeight); ctx.restore();
    }
    if (boxVisible && closeProgress > 0) {
      ctx.save(); ctx.globalAlpha *= reveal * closeProgress;
      ctx.drawImage(boxClosedImage, ...closedSourceRect, box.x, box.y, box.width, box.height); ctx.restore();
    }
  }
  function configure(nextRect, nextActive, reduce) {
    requestedActive = Boolean(nextActive);
    const skipMotion = reduce && !reducedMotion;
    rect = nextRect; reducedMotion = reduce;
    if (skipMotion) {
      if (model.snapshot().phase === "falling") for (let i = 0; i < 24 && model.snapshot().moving; i++) model.step(.25);
      revealBoxIfLanded();
      if (boxVisible) reveal = 1;
      packing = []; updateBoxScale(0); updateClosing(0); updateClosing(BOX_CLOSE_SECONDS); record();
    }
    const nextEnabled = requestedActive && assetsReady;
    const changed = active !== nextEnabled;
    active = nextEnabled; canvas.tabIndex = active ? 0 : -1;
    if (changed) {
      if (active) { record(); wake(); }
      else { cancelAnimationFrame(frame); frame = last = 0; cancelPointer(); }
    }
  }
  function reset() {
    requestedActive = active = false; cancelAnimationFrame(frame); frame = last = 0;
    cancelPointer(); model.reset(); boxVisible = false; reveal = 0; packing = [];
    boxScale = 1; boxState = "open"; closeProgress = 0;
    hoverId = focusedId = null; lastPhase = ""; record(); canvas.tabIndex = -1;
  }
  record();
  return { ready, configure, draw, reset, getCollectionBoxState };
}
