import { getOverheadMatrix } from "./tape-renderer.js";
import { mapQuad } from "./flap-renderer.js";
import { mountDesktopInteraction, COLLECTION_BOX_DESIGN } from "./desktop-interaction.js";

const FRAME = { width: 1672, height: 941 };
const PORTAL = [[364, 199], [1307, 199], [1316, 693], [355, 693]];
const SOURCE_QUAD = [[0, 0], [FRAME.width, 0], [FRAME.width, FRAME.height], [0, FRAME.height]];
const BEZEL = "#182c24";
const PARTS_BASE = new URL("../../assets/landing/parts/desktop-v2/", import.meta.url);
export const DESKTOP_HOLD = 180 / 1.5;
export const DESKTOP_DURATION = 2000 / 1.5;
const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const mix = (a, b, value) => a + (b - a) * value;
const phase = (value, start, end) => { const t = clamp((value - start) / (end - start)); return t * t * (3 - 2 * t); };
const dimension = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1;

export function getDesktopAutoProgress(elapsed, reducedMotion = false) {
  if (reducedMotion) return 1;
  return clamp((Number(elapsed) - DESKTOP_HOLD) / DESKTOP_DURATION);
}

function rectQuad(rect) {
  return [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
}

export function getDesktopTransition(width, height, progress, reducedMotion = false) {
  const w = dimension(width), h = dimension(height), p = clamp(progress);
  const overhead = getOverheadMatrix(w, h);
  const containScale = Math.min(w / FRAME.width, h / FRAME.height);
  // Fit interactive objects uniformly; the monitor itself fills the viewport.
  const desktopRect = { x: (w - FRAME.width * containScale) / 2, y: h - FRAME.height * containScale, width: FRAME.width * containScale, height: FRAME.height * containScale, scale: containScale };
  const monitorRect = { x: 0, y: 0, width: w, height: h };
  const taskbarRect = { x: 19 * containScale, y: h - 91 * containScale, width: w - 38 * containScale, height: 56 * containScale };
  const finalQuad = rectQuad(monitorRect);
  const center = [835.5, 446];
  const targetZoom = Math.max(1, w / (943 * overhead.scale), h / (494 * overhead.scale)) * 1.02;
  const travel = reducedMotion ? 0 : phase(p, 0, .75);
  const cameraZoom = mix(1, targetZoom, travel);
  const scale = overhead.scale * cameraZoom;
  const centerX = mix(overhead.x + center[0] * overhead.scale, w / 2, travel);
  const centerY = mix(overhead.y + center[1] * overhead.scale, h / 2, travel);
  const camera = p === 0 || reducedMotion ? { ...overhead } : { scale, x: centerX - center[0] * scale, y: centerY - center[1] * scale };
  const portalQuad = PORTAL.map(([x, y]) => [camera.x + x * camera.scale, camera.y + y * camera.scale]);
  const morph = reducedMotion ? Number(p > 0) : phase(p, .66, .95);
  const quad = morph === 1 ? finalQuad : portalQuad.map((point, index) => point.map((value, axis) => mix(value, finalQuad[index][axis], morph)));
  const desktopOpacity = reducedMotion ? Number(p > 0) : phase(p, .58, .83);
  // The open plate remains opaque. Only after the desktop is opaque do its
  // surrounding pixels darken, preventing two fading scenes from exposing white.
  const bezelOpacity = reducedMotion ? Number(p > 0) : phase(p, .86, 1);
  return {
    width: w, height: h, progress: p, reducedMotion: Boolean(reducedMotion),
    overhead, camera, cameraZoom, portalQuad, quad, desktopRect, monitorRect, taskbarRect,
    morph, desktopOpacity, bezelOpacity,
    phase: p === 0 ? "open-box" : reducedMotion || p === 1 ? "desktop" : p < .58 ? "zoom" : "monitor",
    done: p === 1 || Boolean(reducedMotion && p > 0),
  };
}

function validateManifest(manifest) {
  if (manifest?.canvas?.width !== FRAME.width || manifest?.canvas?.height !== FRAME.height) throw new Error("Desktop manifest canvas must be 1672 × 941.");
  if (!Array.isArray(manifest.layers) || manifest.layers.length !== 3 || !Array.isArray(manifest.items) || manifest.items.length !== 80) throw new Error("Desktop manifest must contain 3 layers and 80 items.");
  const ids = new Set();
  for (const asset of [...manifest.layers, ...manifest.items]) {
    if (typeof asset.id !== "string" || !asset.id || ids.has(asset.id)) throw new Error("Desktop asset IDs must be present and unique.");
    if (typeof asset.file !== "string" || !/\.(png|svg)$/i.test(asset.file)) throw new Error(`${asset.id}: PNG or SVG file is required.`);
    if (!Array.isArray(asset.offset) || asset.offset.length !== 2 || !asset.offset.every(Number.isFinite) || !Number.isFinite(asset.z)) throw new Error(`${asset.id}: finite z and source offset are required.`);
    ids.add(asset.id);
  }
  for (const id of ["background", "taskbar", "frame"]) if (!manifest.layers.some((asset) => asset.id === id)) throw new Error(`Desktop layer is missing: ${id}.`);
  return manifest;
}

function outsideQuad(ctx, quad, width, height) {
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.moveTo(...quad[0]);
  quad.slice(1).forEach((point) => ctx.lineTo(...point));
  ctx.closePath();
}

function drawTaskbar(ctx, image, pose) {
  const rect = pose.taskbarRect, scale = pose.desktopRect.scale;
  const dockX = pose.width / 2 - 103 * scale;
  const right = rect.x + rect.width;
  // Stretch only empty glass strips. App and status glyphs keep their proportions.
  const source = [0, 16, 714, 924, 1528, 1612, 1634];
  const target = [rect.x, rect.x + 16 * scale, dockX, dockX + 210 * scale, right - 106 * scale, right - 22 * scale, right];
  for (let i = 0; i < source.length - 1; i++) {
    ctx.drawImage(image, source[i], 0, source[i + 1] - source[i], 56, target[i], rect.y, target[i + 1] - target[i], rect.height);
  }
}

export function mountDesktopScene(root, { getOpenPlate, onCollectionBoxSelected }) {
  const canvas = root.querySelector("canvas");
  const status = root.querySelector(".status");
  const liveStatus = root.querySelector(".sr-only");
  const ctx = canvas?.getContext("2d");
  const warp = document.createElement("canvas");
  const warpCtx = warp.getContext("2d");
  const assets = [];
  let plate = null, composition = [], loaded = 0, failed = 0, interaction = null;
  let lastProgress = 0, lastReducedMotion = false;
  let lastPose = null, interactiveEnabled = true;

  function record(data) {
    Object.assign(root.dataset, data);
    if (canvas) Object.assign(canvas.dataset, data);
  }

  function setStatus(message, error = false) {
    if (status) { status.hidden = false; status.textContent = message; status.dataset.state = error ? "error" : "loading"; }
    if (liveStatus) liveStatus.textContent = message;
  }

  record({ ready: "false", loaded: "0", expected: "83", failed: "0" });
  setStatus("새 화면을 준비하는 중이에요.");

  const ready = (async () => {
    try {
      if (!ctx || !warpCtx) throw new Error("Canvas 2D is unavailable for the desktop scene.");
      if (typeof getOpenPlate !== "function") throw new Error("getOpenPlate must be a function.");
      const response = await fetch(new URL("manifest.json", PARTS_BASE), { cache: "no-store" });
      if (!response.ok) throw new Error(`Desktop manifest request failed (${response.status}).`);
      const manifest = validateManifest(await response.json());
      const decoded = new Map();
      function loadImage(file) {
        if (!decoded.has(file)) decoded.set(file, (async () => {
          const image = new Image();
          image.src = new URL(file, PARTS_BASE).href;
          await image.decode();
          return image;
        })());
        return decoded.get(file);
      }
      assets.push(...[...manifest.layers.map((asset) => ({ ...asset, type: "layer" })), ...manifest.items.map((asset) => ({ ...asset, type: "item" }))].map((asset, index) => ({ ...asset, index, image: null, state: "loading" })));
      const results = await Promise.allSettled(assets.map(async (asset) => {
        try {
          const image = await loadImage(asset.file);
          if (asset.size && (asset.size[0] !== image.naturalWidth || asset.size[1] !== image.naturalHeight)) throw new Error(`${asset.file}: image dimensions differ from manifest.`);
          const [x, y] = asset.offset;
          if (x < 0 || y < 0 || x + image.naturalWidth > FRAME.width || y + image.naturalHeight > FRAME.height) throw new Error(`${asset.file}: image bounds exceed the source canvas.`);
          asset.image = image;
          asset.state = "ready";
          loaded++;
        } catch (error) {
          asset.state = "error";
          failed++;
          throw error;
        } finally { record({ loaded: String(loaded), failed: String(failed) }); }
      }));
      const errors = results.filter((result) => result.status === "rejected");
      if (errors.length) throw new Error(`${errors.length} desktop asset(s) failed: ${errors.map((result) => result.reason?.message || result.reason).join("; ")}`);
      plate = document.createElement("canvas");
      plate.width = FRAME.width;
      plate.height = FRAME.height;
      const plateCtx = plate.getContext("2d");
      if (!plateCtx) throw new Error("Canvas 2D is unavailable for the desktop plate.");
      plateCtx.fillStyle = BEZEL;
      plateCtx.fillRect(0, 0, FRAME.width, FRAME.height);
      composition = assets.slice().sort((a, b) => a.z - b.z || a.index - b.index);
      composition.forEach((asset) => plateCtx.drawImage(asset.image, ...asset.offset));
      interaction = mountDesktopInteraction(root, {
        items: assets.filter((asset) => asset.type === "item"),
        boxUrl: new URL("../../assets/landing/box/box-collection-draft3.png", import.meta.url).href,
        boxClosedUrl: new URL("../../assets/landing/box/box-collection-closed-v1.png", import.meta.url).href,
        boxGeometry: COLLECTION_BOX_DESIGN,
        requestRender: () => render(lastProgress, lastReducedMotion),
        onCollectionBoxSelected: () => onCollectionBoxSelected?.(getCollectionBoxState()),
      });
      await interaction.ready;
      record({ ready: "true", loaded: String(loaded), failed: "0", assetSet: "desktop-v2", uniqueImages: String(decoded.size) });
      if (status) status.hidden = true;
      if (liveStatus) liveStatus.textContent = "바탕화면 장면이 준비됐어요.";
      return { assets, plate };
    } catch (error) {
      record({ ready: "error" });
      setStatus("바탕화면 이미지를 불러오지 못했어요.", true);
      throw error;
    }
  })();

  function render(progress, reducedMotion = false) {
    lastProgress = progress;
    lastReducedMotion = reducedMotion;
    const bounds = root.getBoundingClientRect();
    const width = dimension(bounds.width), height = dimension(bounds.height);
    // Hold the approved open pose until all vector parts are ready.
    const pose = getDesktopTransition(width, height, plate ? progress : 0, reducedMotion);
    lastPose = pose;
    interaction?.configure(pose.desktopRect, interactiveEnabled && pose.done && progress > 0 && !root.hidden, reducedMotion);
    if (!ctx || !warpCtx) return pose;
    const dpr = Math.max(1, Math.min(2, Number(globalThis.devicePixelRatio) || 1));
    const pixelWidth = Math.max(1, Math.round(width * dpr)), pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    if (warp.width !== pixelWidth || warp.height !== pixelHeight) {
      warp.width = pixelWidth;
      warp.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BEZEL;
    ctx.fillRect(0, 0, width, height);
    const openPlate = getOpenPlate();
    if (openPlate) {
      ctx.save();
      ctx.translate(pose.camera.x, pose.camera.y);
      ctx.scale(pose.camera.scale, pose.camera.scale);
      ctx.drawImage(openPlate, 0, 0, FRAME.width, FRAME.height);
      ctx.restore();
    }
    if (plate && pose.desktopOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = pose.desktopOpacity;
      if (pose.morph === 1) {
        const rect = pose.desktopRect;
        const background = composition.find((asset) => asset.id === "background");
        const taskbar = composition.find((asset) => asset.id === "taskbar");
        const frame = composition.find((asset) => asset.id === "frame");
        ctx.drawImage(background.image, 0, 0, width, height);
        ctx.save();
        ctx.translate(rect.x, rect.y);
        ctx.scale(rect.scale, rect.scale);
        interaction.draw(ctx);
        ctx.restore();
        drawTaskbar(ctx, taskbar.image, pose);
        ctx.drawImage(frame.image, 0, 0, width, height);
      } else {
        // Warp at full opacity first. Applying the fade once avoids dark seams
        // where the texture triangles overlap along the portal edges.
        warpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        warpCtx.clearRect(0, 0, width, height);
        mapQuad(warpCtx, plate, SOURCE_QUAD, pose.quad, 10, 4);
        ctx.drawImage(warp, 0, 0, pixelWidth, pixelHeight, 0, 0, width, height);
      }
      ctx.restore();
    }
    if (pose.bezelOpacity > 0) {
      ctx.save();
      outsideQuad(ctx, pose.quad, width, height);
      ctx.globalAlpha = pose.bezelOpacity;
      ctx.fillStyle = BEZEL;
      ctx.fill("evenodd");
      ctx.restore();
    }
    record({
      progress: pose.progress.toFixed(4), requestedProgress: clamp(progress).toFixed(4), phase: pose.phase,
      cameraZoom: pose.cameraZoom.toFixed(4), quad: JSON.stringify(pose.quad),
      portalQuad: JSON.stringify(pose.portalQuad), camera: JSON.stringify(pose.camera),
      desktopRect: JSON.stringify(pose.desktopRect), desktopOpacity: pose.desktopOpacity.toFixed(4),
      monitorRect: JSON.stringify(pose.monitorRect), taskbarRect: JSON.stringify(pose.taskbarRect),
      bezelOpacity: pose.bezelOpacity.toFixed(4), reducedMotion: String(Boolean(reducedMotion)),
    });
    return pose;
  }

  function getCollectionBoxState() {
    const state = interaction?.getCollectionBoxState();
    return state ? { ...state, viewport: { width: lastPose?.width || 0, height: lastPose?.height || 0, pixelWidth: canvas.width, pixelHeight: canvas.height } } : null;
  }
  function getDesktopPlate() {
    const copy = document.createElement("canvas");
    copy.width = canvas.width; copy.height = canvas.height;
    copy.getContext("2d").drawImage(canvas, 0, 0);
    copy.dataset.logicalWidth = String(lastPose?.width || 0);
    copy.dataset.logicalHeight = String(lastPose?.height || 0);
    return copy;
  }
  function setActive(value) { interactiveEnabled = Boolean(value); return render(lastProgress, lastReducedMotion); }
  function reset() { interactiveEnabled = true; interaction?.reset(); return render(0); }
  return { ready, render, reset, setActive, getCollectionBoxState, getDesktopPlate };
}
