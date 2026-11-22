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
/** 상자 하나 → 지금 쓰는 텍스처의 cache 키. 개수가 바뀔 때 이전 텍스처를 놓으려고 둔다. */
const boxSlots = new Map();

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

/* ── 문서 카드: 정리방 UI와 같은 「연필 + 크림 종이」 ──
   크림 종이 안쪽에 손으로 두 번 그은 테두리(js/ui/pencil.js와 같은 결), 연필 문서 아이콘(안은 파일 색으로 옅게),
   먹 글자 파일 이름 + 색연필 밑줄, 확장자는 키캡 같은 연필 칩, 크기는 옅은 먹. 색은 board-layout.js fileColor(앱 색).
   선은 종이(map)에, 글자는 글자 층(ink)에 — 후처리(디더·외곽선)에서 글자만 빼려고. */
const PEN = { ink: "#2f231a", ink2: "#6b5a4a", paper: "#fbf7ec" };
const UI_FONT = "'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
const KEY_FONT = "'Nunito', 'NanumSquareRound', system-ui, sans-serif";

/** 이름에서 고정 손떨림 값(다시 그려도 같은 선) */
const seedOf = (text) => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) / 97;

/** 연필 선: 진한 선 + 살짝 비낀 옅은 선 */
function penLine(ctx, points, seed, width = 2.4, color = PEN.ink) {
  const wobble = (k) => Math.sin(seed * 12.9 + k * 7.3) * 0.9;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const [shift, alpha, lineWidth] of [[0, 1, width], [1.1, 0.45, width * 0.55]]) {
    ctx.globalAlpha = alpha; ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const px = x + shift + wobble(i), py = y - shift * 0.8 + wobble(i + 3);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/** 연필로 그린 둥근 사각 */
function penRoundRect(ctx, x, y, w, h, r, seed, width) {
  const points = [];
  const line = (ax, ay, bx, by, n) => { for (let i = 0; i <= n; i++) points.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]); };
  const corner = (cx, cy, from) => { for (let i = 0; i <= 4; i++) { const a = from + i * Math.PI / 8; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  line(x + r, y, x + w - r, y, 6); corner(x + w - r, y + r, -Math.PI / 2);
  line(x + w, y + r, x + w, y + h - r, 4); corner(x + w - r, y + h - r, 0);
  line(x + w - r, y + h, x + r, y + h, 6); corner(x + r, y + h - r, Math.PI / 2);
  line(x, y + h - r, x, y + r, 4); corner(x + r, y + r, Math.PI);
  penLine(ctx, points, seed, width);
}

/** 연필 문서 아이콘(오른쪽 위 접힌 귀 + 줄 셋). 안은 파일 색으로 옅게 칠한다 */
function penDocument(ctx, x, y, w, h, seed, color) {
  const fold = w * 0.3;
  ctx.save();
  ctx.globalAlpha = 0.55; ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - fold, y); ctx.lineTo(x + w, y + fold); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
  ctx.restore();
  penLine(ctx, [[x, y], [x + w - fold, y], [x + w, y + fold], [x + w, y + h], [x, y + h], [x, y]], seed, 2.6);
  penLine(ctx, [[x + w - fold, y], [x + w - fold, y + fold], [x + w, y + fold]], seed + 1, 2);
  for (let i = 0; i < 3; i++) {
    const ly = y + h * (0.45 + i * 0.17);
    penLine(ctx, [[x + w * 0.2, ly], [x + w * (i === 2 ? 0.55 : 0.8), ly]], seed + 2 + i, 2, PEN.ink2);
  }
}

/**
 * 파일 이름 줄바꿈: 확장자(「.blend」)는 한 덩어리로 둬서 「초안.b / lend」처럼 끊기지 않게.
 * 넘치면 마지막 줄 끝을 「…」으로 줄이되 확장자는 남긴다.
 */
export function wrapFileName(ctx, name, maxWidth, maxLines) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  const tokens = [...(ext ? name.slice(0, dot) : name)];
  if (ext) tokens.push(ext);
  const lines = [];
  let line = "";
  let used = 0;
  for (const token of tokens) {
    if (line && ctx.measureText(line + token).width > maxWidth) {
      if (lines.length === maxLines - 1) break;
      lines.push(line);
      line = "";
    }
    line += token;
    used++;
  }
  if (used < tokens.length) {
    // 다 못 넣었다: 마지막 줄을 줄이고 「…」 + 확장자
    let body = line.endsWith(ext) && ext ? line.slice(0, -ext.length) : line;
    while (body && ctx.measureText(`${body}…${ext}`).width > maxWidth) body = body.slice(0, -1);
    line = `${body}…${ext}`;
  }
  lines.push(line);
  return lines;
}

function drawPaperFace(ctx, ink, item, color, width, height) {
  const seed = seedOf(item.name);
  ctx.fillStyle = PEN.paper;
  ctx.fillRect(0, 0, width, height);
  penRoundRect(ctx, 10, 10, width - 20, height - 20, 14, seed, 2.4);
  penDocument(ctx, 26, 28, 46, 58, seed, color);

  // 파일 이름: 먹 글자, 마지막 줄 아래 색연필 밑줄
  ctx.textBaseline = "middle";
  ctx.fillStyle = PEN.ink;
  ctx.font = `800 27px ${UI_FONT}`;
  const nameX = 90, nameWidth = width - 120;
  const lines = wrapFileName(ctx, item.name, nameWidth, 2);
  lines.forEach((line, index) => drawText(ctx, ink, line, nameX, 44 + index * 32));
  const underY = 66 + (lines.length - 1) * 32;
  const underWidth = Math.min(nameWidth, ctx.measureText(lines.at(-1) ?? "").width);
  penLine(ctx, [[nameX, underY], [nameX + underWidth * 0.5, underY - 2], [nameX + underWidth, underY]], seed + 9, 5, color);

  // 확장자: 키캡 같은 연필 칩(오른쪽 아래). 크기: 옅은 먹(왼쪽 아래)
  const ext = extLabel(item);
  ctx.font = `800 19px ${KEY_FONT}`;
  const chipWidth = ctx.measureText(ext).width + 22;
  penRoundRect(ctx, width - chipWidth - 26, height - 58, chipWidth, 32, 9, seed + 3, 2.2);
  ctx.fillStyle = PEN.ink;
  drawText(ctx, ink, ext, width - chipWidth - 15, height - 41);
  ctx.fillStyle = PEN.ink2;
  ctx.font = `700 17px ${UI_FONT}`;
  drawText(ctx, ink, formatSize(item.size), 28, height - 41);
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
  ctx.font = "600 24px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  drawText(ctx, ink, wrap(ctx, item.name, width - 40, 1)[0] ?? item.name, 20, height - 47);
  ctx.fillStyle = "#637c96";
  roundRect(ctx, width - 83, height - 31, 63, 24, 4); ctx.fill();
  ctx.fillStyle = "#fff9ed";
  ctx.font = "700 16px 'NanumSquareRound', 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, extLabel(item), width - 77, height - 18);
  ctx.fillStyle = "#888575";
  ctx.font = "16px 'NanumSquareRound', 'Segoe UI', system-ui, sans-serif";
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
    ctx.font = "15px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
    ctx.fillStyle = "#77796d";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    drawText(ctx, ink, "미리보기 없음", width / 2, photoHeight / 2 + 55);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#393c32";
  ctx.font = "600 24px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  drawText(ctx, ink, wrap(ctx, item.name, width - 36, 1)[0] ?? item.name, 18, height - 46);
  ctx.fillStyle = "#797a6e";
  ctx.font = "16px 'NanumSquareRound', 'Segoe UI', system-ui, sans-serif";
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
  ctx.font = "500 32px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  const lines = wrap(ctx, item.name, width - 64, 4);
  lines.forEach((line, index) => drawText(ctx, ink, line, 32, 120 + index * 40));
  ctx.fillStyle = "#81734d";
  ctx.font = "17px 'NanumSquareRound', 'Segoe UI', system-ui, sans-serif";
  drawText(ctx, ink, `${extLabel(item)} · ${formatSize(item.size)}`, 32, height - 38);

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
  ctx.imageSmoothingEnabled = true;
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
  // subtitle에는 파일 개수가 들어 있어 넣을 때마다 새 텍스처가 생기고 옛것이 쌓이므로 버린다.
  // 상자 하나(번호·이름·색)에는 마지막 텍스처 하나만 남기고 이전 것은 놓는다.
  const slot = `box|${index}|${name}|${accent}|${bodyColor}`;
  const previous = boxSlots.get(slot);
  if (previous && previous !== key) {
    const old = cache.get(previous);
    cache.delete(previous);
    old?.userData.textTexture?.dispose();
    old?.dispose();
  }
  boxSlots.set(slot, key);

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
  ctx.fillStyle = "#f0b66b";
  ctx.fillRect(0, 0, width, 6);

  ctx.fillStyle = "#383a2b";
  roundRect(ctx, 199, 31, 114, 22, 7);
  ctx.fill();
  ctx.fillStyle = "#e9dfc6";
  roundRect(ctx, 54, 107, 404, 103, 6);
  ctx.fill();
  ctx.fillStyle = "#484737";
  ctx.font = "700 34px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  drawText(ctx, ink, wrap(ctx, name, 368, 1)[0] ?? name, width / 2, 143);
  ctx.fillStyle = "#827b65";
  ctx.font = "500 20px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
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

/**
 * 다락방 상자(`models/box.glb`) 앞면 손잡이 구멍 아래에 붙이는 이름표.
 * 모델 앞면 UV가 아틀라스 조각이라 앞면 전체 대신 작은 판에 그린다.
 */
export function makeBoxLabelTexture(THREE, { index, name, subtitle, accent }) {
  const key = `boxlabel|${index}|${name}|${subtitle}|${accent}`;
  if (cache.has(key)) return cache.get(key);
  const width = 420;
  const height = 250;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const inkCanvas = makeInkCanvas(width, height);
  const ink = inkCanvas.getContext("2d");

  ctx.fillStyle = "#f3ead3";
  roundRect(ctx, 4, 4, width - 8, height - 8, 14);
  ctx.fill();
  ctx.strokeStyle = "#6b5a3e";
  ctx.lineWidth = 5;
  ctx.stroke();
  // 겨눔 색 띠
  ctx.fillStyle = accent ?? "#ffdb68";
  roundRect(ctx, 30, 40, 10, 38, 5);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#3d3426";
  ctx.font = "700 40px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  const lines = wrap(ctx, name, width - 60, 2);
  const top = lines.length > 1 ? 122 : 140;
  lines.forEach((line, i) => drawText(ctx, ink, line, 30, top + i * 46));
  ctx.fillStyle = "#7d6f55";
  ctx.font = "500 24px 'NanumSquareRound', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";
  drawText(ctx, ink, subtitle, 54, 59);

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
  boxSlots.clear();
}
