/**
 * card-face.js — 카드 표면 이미지와 후처리에서 제외할 투명 글자 텍스처.
 *
 * 3D는 정보량을 줄이는 방향으로 작동한다. 그래서 파일명은 오브젝트 자체에 박아 둔다. (CLAUDE.md §12)
 * 가리키거나 고른 카드에는 board-3d가 별도의 HTML 라벨을 더 크게 띄운다.
 *
 * 이미지 파일은 종이 여백 안에 실제 미리보기를 넣는다. 파일명은 사진 밖에 인쇄한다.
 *
 * 표면은 map에, userData.textTexture는 같은 UV를 쓰는 TEXT_LAYER 메시로 따로 그린다.
 */
import { formatSize } from "../ui/board-layout.js";
import { TUNING } from "./tuning.js";
import { formStyle } from "./file-form.js";

/** 브라우저가 실제로 디코딩할 수 있는 것만. heic·tiff 등은 시도하지 않는다. */
export const THUMBNAIL_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"]);
const MAX_THUMBNAIL_BYTES = 25 * 1024 * 1024;

const cache = new Map();

export function canPreview(item) {
  return THUMBNAIL_EXTENSIONS.has((item.extension ?? "").toLowerCase()) && item.size > 0 && item.size <= MAX_THUMBNAIL_BYTES;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 폭에 맞춰 줄바꿈. 긴 단어는 글자 단위로 자른다 (파일명은 공백이 없을 때가 많다). */
function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = "";
  for (const char of text) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth - 14) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 2))}…`;
    }
  }
  return lines;
}

function extLabel(item) {
  return item.extension ? item.extension.toUpperCase().slice(0, 5) : "FILE";
}

/** 미리보기가 없을 때: 종이에 인쇄된 라벨 */
function drawText(ctx, ink, text, x, y) {
  for (const key of ["fillStyle", "font", "textBaseline", "textAlign"]) ink[key] = ctx[key];
  ink.fillText(text, x, y);
}

function makeInkCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawPaperFace(ctx, ink, item, color, width, height) {
  ctx.fillStyle = TUNING.card.faceColor;
  ctx.fillRect(0, 0, width, height);

  // A printed document glyph, not a synthetic preview of the user's file.
  ctx.fillStyle = "#e0dbc9";
  roundRect(ctx, 143, 22, 114, 102, 6); ctx.fill();
  ctx.fillStyle = "#a3a28f";
  for (let line = 0; line < 5; line++) ctx.fillRect(159, 41 + line * 14, line === 4 ? 48 : 82, 5);
  ctx.fillStyle = "#3b3c32";
  ctx.textBaseline = "middle";
  ctx.font = "600 25px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  wrap(ctx, item.name, width - 40, 2).forEach((line, index) => drawText(ctx, ink, line, 20, 153 + index * 29));
  const ext = extLabel(item);
  ctx.font = "700 17px 'Segoe UI', system-ui, sans-serif";
  const chipWidth = ctx.measureText(ext).width + 16;
  ctx.fillStyle = color;
  roundRect(ctx, width - chipWidth - 20, height - 32, chipWidth, 24, 4); ctx.fill();
  ctx.fillStyle = "#494935";
  drawText(ctx, ink, ext, width - chipWidth - 12, height - 19);
  ctx.fillStyle = "#888575";
  ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, formatSize(item.size), 20, height - 19);
}

/** 아직 별도 형태를 정하지 않은 이미지 형식의 기존 카드. */
function drawImageCardFace(ctx, ink, item, color, bitmap, width, height) {
  ctx.fillStyle = TUNING.card.faceColor;
  ctx.fillRect(0, 0, width, height);
  const inset = 20;
  const photoWidth = width - inset * 2;
  const photoHeight = height - 94;
  const scale = Math.max(photoWidth / bitmap.width, photoHeight / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  ctx.save();
  roundRect(ctx, inset, inset, photoWidth, photoHeight, 5);
  ctx.clip();
  ctx.drawImage(bitmap, (width - drawWidth) / 2, inset + (photoHeight - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#3b3c32";
  ctx.font = "600 24px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  drawText(ctx, ink, wrap(ctx, item.name, width - 40, 1)[0] ?? item.name, 20, height - 47);
  ctx.fillStyle = "#637c96";
  roundRect(ctx, width - 83, height - 31, 63, 24, 4); ctx.fill();
  ctx.fillStyle = "#fff9ed";
  ctx.font = "700 16px 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, extLabel(item), width - 77, height - 18);
  ctx.fillStyle = "#888575";
  ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, formatSize(item.size), 20, height - 18);
}

/** 인화지. 투명·세로 이미지도 잘리지 않게 전체 썸네일을 여백 안에 넣는다. */
function drawPhotoFace(ctx, ink, item, bitmap, width, height) {
  ctx.fillStyle = "#faf7ee";
  ctx.fillRect(0, 0, width, height);
  const inset = 16;
  const photoWidth = width - inset * 2;
  const photoHeight = height - 88;
  ctx.fillStyle = "#e4e1d7";
  ctx.fillRect(inset, inset, photoWidth, photoHeight);
  if (bitmap) {
    const scale = Math.min(photoWidth / bitmap.width, photoHeight / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    ctx.drawImage(bitmap, inset + (photoWidth - drawWidth) / 2, inset + (photoHeight - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    // 실제 미리보기를 읽지 못했을 때에도 인화지의 형태와 파일 정보는 남긴다.
    ctx.strokeStyle = "#aaa99e";
    ctx.lineWidth = 3;
    ctx.strokeRect(width / 2 - 34, photoHeight / 2 - 16, 68, 48);
    ctx.beginPath();
    ctx.moveTo(width / 2 - 26, photoHeight / 2 + 22);
    ctx.lineTo(width / 2 - 7, photoHeight / 2 + 1);
    ctx.lineTo(width / 2 + 7, photoHeight / 2 + 13);
    ctx.lineTo(width / 2 + 20, photoHeight / 2 + 4);
    ctx.lineTo(width / 2 + 28, photoHeight / 2 + 22);
    ctx.stroke();
    ctx.font = "15px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
    ctx.fillStyle = "#77796d";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    drawText(ctx, ink, "미리보기 없음", width / 2, photoHeight / 2 + 55);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#393c32";
  ctx.font = "600 24px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  drawText(ctx, ink, wrap(ctx, item.name, width - 36, 1)[0] ?? item.name, 18, height - 46);
  ctx.fillStyle = "#797a6e";
  ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, formatSize(item.size), 18, height - 19);
  ctx.textAlign = "right";
  drawText(ctx, ink, extLabel(item), width - 18, height - 19);
  ctx.textAlign = "left";
}

/** TXT는 정사각 메모지. 본문을 읽거나 가짜 본문을 만들지 않고 파일명을 쓴다. */
function drawNoteFace(ctx, ink, item, width, height) {
  ctx.fillStyle = "#f5df86";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e9d17a";
  ctx.fillRect(0, 0, width, 48);
  ctx.fillStyle = "rgba(149, 119, 48, 0.16)";
  ctx.fillRect(0, 48, width, 2);

  ctx.fillStyle = "#494334";
  ctx.textBaseline = "middle";
  ctx.font = "500 32px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  const lines = wrap(ctx, item.name, width - 64, 4);
  lines.forEach((line, index) => drawText(ctx, ink, line, 32, 120 + index * 40));
  ctx.fillStyle = "#81734d";
  ctx.font = "17px 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, `TXT · ${formatSize(item.size)}`, 32, height - 38);

  // 접힌 귀퉁이. 지오메트리의 잘린 모서리와 UV 위치를 맞춘다.
  const fold = width * formStyle(item.extension).fold;
  ctx.fillStyle = "#d7ba65";
  ctx.beginPath();
  ctx.moveTo(width - fold - 3, height - fold - 3);
  ctx.lineTo(width, height - fold);
  ctx.lineTo(width - fold, height);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff0b0";
  ctx.beginPath();
  ctx.moveTo(width - fold, height - fold);
  ctx.lineTo(width, height - fold);
  ctx.lineTo(width - fold, height);
  ctx.closePath(); ctx.fill();
}

/**
 * @param {object} THREE
 * @param {{ id?: string, name: string, extension: string, size: number }} item
 * @param {string} color  계열 색
 * @param {(item: object) => Promise<Blob|null>} [loadThumbnail]
 *   이미지 바이트를 가져오는 함수. 없으면 종이 얼굴로 남는다.
 *   비동기라 텍스처를 먼저 돌려주고, 도착하면 같은 캔버스에 다시 그려 needsUpdate만 올린다.
 */
export function makeCardTexture(THREE, item, color, loadThumbnail) {
  const key = `${item.id ?? ""}|${item.name}|${item.extension}|${item.size}|${color}`;
  if (cache.has(key)) return cache.get(key);

  const style = formStyle(item.extension);
  const width = TUNING.label.texture.width;
  const height = style.aspect ? Math.round(width / style.aspect) : TUNING.label.texture.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const inkCanvas = makeInkCanvas(width, height);
  const ink = inkCanvas.getContext("2d");
  if (style.kind === "note") drawNoteFace(ctx, ink, item, width, height);
  else if (style.kind === "photo") drawPhotoFace(ctx, ink, item, null, width, height);
  else drawPaperFace(ctx, ink, item, color, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const textTexture = new THREE.CanvasTexture(inkCanvas);
  textTexture.colorSpace = THREE.SRGBColorSpace;
  textTexture.anisotropy = 8;
  texture.userData.textTexture = textTexture;
  let disposed = false;
  texture.addEventListener("dispose", () => { disposed = true; });
  cache.set(key, texture);

  if (loadThumbnail && canPreview(item)) {
    loadThumbnail(item)
      .then(async (blob) => {
        if (!blob) return null;
        // 6000px 사진을 원본 크기로 디코딩하지 않는다
        return createImageBitmap(blob, { resizeWidth: width, resizeQuality: "medium" }).catch(() =>
          createImageBitmap(blob),
        );
      })
      .then((bitmap) => {
        if (!bitmap) return;
        if (disposed) { bitmap.close?.(); return; }
        ink.clearRect(0, 0, width, height);
        if (style.kind === "photo") drawPhotoFace(ctx, ink, item, bitmap, width, height);
        else drawImageCardFace(ctx, ink, item, color, bitmap, width, height);
        texture.needsUpdate = true;
        textTexture.needsUpdate = true;
        bitmap.close?.();
      })
      .catch(() => {
        // 못 읽는 이미지는 종이 얼굴 그대로 둔다. 장면은 죽지 않는다.
      });
  }

  return texture;
}

/** 상자 앞면에 붙일 번호 + 이름 */
export function makeBoxTexture(THREE, { index, name, subtitle, accent, bodyColor = "#a99775" }) {
  const key = `box|${index}|${name}|${subtitle}|${accent}|${bodyColor}`;
  if (cache.has(key)) return cache.get(key);

  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const inkCanvas = makeInkCanvas(width, height);
  const ink = inkCanvas.getContext("2d");

  ctx.fillStyle = bodyColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  ctx.fillRect(0, 0, width, 6);

  ctx.fillStyle = "#383a2b";
  roundRect(ctx, 199, 31, 114, 22, 7);
  ctx.fill();
  ctx.fillStyle = "#e9dfc6";
  roundRect(ctx, 54, 107, 404, 103, 6);
  ctx.fill();
  ctx.fillStyle = "#484737";
  ctx.font = "700 34px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  drawText(ctx, ink, wrap(ctx, name, 368, 1)[0] ?? name, width / 2, 143);
  ctx.fillStyle = "#827b65";
  ctx.font = "500 20px 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  drawText(ctx, ink, `${index} · ${subtitle}`, width / 2, 180);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const textTexture = new THREE.CanvasTexture(inkCanvas);
  textTexture.colorSpace = THREE.SRGBColorSpace;
  textTexture.anisotropy = 8;
  texture.userData.textTexture = textTexture;
  cache.set(key, texture);
  return texture;
}

export function disposeCardTextures() {
  for (const texture of cache.values()) {
    texture.userData.textTexture?.dispose();
    texture.dispose();
  }
  cache.clear();
}
