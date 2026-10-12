// Cozium landing, 3D room (Claude, 2026-10-11): the painted room plates of the 10-07 landing are replaced by the user's
// 3D attic (room-layer.js); one button walks into the tidied laptop and on to app.html. Everything inside the laptop is
// unchanged. The render panel opens with ?lab (the prototype copy it was reviewed in moved to _archive/ on 10-11).
// Original header:
// Cozium landing (2026-10-07). Built from the reviewed animatic v9 (docs/prototypes/landing-animatic.html, now in
// _archive/, which kept a review bar for stepping through beats). Wordless story: room → laptop → the desktop becomes the floor and the folders
// become boxes → carry the four piles by hand → the tidy desktop → the tidied room with the two ways in.
// Nothing here touches real files. Structure and tuning: docs/landing-redesign.md §7.
import * as THREE from "three";
import { RoomLayer, StyledPass, TEXT_LAYER } from "./room-layer.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";
import { toonGradient } from "../three/materials.js";
import { initLab } from "./render-lab.js";

// ───────────── helpers ─────────────
const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const inOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const W0 = 1672, H0 = 941;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261006);

// Story beats on one 0..1 track. The try-it stop sits at GATE.
const BEATS = [
  ["room", 0, .06, "방"], ["dive", .06, .22, "노트북"], ["fall", .22, .54, "물건과 상자로"],
  ["try", .54, .60, "직접 담기"], ["clear", .60, .76, "바닥이 드러남"],
  ["back", .76, .88, "정리된 바탕화면"], ["out", .88, 1, "방으로"],
];
const B = Object.fromEntries(BEATS.map(([k, a, b]) => [k, [a, b]]));
const local = (k, p) => clamp((p - B[k][0]) / (B[k][1] - B[k][0]));
// One beat, two things at once: files fall and turn into things while the folders rise and turn into boxes.
const fallU = (p) => clamp(local("fall", p) / .8);           // files + camera tilt
const shelfU = (p) => clamp((local("fall", p) - .12) / .88); // folders → boxes, lifting off as the files start to fall
const GATE = .575;

// ───────────── desktop data ─────────────
const NAMES = {
  document: ["이력서_최종.docx", "이력서_최종_수정.docx", "자기소개서.hwp", "계약서_스캔.pdf", "전세계약서.pdf", "가계부_10월.xlsx", "가계부_11월.xlsx", "보험약관.pdf", "회의록.hwp", "청첩장_주소록.txt", "메모.txt", "여행일정.docx", "레시피_모음.pdf", "영수증_정리.xlsx", "택배_송장.pdf", "새 문서.docx"],
  photo: ["IMG_2041.jpg", "IMG_2042.jpg", "IMG_2043.jpg", "스크린샷 2026-04-12 143201.png", "스크린샷 2026-05-02 091533.png", "스크린샷 2026-05-19 221004.png", "KakaoTalk_20260501_123101.jpg", "KakaoTalk_20260514_181940.jpg", "제주도_01.jpg", "제주도_02.jpg", "가족사진.jpg", "생일파티.png", "캡처.png", "캡처(2).png", "배경화면_후보.jpg", "프로필사진.png"],
  video: ["제주도_영상.mp4", "생일_축하.mov", "화면녹화_0503.mp4", "강아지.mp4", "브이로그_편집본.mp4", "결혼식_하이라이트.mp4"],
  audio: ["녹음_0503.m4a", "녹음_0510.m4a", "보이스메모.m4a", "좋아하는노래.mp3", "벨소리.mp3", "통화녹음_0412.m4a", "플레이리스트_01.mp3", "알람음.wav"],
  archive: ["사진_백업.zip", "자료모음.zip", "카톡_받은파일.zip", "다운로드_정리.zip", "백업_0412.zip", "백업_0503.zip", "폰트팩.zip", "설치파일.zip", "새 압축 파일.zip", "문서_백업.7z"],
};
const FOLDERS = [
  { name: "사진", tone: "sage", at: [0, 3] }, { name: "문서", tone: "sand", at: [2, 7] },
  { name: "음악·영상", tone: "sage", at: [3, 1] }, { name: "압축파일", tone: "sand", at: [5, 5] },
];
// Cluster on the floor by kind; where each cluster ends up when the floor clears by itself.
const CLUSTERS = [
  { kinds: ["photo"], center: [-3.9, -2.6], cols: 4, box: 0 },
  { kinds: ["document"], center: [-1.1, 0.55], cols: 4, box: 1 },
  { kinds: ["video", "audio"], center: [3.3, -2.6], cols: 5, box: 2 },
  { kinds: ["archive"], center: [3.0, 0.75], cols: 4, box: 3 },
];
const KIND_CLUSTER = { photo: 0, document: 1, video: 2, audio: 2, archive: 3 };
const PILE_RANK = CLUSTERS.map((c) => CLUSTERS.filter((d) => d.center[0] < c.center[0]).length); // left → right

const cells = [];
for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) cells.push([r, c]);
const folderCells = new Set(FOLDERS.map((f) => f.at.join(",")));
const kindPool = Object.entries(NAMES).flatMap(([kind, list]) => list.map((name) => ({ kind, name })));
for (let i = kindPool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [kindPool[i], kindPool[j]] = [kindPool[j], kindPool[i]]; }
const items = [];
for (const [r, c] of cells) {
  const px = 54 + c * 94, py = 45 + r * 100;
  const folderIndex = FOLDERS.findIndex((f) => f.at[0] === r && f.at[1] === c);
  if (folderIndex >= 0) items.push({ folder: folderIndex, kind: "folder", name: FOLDERS[folderIndex].name, px, py });
  else items.push({ ...kindPool.pop(), px, py });
}
// A messy desktop is a full one, not a scattered one (user, 10-13: "a computer screen isn't like that"): every icon
// sits on its grid cell, upright, kinds mixed. (10-08 to 10-13 each icon was nudged ±16 px and tilted ±11°, after the
// intro video.) Its own seed for the arrival order below, so the rest of the layout keeps its numbers.
const RJ = rng(20261008);
for (const it of items) { RJ(); RJ(); RJ(); it.deg = 0; } // the old jitter draws, kept so the arrival order stays the same
// The screen starts empty; the icons arrive one by one while the camera dives in, closer and closer together.
// Driven by progress like everything else, so scrolling back takes them away again.
const POP = [.03, .2], POP_LEN = .016;
{
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(RJ() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((idx, k) => { items[idx].popP = POP[0] + (POP[1] - POP[0]) * Math.sqrt(k / (order.length - 1)); });
}
const files = items.filter((it) => it.kind !== "folder");
// Desktop pictures (10-13): the user's GPT set, cut to size in assets/landing/parts/desktop-v4/ (README there).
const DESK = "./assets/landing/parts/desktop-v4";
const iconFile = (it) => it.kind === "folder" ? `${DESK}/icons/folder-${FOLDERS[it.folder].tone}.webp` : `${DESK}/icons/${it.kind}.webp`;

// ───────────── DOM: room, desktop, chrome ─────────────
const stage = $("#stage"), world = $("#world");
const roomCanvas = $("#room"), poster = $("#poster"), paintRef = $("#paintRef");
// back from app.html (see "the way in"): read before anything else rewrites the address
const cameBack = location.hash === "#end";
// The 3D room. Its file things use the same faces as the floor scene inside the laptop (drawFace, below).
const room = new RoomLayer(roomCanvas, { faceCanvas: (k) => drawFace(k) });
const desk = $("#desk"), deskIcons = $("#deskIcons"), deskChrome = $("#deskChrome");
const title = $("#title"), cta = $("#cta"), cue = $("#cue"), veil = $("#veil"), sceneStatus = $("#sceneStatus");
let deskMode = "messy";
function buildDesk(mode, counts = []) {
  deskMode = mode;
  desk.classList.toggle("tidy", mode === "tidy");
  deskIcons.replaceChildren();
  const list = mode === "messy" ? items : FOLDERS.map((f, i) => ({ folder: i, kind: "folder", name: f.name, px: 54, py: 45 + i * 100, count: counts[i] }));
  for (const it of list) {
    const el = document.createElement("div");
    el.className = "item";
    el.style.left = it.px + "px"; el.style.top = it.py + "px";
    if (mode === "messy") { it.el = el; el.style.transform = `rotate(${it.deg}deg)`; }
    const img = document.createElement("img"); img.src = iconFile(it); img.alt = "";
    const name = document.createElement("div"); name.className = "name"; name.textContent = it.name;
    el.append(img, name);
    if (mode === "tidy") { name.style.display = "block"; const b = document.createElement("span"); b.className = "badge"; b.textContent = it.count ?? 0; el.append(b); }
    deskIcons.append(el);
  }
}
buildDesk("messy");

// Laptop screen quads in the two room paintings (source px).
const Q_MESSY = [[1240, 288], [1332, 281.5], [1313, 348.5], [1223, 349]];
const Q_TIDY = [[1238, 288], [1329, 281.5], [1311, 348.5], [1221, 349]];
const FULL = [[0, 0], [W0, 0], [W0, H0], [0, H0]];
const centerOf = (q) => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
const widthOf = (q) => ((q[1][0] - q[0][0]) + (q[2][0] - q[3][0])) / 2;

// Square → quad homography as CSS matrix3d (Heckbert), for a w×h element with origin 0 0.
function quadMatrix(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h2 = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den; h2 = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = (x1 - x0 + g * x1) / w, d = (y1 - y0 + g * y1) / w, b = (x3 - x0 + h2 * x3) / h, e = (y3 - y0 + h2 * y3) / h;
  return `matrix3d(${a},${d},0,${g / w},${b},${e},0,${h2 / h},0,0,1,0,${x0},${y0},0,1)`;
}
// 3×3 homographies: unit square → quad, quad → quad, and the CSS matrix3d for one (plate origin 0 0).
function sq2q([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, Bv = -(d * i - f * g), C = d * h - e * g, det = a * A + b * Bv + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, Bv / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function mul3(m, n) {
  const r = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(m[i * 3] * n[j] + m[i * 3 + 1] * n[3 + j] + m[i * 3 + 2] * n[6 + j]);
  return r;
}
const m3d = (H) => `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,${H[8]})`;
// The room painting is warped so its painted screen lands exactly on the desktop's quad: the vector desktop and the
// painted bezel can never drift apart, even while the desktop straightens out to fill the frame.
const roomWarp = (src, dst) => m3d(mul3(sq2q(dst), inv3(sq2q(src))));

// Camera move toward the laptop: scale k about the screen centre while that centre slides to the frame centre.
function zoomPose(q, t) {
  const pc = centerOf(q), kEnd = W0 / widthOf(q);
  const e = inOut(t), k = Math.exp(Math.log(kEnd) * e);
  const c = [lerp(pc[0], W0 / 2, e), lerp(pc[1], H0 / 2, e)];
  const map = ([x, y], kk = k) => [c[0] + kk * (x - pc[0]), c[1] + kk * (y - pc[1])];
  return { k, c, pc, map, kEnd };
}
const css = (k, c, pc) => `translate(${c[0] - k * pc[0]}px,${c[1] - k * pc[1]}px) scale(${k})`;
// Edge feather for the desktop plate: about 2.5% of the screen's on-screen width, at most 5 screen px.
function featherDesk(q) {
  const ws = widthOf(q) * cover, fs = Math.min(5, ws * .025);
  desk.style.setProperty("--fe", `${(fs * W0 / ws).toFixed(2)}px`);
}

let vw = innerWidth, vh = innerHeight, cover = 1;
// Safe area (user, 10-13): the plate is cover-fitted, so a window wider than 16:9 — a usual browser window, with its
// tab and bookmark bars — crops its top and bottom (a taller one, its sides). Three things answer the crop:
//  · the icon grid moves in by it, and the top-down camera with it (POSE_TOP), so the desktop still hands off to the
//    floor seamlessly. Each shift stops where the grid (≈ 984 × 640 plate px incl. jitter and names) would run into the
//    far edge or the taskbar; past that (a phone) the grid simply doesn't fit.
//  · the monitor frame and the taskbar sit on the visible part of the window (fitChrome). The frame is the same SVG
//    drawn as a 9-slice border (corners kept, edges stretched), so a new monitor-frame.svg still just drops in.
//    During the walk-in they stay on the plate's edges (the laptop's screen edges) and move in as the screen fills.
const GRID = { right: 984, bottom: 640 };
const TASKBAR = { below: 95 }; // its top sits 95 plate px above the bottom edge (846 on the 941 plate, 60 tall — index.html)
let safe = { x: 0, y: 0 }, crop = { x: 0, y: 0 }, chromeK = -1;
// The chrome's pictures come from DESK here, not from index.html: a browser holding an older index.html next to a
// newer story.js showed the old taskbar and frame on the new wallpaper (user, 10-13).
const taskbar = deskChrome.querySelector('img[src*="taskbar"]');
if (taskbar) { taskbar.src = `${DESK}/taskbar.webp`; taskbar.style.height = "60px"; }
const frame = document.createElement("div");
{
  const img = deskChrome.querySelector('img[src*="monitor-frame"]');
  frame.className = "frame";
  frame.style.borderImageSource = `url("${DESK}/monitor-frame.svg")`;
  img?.replaceWith(frame);
}
{ const wp = desk.querySelector('img[src*="wallpaper"]'); if (wp) wp.src = `${DESK}/wallpaper.webp`; }
function fitChrome(k) { // 0 = on the plate's edges, 1 = on the visible part of the window
  k = Math.round(clamp(k) * 200) / 200;
  if (k === chromeK) return;
  chromeK = k;
  const x = crop.x * k, y = crop.y * k, w = W0 - 2 * x, h = H0 - 2 * y;
  Object.assign(frame.style, { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px`, width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px` });
  if (taskbar) Object.assign(taskbar.style, { left: `${(x + 19).toFixed(1)}px`, top: `${(H0 - y - TASKBAR.below).toFixed(1)}px`, width: `${(w - 38).toFixed(1)}px` });
}
function layoutWorld() {
  vw = stage.clientWidth; vh = stage.clientHeight;
  cover = Math.max(vw / W0, vh / H0);
  world.style.transform = `translate(${(vw - W0 * cover) / 2}px,${(vh - H0 * cover) / 2}px) scale(${cover})`;
  crop = { x: Math.max(0, (W0 - vw / cover) / 2), y: Math.max(0, (H0 - vh / cover) / 2) };
  safe = { x: Math.min(crop.x, Math.max(0, W0 - crop.x - 20 - GRID.right)), y: Math.min(crop.y, Math.max(0, H0 - TASKBAR.below - crop.y - 10 - GRID.bottom)) };
  deskIcons.style.transform = safe.x || safe.y ? `translate(${safe.x.toFixed(1)}px,${safe.y.toFixed(1)}px)` : "";
  const k = chromeK; chromeK = -1; fitChrome(Math.max(0, k));
}

// ───────────── WebGL world: the desktop becomes the floor ─────────────
const canvas = $("#gl");
// Without WebGL the story cannot run; the page falls back to the first room with both buttons.
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
} catch (e) { console.warn("landing: WebGL unavailable, showing the still landing", e); }
const noGL = !renderer;
const scene = new THREE.Scene();
const FOV = 35;
const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 120);
camera.rotation.order = "YXZ";
const toWorld = (px, py) => [(px + 34 - W0 / 2) / 100, (py + 34 - H0 / 2) / 100];
const loader = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
// Top faces of the file things (desktop-v4/faces): the room's things and the floor's both draw them (drawFace), so they
// load before either is built. A face that fails falls back to the drawn one below.
const FACE_KINDS = ["document", "photo", "video", "audio", "archive"], faceImages = {};
const facesReady = Promise.all(FACE_KINDS.map((k) => loader(`${DESK}/faces/${k}.webp`).then((im) => { faceImages[k] = im; }, () => console.warn("landing: face", k))));
function canvasTex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function makeCanvas(w, h, draw) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); return cv; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const basic = (opts) => new THREE.MeshBasicMaterial({ toneMapped: false, ...opts });

const INK = "#5b4a33";
const iconImages = {};
const textures = {};

function drawFace(kind) {
  const img = faceImages[kind];
  if (img) return makeCanvas(512, Math.round(512 * img.naturalHeight / img.naturalWidth), (g, w, h) => g.drawImage(img, 0, 0, w, h));
  const w = 256, h = kind === "audio" ? 256 : kind === "photo" ? 204 : 186;
  return makeCanvas(w, h, (g) => {
    g.lineJoin = "round";
    if (kind === "document") {
      g.fillStyle = "#f8f1df"; rr(g, 3, 3, w - 6, h - 6, 8); g.fill();
      g.fillStyle = "#c9bc9f"; for (let i = 0; i < 6; i++) g.fillRect(30, 34 + i * 21, i === 5 ? 110 : 190, 6);
      g.fillStyle = "#e7dcc3"; g.beginPath(); g.moveTo(w - 3, h - 46); g.lineTo(w - 46, h - 3); g.lineTo(w - 46, h - 46); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3; rr(g, 3, 3, w - 6, h - 6, 8); g.stroke();
    } else if (kind === "photo") {
      g.fillStyle = "#fcf9f1"; rr(g, 3, 3, w - 6, h - 6, 5); g.fill();
      const grd = g.createLinearGradient(0, 18, 0, h - 52); grd.addColorStop(0, "#c3d9df"); grd.addColorStop(1, "#eef0e2");
      g.fillStyle = grd; g.fillRect(18, 18, w - 36, h - 62);
      g.fillStyle = "#e3bf72"; g.beginPath(); g.arc(178, 56, 17, 0, 7); g.fill();
      g.fillStyle = "#9fb289"; g.beginPath(); g.moveTo(18, 120); g.quadraticCurveTo(90, 52, 168, 112); g.lineTo(238, 92); g.lineTo(238, h - 44); g.lineTo(18, h - 44); g.fill();
      g.fillStyle = "#6f8b62"; g.beginPath(); g.moveTo(18, h - 70); g.quadraticCurveTo(130, 92, 238, h - 64); g.lineTo(238, h - 44); g.lineTo(18, h - 44); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(18, 18, w - 36, h - 62); rr(g, 3, 3, w - 6, h - 6, 5); g.stroke();
    } else if (kind === "video") {
      g.fillStyle = "#f2e9d4"; rr(g, 3, 3, w - 6, h - 6, 8); g.fill();
      g.fillStyle = "#3e4a43"; g.fillRect(16, 18, w - 32, h - 36);
      g.fillStyle = "#f2e9d4"; for (let i = 0; i < 9; i++) { g.fillRect(26 + i * 24, 26, 12, 9); g.fillRect(26 + i * 24, h - 35, 12, 9); }
      g.fillStyle = "#efd999"; g.beginPath(); g.moveTo(112, 64); g.lineTo(112, 122); g.lineTo(158, 93); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3; rr(g, 3, 3, w - 6, h - 6, 8); g.stroke();
    } else if (kind === "audio") {
      g.fillStyle = "#f0d98f"; g.fillRect(3, 3, w - 6, h - 6);
      g.fillStyle = "#e3c86f"; g.fillRect(3, 3, w - 6, 46);
      g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 9; g.lineCap = "round";
      g.beginPath(); g.moveTo(108, 186); g.lineTo(108, 92); g.lineTo(172, 78); g.lineTo(172, 170); g.stroke();
      g.beginPath(); g.ellipse(92, 188, 20, 15, -.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(156, 172, 20, 15, -.4, 0, 7); g.fill();
      g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    } else if (kind === "archive") {
      g.fillStyle = "#c9a174"; rr(g, 3, 3, w - 6, h - 6, 6); g.fill();
      g.fillStyle = "#e8d8b2"; g.fillRect(108, 3, 40, h - 6);
      g.strokeStyle = INK; g.lineWidth = 3; for (let y = 20; y < h - 20; y += 16) { g.beginPath(); g.moveTo(120, y); g.lineTo(136, y); g.stroke(); }
      g.fillStyle = "#b28a5d"; g.fillRect(3, h / 2 - 3, 105, 6); g.fillRect(148, h / 2 - 3, w - 151, 6);
      rr(g, 3, 3, w - 6, h - 6, 6); g.stroke();
    }
  });
}
// w × d in units, in the proportions of the faces (desktop-v4/faces: 1.02, 1.11, 1.22, 1.0, 1.13), no deeper than 0.73 so
// the piles' rows (0.8 apart) don't touch
const OBJECT_SIZE = { document: [.74, .73], photo: [.8, .72], video: [.87, .715], audio: [.66, .66], archive: [.81, .715] };
const EDGE = { document: "#e2d6bc", photo: "#efe9da", video: "#d6cbb2", audio: "#d8bf73", archive: "#a98258" };

let grainMap = null, fiberMap = null;
const inkLine = () => new THREE.LineBasicMaterial({ color: "#5c452e", transparent: true, opacity: .62 });
function grainCanvas(fiber) {
  return makeCanvas(512, 256, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const r = rng(fiber ? 7 : 11);
    if (fiber) { for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(90,64,30,${.03 + r() * .05})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); } return; }
    for (let i = 0; i < 46; i++) {
      const y = r() * h, a = .05 + r() * .09, amp = 1 + r() * 4, f = .004 + r() * .01;
      g.strokeStyle = `rgba(92,62,30,${a})`; g.lineWidth = .6 + r() * 1.6; g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f + i) * amp);
      g.stroke();
    }
  });
}
function shadedBox(w, h, d, color, { top, front, opacity = 1, fiber = false, ink = true } = {}) {
  grainMap ??= (() => { const t = canvasTex(grainCanvas(false)); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  fiberMap ??= (() => { const t = canvasTex(grainCanvas(true)); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const c = new THREE.Color(color), base = fiber ? fiberMap : grainMap;
  const mk = (f, map) => basic({ color: map ? 0xffffff : c.clone().multiplyScalar(f), map: map ?? base, transparent: opacity < 1, opacity });
  const mats = [mk(.84), mk(.84), mk(1.1, top), mk(.6), mk(1, front), mk(.9)];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  if (ink) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), inkLine()));
  return mesh;
}

function shadowTex() {
  return canvasTex(makeCanvas(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grd.addColorStop(0, "rgba(74,56,32,.42)"); grd.addColorStop(.55, "rgba(74,56,32,.16)"); grd.addColorStop(1, "rgba(74,56,32,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }));
}

// Floor (10-13, user: "the box design and the floor have changed"): the attic's own boards, cut out of room.glb's
// Room_BaseColor (the floor's UV rectangle, 5.7 × 8.6 m) into assets/landing/room-3d/attic-floor.webp and tiled.
// The game's scale: a 0.42 m document card is 0.9 units here, so 1 unit ≈ 0.47 m. Boards run into the room (z).
const FLOOR_TILE = { w: 5.73 / .47, d: 8.62 / .47 }, FLOOR = { x0: -11, x1: 11, z0: -6.3, z1: 9 }, FLOOR_BASE = "#59473a";
// Walls (10-13, user: "is this the wall colour? it's not like ours"): the attic's plaster — a wall patch of room.glb's
// Room_BaseColor (#f5f0e9, faintly mottled, 2.25 m) in attic-plaster.webp — and its dark timber (Wood beam, #241d18 in
// the texture, a little lighter here where nothing is lit): a sill along the floor, the knee-wall beam at the attic's
// 1.19 m (posts between the boxes were tried and taken out, user 10-13). It replaced the painted landing's cream + tan skirting.
const PLASTER_TILE = 2.25 / .47, PLASTER = "#f5f0e9", TIMBER = "#3a2c22", KNEE_Y = 1.19 / .47, WALL_Z = -6.25;
// The nameplate on the front of a box.glb box (below the handle hole, as in the game's box-object.js): icon, name,
// the count. 512 × 292 = the plate's 1.75 : 1.
function labelCanvas(folder, count, icon, pending = 0) {
  return makeCanvas(512, 292, (g, w, h) => {
    const ui = getComputedStyle(document.documentElement).getPropertyValue("--ui");
    g.fillStyle = "#f7f0de"; rr(g, 6, 6, w - 12, h - 12, 18); g.fill();
    g.strokeStyle = INK; g.lineWidth = 6; rr(g, 6, 6, w - 12, h - 12, 18); g.stroke();
    if (icon) g.drawImage(icon, 30, 54, 120, 120);
    g.fillStyle = "#33372b"; g.font = `700 64px ${ui}`; g.textBaseline = "middle";
    g.fillText(folder.name, 168, 114, w - 190);
    if (count > 0 || pending > 0) {
      const t = pending > 0 ? `+${pending}` : String(count);
      g.fillStyle = pending > 0 ? "#d9b768" : "#254c43"; rr(g, w - 178, h - 92, 148, 62, 31); g.fill();
      g.fillStyle = pending > 0 ? "#254c43" : "#faf4e3"; g.font = `700 40px ${ui}`; g.textAlign = "center"; g.fillText(t, w - 104, h - 60); g.textAlign = "left";
    }
  });
}

const objects = [];      // file things (from desktop icons)
const folders = [];      // folder icon → box
let wallpaper, floorMesh, room3d, shadowMap, guide = null;
const GUIDE_N = 10;
// Boxes: the user's box.glb (0.514 × 0.493 × 0.682 model units, front with the handle hole at +z) ×2.6, one row on the
// floor along the back wall — no cabinet, as in the game since 10-11 ("boxes stack, no shelf frames needed").
const BOX_SCALE = 2.6, BOX = { w: .514 * BOX_SCALE, h: .493 * BOX_SCALE, d: .682 * BOX_SCALE };
const SHELF_Z = -6.2 + BOX.d / 2, SHELF_Y = 0;
const slotX = [-3.45, -1.15, 1.15, 3.45];

async function buildGL() {
  const iconKinds = ["document", "photo", "video", "audio", "archive", "folder-sage", "folder-sand"];
  await Promise.all(iconKinds.map(async (k) => { iconImages[k] = await loader(`${DESK}/icons/${k}.webp`); }));
  const [wallImg, floorImg, plasterImg, boxModel] = await Promise.all([
    loader(`${DESK}/wallpaper.webp`), loader("./assets/landing/room-3d/attic-floor.webp"), loader("./assets/landing/room-3d/attic-plaster.webp"),
    new GLTFLoader().loadAsync("./models/box.glb").then((g) => g.scene).catch((e) => { console.warn("landing: box.glb", e); return null; }),
  ]);
  shadowMap = shadowTex();
  for (const k of iconKinds) textures["icon:" + k] = canvasTex(makeCanvas(160, 160, (g) => g.drawImage(iconImages[k], 0, 0, 160, 160)));
  for (const k of Object.keys(OBJECT_SIZE)) textures["face:" + k] = canvasTex(drawFace(k));
  textures.back = canvasTex(makeCanvas(64, 64, (g) => { g.fillStyle = "#ece3cd"; g.fillRect(0, 0, 64, 64); }));

  // ground, desk wallpaper, room
  const groundTex = new THREE.Texture(floorImg);
  groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = 8; groundTex.wrapS = groundTex.wrapT = THREE.MirroredRepeatWrapping;
  const fw = FLOOR.x1 - FLOOR.x0, fd = FLOOR.z1 - FLOOR.z0;
  groundTex.repeat.set(fw / FLOOR_TILE.w, fd / FLOOR_TILE.d); groundTex.needsUpdate = true;
  // the floor sits back in depth so the thin things on it never trade depth with it under vertex wobble (10-11 bug)
  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), basic({ map: groundTex, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 }));
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.set((FLOOR.x0 + FLOOR.x1) / 2, 0, (FLOOR.z0 + FLOOR.z1) / 2);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), basic({ color: FLOOR_BASE, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 }));
  base.rotation.x = -Math.PI / 2; base.position.y = -0.003;
  const wpTex = canvasTex(makeCanvas(2048, 1153, (g) => g.drawImage(wallImg, 0, 0, 2048, 1153)));
  wallpaper = new THREE.Mesh(new THREE.PlaneGeometry(W0 / 100, H0 / 100), basic({ map: wpTex, transparent: true, depthWrite: false }));
  wallpaper.rotation.x = -Math.PI / 2; wallpaper.position.y = 0.002; wallpaper.renderOrder = 1;
  scene.add(base, floorMesh, wallpaper);

  room3d = new THREE.Group();
  const plaster = (w, h, tint = "#ffffff") => {
    const tex = new THREE.Texture(plasterImg);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping; tex.repeat.set(w / PLASTER_TILE, h / PLASTER_TILE); tex.needsUpdate = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic({ map: tex, color: tint }));
  };
  const back = plaster(40, 9);
  back.position.set(0, 4.5, WALL_Z);
  const upper = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), basic({ color: PLASTER }));
  upper.position.set(0, 38.9, WALL_Z - .01); room3d.add(upper);
  room3d.add(back);
  for (const s of [-1, 1]) {
    const side = plaster(30, 9, "#ece6dc"); // the side walls a shade darker, turned from the light
    side.position.set(s * 10.5, 4.5, 0); side.rotation.y = -s * Math.PI / 2; room3d.add(side);
  }
  const timber = (w, h, d, x, y, z) => { const b = shadedBox(w, h, d, TIMBER); b.position.set(x, y, z); room3d.add(b); };
  timber(21, .22, .14, 0, .11, WALL_Z + .07);               // sill
  timber(21, .26, .16, 0, KNEE_Y, WALL_Z + .08);            // knee-wall beam
  // no posts: with the boxes in front they read as a railing (user, 10-13)
  // a window-light patch on the floor so the room reads as lit from the back-left
  // soft-edged (a hard-edged quad read as a pane of glass on the dark boards, 10-13)
  const sunTex = canvasTex(makeCanvas(128, 256, (g, w, h) => {
    const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, "rgba(255,243,210,0)"); gx.addColorStop(.3, "rgba(255,243,210,1)"); gx.addColorStop(.7, "rgba(255,243,210,1)"); gx.addColorStop(1, "rgba(255,243,210,0)");
    g.fillStyle = gx; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    const gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, "rgba(0,0,0,0)"); gy.addColorStop(.25, "#000"); gy.addColorStop(.8, "#000"); gy.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gy; g.fillRect(0, 0, w, h);
  }));
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7), basic({ map: sunTex, transparent: true, opacity: .2, depthWrite: false }));
  sun.rotation.set(-Math.PI / 2, 0, -.55); sun.position.set(-6.8, .004, -1.5); room3d.add(sun);
  scene.add(room3d);
  // The floor, the wallpaper and the walls are big quads of four corners each: vertex wobble snapped their corners on
  // their own, so during the tilt the base plane cut through the floor in flashes (user, 10-13). They don't wobble.
  for (const m of [floorMesh, base, wallpaper, ...room3d.children]) m.userData.noSnap = true;
  // light for the boxes only (toon, like the room); everything else here is unlit
  scene.add(new THREE.HemisphereLight("#fff4e2", "#8a6a4a", 2.3));
  const boxSun = new THREE.DirectionalLight("#fff1dc", 1.9); boxSun.position.set(-3, 8, 6); scene.add(boxSun);
  const gradient = toonGradient();
  const BOX_TINT = { sage: "#cfe0b6", sand: "#ffffff" };

  // file things
  const geo = {};
  const clusterFill = CLUSTERS.map(() => 0);
  const clusterCount = CLUSTERS.map((c) => files.filter((f) => c.kinds.includes(f.kind)).length);
  for (const it of files) {
    const [w, d] = OBJECT_SIZE[it.kind];
    const t = .032;
    geo[it.kind] ??= new THREE.BoxGeometry(w, t, d);
    const side = basic({ color: EDGE[it.kind], transparent: true });
    const face = basic({ map: textures["face:" + it.kind], transparent: true });
    const backMat = basic({ map: textures.back, transparent: true });
    const thing = new THREE.Mesh(geo[it.kind], [side, side, face, backMat, side, side]);
    thing.position.y = t / 2;
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(w, w), basic({ map: textures["icon:" + it.kind], transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    icon.rotation.x = -Math.PI / 2; icon.position.y = 0.004; icon.renderOrder = 2;
    const group = new THREE.Group();
    group.add(thing, icon);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic({ map: shadowMap, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; shadow.renderOrder = 1;
    scene.add(group, shadow);
    const ci = KIND_CLUSTER[it.kind], cl = CLUSTERS[ci], n = clusterFill[ci]++;
    const rows = Math.ceil(clusterCount[ci] / cl.cols), col = n % cl.cols, row = Math.floor(n / cl.cols);
    const target = { x: cl.center[0] + (col - (cl.cols - 1) / 2) * .98 + (R() - .5) * .1, z: cl.center[1] + (row - (rows - 1) / 2) * .8 + (R() - .5) * .08, rot: (R() - .5) * .3 };
    const [hx, hz] = toWorld(it.px, it.py);
    const order = (it.py / 100) * 0.07 + (it.px / 94) * 0.018 + R() * .05;
    const obj = { it, group, thing, icon, shadow, mats: [side, face, backMat], home: { x: hx, z: hz, rot: -it.deg * Math.PI / 180 }, target, rest: { ...target }, cluster: ci, order, thick: t,
      state: "floor", user: null, held: null, fly: null, size: [w, d] };
    thing.userData.obj = obj;
    objects.push(obj);
  }
  // folders → boxes
  FOLDERS.forEach((f, i) => {
    const it = items.find((x) => x.folder === i);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(.68, .68), basic({ map: textures[`icon:folder-${f.tone}`], transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    plane.renderOrder = 3;
    // the effect pass outlines every mesh's full quad; an icon cut out by its alpha would get a square ink frame.
    // On the game's text layer it is drawn after the effects, against the scene's depth, so it keeps its own outline.
    plane.layers.set(TEXT_LAYER);
    scene.add(plane);
    const labelTex = canvasTex(labelCanvas(f, 0, iconImages[`folder-${f.tone}`]));
    const box = new THREE.Group();
    if (boxModel) {
      const model = boxModel.clone(true);
      model.scale.setScalar(BOX_SCALE);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = [].concat(o.material).map((m) => new THREE.MeshToonMaterial({
          name: m.name, map: m.map ?? null, gradientMap: gradient,
          color: new THREE.Color(m.name === "box_body" || m.name === "box_front" ? BOX_TINT[f.tone] : "#ffffff"),
        }));
        if (o.material.length === 1) o.material = o.material[0];
      });
      box.add(model);
    } else box.add(shadedBox(BOX.w, BOX.h, BOX.d, f.tone === "sage" ? "#90a07c" : "#cfb185", { fiber: true })).children.at(-1).position.y = BOX.h / 2;
    // nameplate below the handle hole (box-object.js): 84% of the front's width, half its height, a hair in front
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(BOX.w * .84, BOX.w * .84 / 1.75), basic({ map: labelTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    plate.position.set(0, BOX.h * .36, BOX.d / 2 + .02);
    box.add(plate);
    const catcher = new THREE.Mesh(new THREE.BoxGeometry(BOX.w + .5, BOX.h + 1.4, BOX.d + .6), basic({ visible: false }));
    catcher.position.y = BOX.h / 2 + .45; catcher.userData.box = i; box.add(catcher);
    const rimGlow = new THREE.Mesh(new THREE.PlaneGeometry(BOX.w - .2, BOX.d - .2), basic({ color: "#fff1bf", transparent: true, opacity: 0, depthWrite: false }));
    rimGlow.rotation.x = -Math.PI / 2; rimGlow.position.y = .06; box.add(rimGlow);
    box.position.set(slotX[i], SHELF_Y, SHELF_Z + .05);
    scene.add(box);
    const [hx, hz] = toWorld(it.px, it.py);
    folders.push({ f, i, plane, box, catcher, rimGlow, labelTex, home: { x: hx, z: hz, rot: -it.deg * Math.PI / 180 }, tidy: toWorld(54, 45 + i * 100), shown: -1, glow: 0, bump: 0 });
  });
  // guide dots from the hand up to a box
  const dot = canvasTex(makeCanvas(64, 64, (g) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill(); }));
  guide = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: .24, map: dot, color: "#254c43", vertexColors: true, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  guide.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(GUIDE_N * 3), 3));
  guide.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(GUIDE_N * 4).fill(1), 4));
  guide.renderOrder = 6; guide.frustumCulled = false; guide.visible = false; scene.add(guide);
}

// ───────────── camera poses ─────────────
let topDistance = 10;
function fitTop() {
  const visibleH = vh / cover / 100;
  topDistance = visibleH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
}
const POSE_TOP = () => ({ tx: -safe.x / 100, ty: 0, tz: -safe.y / 100, pitch: 90, r: topDistance }); // follows the icons' safe-area shift (layoutWorld)
// The floor view backs off until every pile and every box sit inside the frame (any aspect).
let floorR = 11.5;
const POSE_FLOOR = () => ({ tx: 0, ty: .55, tz: -1.2, pitch: 35, r: floorR });
function setCamera(pose, cam = camera) {
  const ph = THREE.MathUtils.degToRad(pose.pitch);
  cam.position.set(pose.tx, pose.ty + pose.r * Math.sin(ph), pose.tz + pose.r * Math.cos(ph));
  cam.rotation.set(-ph, 0, 0);
}
function fitFloor() {
  if (!objects.length) return;
  const pts = [];
  for (const o of objects) for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3(o.target.x + sx * o.size[0] * .56, 0, o.target.z + sz * o.size[1] * .56));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3((sx < 0 ? slotX[0] : slotX.at(-1)) + sx * BOX.w / 2, SHELF_Y + BOX.h + .1, SHELF_Z + sz * BOX.d / 2));
  const cam = camera.clone(); cam.aspect = vw / vh; cam.updateProjectionMatrix();
  const mx = Math.max(16, vw * .03), top = vh * .04, bottom = vh - 86, q = new THREE.Vector3();
  for (let r = 11.5; r < 40; r += .25) {
    setCamera({ tx: 0, ty: .55, tz: -1.2, pitch: 35, r }, cam); cam.updateMatrixWorld();
    const fits = pts.every((v) => { q.copy(v).project(cam); const x = (q.x + 1) / 2 * vw, y = (1 - q.y) / 2 * vh; return x >= mx && x <= vw - mx && y >= top && y <= bottom; });
    if (fits) { floorR = r; return; }
  }
  floorR = 40;
}
const mixPose = (a, b, t) => Object.fromEntries(Object.keys(a).map((k) => [k, lerp(a[k], b[k], t)]));

// ───────────── progress & input ─────────────
// The story only ever rests on a finished scene. One scroll gesture plays the whole next transition;
// the in-between frames are never a place to stop.
let prog = 0, gateOpen = false, blocked = 0, gateSince = 0, lastNudge = 0, nudges = 0, demoTimer = 0;
const RESTS = [0, B.dive[1], GATE, B.back[1], 1]; // the cleared floor runs straight on into the tidy desktop
const SEG_MS = [2800, 3800, 4900, 1900];           // RESTS[i] → RESTS[i + 1]; the dive was 1.7 s, felt rushed next to the intro video (2026-10-08)
const BACK_MS = 1450;                              // empty floor → tidy desktop
let tween = null, arrivedAt = 0, autoClearAt = 0;
const atRest = () => !tween && RESTS.some((r) => Math.abs(r - prog) < 1e-4);
function travelMs(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  let ms = 0;
  for (let i = 0; i < SEG_MS.length; i++) {
    const s0 = RESTS[i], s1 = RESTS[i + 1], o = Math.min(hi, s1) - Math.max(lo, s0);
    if (o > 0) ms += SEG_MS[i] * o / (s1 - s0);
  }
  return b < a ? ms * .7 : ms;
}
function goTo(to, durMs = 0) {
  if (to == null || noGL || !room.ready) return;
  if (!gateOpen && to > GATE) {
    if (prog >= GATE - 1e-4) { blockedAttempt(); return; }
    to = GATE;
  }
  if (Math.abs(to - prog) < 1e-5) return;
  if (reduced) { veilTo(to); return; }
  // floor already empty: nothing happens in the clear beat, so start right at its end and only play the rise to the desktop
  if (!tween && Math.abs(prog - GATE) < 1e-4 && to >= B.back[1] - 1e-4 && objects.length && !floorFree().length) {
    prog = B.clear[1];
    durMs = BACK_MS + (to > B.back[1] ? travelMs(B.back[1], to) : 0);
  }
  const now = performance.now(), dur = durMs || Math.max(250, travelMs(prog, to)), d = to - prog;
  let m0 = .5 * d, lo = Math.min(prog, to), hi = Math.max(prog, to);
  if (tween) {
    // turning around mid-move keeps the momentum: the scene carries on a little, slows, and comes back
    // (never past where it was heading)
    const v = tweenVel(tween, now) * dur;
    m0 = Math.sign(v) === Math.sign(d) ? v : v * .6;
    lo = Math.min(lo, tween.lo); hi = Math.max(hi, tween.hi);
  }
  tween = { from: prog, to, t0: now, dur, m0, m1: .5 * d, lo, hi };
}
// Cubic Hermite in normalised time: start/end tangents m0/m1 are in progress units per whole tween.
function tweenAt(tw, now) {
  const t = clamp((now - tw.t0) / tw.dur), t2 = t * t, t3 = t2 * t;
  return { t, p: (2 * t3 - 3 * t2 + 1) * tw.from + (t3 - 2 * t2 + t) * tw.m0 + (-2 * t3 + 3 * t2) * tw.to + (t3 - t2) * tw.m1 };
}
function tweenVel(tw, now) {
  const t = clamp((now - tw.t0) / tw.dur), t2 = t * t;
  return ((6 * t2 - 6 * t) * tw.from + (3 * t2 - 4 * t + 1) * tw.m0 + (-6 * t2 + 6 * t) * tw.to + (3 * t2 - 2 * t) * tw.m1) / tw.dur;
}
// Reduced motion: no camera moves at all. The page dips to paper, the next finished scene is put in place, and it comes back.
let veilBusy = false;
function veilTo(to) {
  if (veilBusy) return;
  veilBusy = true; veil.style.opacity = "1";
  setTimeout(() => {
    prog = to; arrivedAt = performance.now();
    if (Math.abs(prog - GATE) < 1e-4) { resetIdle(); openGate(); }
    requestAnimationFrame(() => requestAnimationFrame(() => { veil.style.opacity = "0"; setTimeout(() => { veilBusy = false; }, 240); }));
  }, 220);
}
function step(dir) {
  if (enter) return; // walking into the laptop: the page is about to leave
  if (tween && Math.sign(tween.to - tween.from) === dir) return; // already heading there
  if (!tween && performance.now() - arrivedAt < 450) return;      // every finished scene is seen for a moment
  const list = dir > 0 ? RESTS : [...RESTS].reverse();
  goTo(list.find((r) => (dir > 0 ? r > prog + 1e-4 : r < prog - 1e-4)) ?? null);
}
// Wheel: one gesture = one step. A trackpad's momentum tail keeps arriving after the move ends,
// so the wheel re-arms only after a short quiet gap.
let wheelAcc = 0, lastWheel = 0, armed = true;
addEventListener("wheel", (e) => {
  if (e.target instanceof Element && e.target.closest(".lab")) return;
  e.preventDefault();
  const now = performance.now(), d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  if (now - lastWheel > 180) { wheelAcc = 0; armed = true; }
  lastWheel = now;
  if (!armed || !d) return;
  wheelAcc += d;
  if (tween && Math.sign(wheelAcc) === Math.sign(tween.to - tween.from)) { wheelAcc = 0; return; }
  if (Math.abs(wheelAcc) >= 24) { armed = false; const dir = Math.sign(wheelAcc); wheelAcc = 0; step(dir); }
}, { passive: false });
let touchY = null, touchUsed = false;
stage.addEventListener("touchstart", (e) => { if (!tryActive()) { touchY = e.touches[0].clientY; touchUsed = false; } }, { passive: true });
stage.addEventListener("touchmove", (e) => {
  if (touchY == null || touchUsed) return;
  const dy = touchY - e.touches[0].clientY;
  if (Math.abs(dy) > 36) { touchUsed = true; step(Math.sign(dy)); }
}, { passive: true });
stage.addEventListener("touchend", () => { touchY = null; });
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target.closest?.("a,button,select,input,.lab") || e.repeat) return;
  if (e.key === "Enter" && Math.abs(prog - GATE) < 1e-4 && !gateOpen && !demoTimer && !demoNext && !hand.active && tryActive()) { e.preventDefault(); nudge(); autoDemo(); return; }
  if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); step(1); }
  if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); step(-1); }
});

// ───────────── the hands-on stop ─────────────
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const hand = { active: false, sticky: false, pointerId: null, anchor: new THREE.Vector3(), floor: new THREE.Vector3(), list: [], overBox: -1 };
const deposits = FOLDERS.map(() => 0);
const tryActive = () => prog >= B.try[0] - .004 && prog < B.clear[0] - .002 && !reduced;
function rayFrom(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
const planeAt = (y) => new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
const floorFree = () => objects.filter((o) => o.state === "floor");
function pickThing() {
  const hits = raycaster.intersectObjects(floorFree().map((o) => o.thing), false);
  return hits[0]?.object.userData.obj ?? null;
}
// A box counts only if the pointer reaches it before the floor: the catchers are generous and reach below the floor,
// so without this a click on a back-row file would drop straight into the box behind it.
const floorHit = new THREE.Vector3();
function pickBox() {
  const h = raycaster.intersectObjects(folders.map((f) => f.catcher), false);
  if (!h[0]) return -1;
  if (raycaster.ray.intersectPlane(planeAt(0), floorHit) && h[0].distance > raycaster.ray.origin.distanceTo(floorHit)) return -1;
  return h[0].object.userData.box;
}
function grab(o, delay = 0) {
  if (o.state !== "floor") return;
  o.state = "held"; o.held = { i: hand.list.length, x: o.group.position.x, y: o.group.position.y, z: o.group.position.z, t0: performance.now(), delay }; hand.list.push(o);
  if (hand.list.length === 1) { heldSince = performance.now(); callBoxes(); }
}
// Pressing on a file picks up its whole pile: the clicked one first, then the rest come flying in, nearest first.
// (Piles are the kind groups on the floor; music and video share one pile and one box.)
function grabPile(o) {
  const pile = floorFree().filter((t) => t.cluster === o.cluster)
    .sort((a, b) => Math.hypot(a.group.position.x - o.group.position.x, a.group.position.z - o.group.position.z) - Math.hypot(b.group.position.x - o.group.position.x, b.group.position.z - o.group.position.z));
  pile.forEach((t, k) => grab(t, Math.min(k, 16) * 24));
}
// While something is in hand, the boxes answer: they hop in turn, and dots run from the hand to the box in that column.
let callT0 = -1e9, heldSince = 0;
function callBoxes() { callT0 = performance.now(); folders.forEach((F) => { F.kickAt = callT0 + F.i * 80; }); }
const REACH = .62; // world units around the pointer path that join the hand
let prevFloor = null, hoverObj = null;
function nearestFree(point, reach) {
  let best = null, dist = reach;
  for (const t of floorFree()) { const d = Math.hypot(t.group.position.x - point.x, t.group.position.z - point.z); if (d < dist) { dist = d; best = t; } }
  return best;
}
function segmentDistance(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
  const t = len ? clamp(((px - a.x) * dx + (pz - a.z) * dz) / len) : 0;
  return Math.hypot(px - a.x - t * dx, pz - a.z - t * dz);
}
// Two ways to carry things, both always on:
//  · press, sweep, let go over a box (drag)
//  · click a file → it stays in hand and follows the pointer → click a box (the game's two-beat "담기 → 넣기")
// While carrying after a click, more clicks on files add to the hand; a click on bare floor sets the hand down there.
let downAt = null;
canvas.addEventListener("pointerdown", (e) => {
  if (!tryActive() || e.button !== 0) return;
  rayFrom(e);
  downAt = { x: e.clientX, y: e.clientY, t: performance.now(), had: hand.list.length };
  if (!hand.active) { hand.active = true; heldSince = performance.now(); }
  hand.sticky = false; hand.pointerId = e.pointerId; canvas.setPointerCapture(e.pointerId);
  stage.dataset.holding = "true"; resetIdle(); prevFloor = null; hoverObj = null;
  moveHand(true, true);
});
canvas.addEventListener("pointermove", (e) => {
  if (!tryActive()) return;
  rayFrom(e);
  if (!hand.active) {
    const floor = new THREE.Vector3(); raycaster.ray.intersectPlane(planeAt(0), floor);
    hoverObj = pickThing() ?? nearestFree(floor, REACH * .8);
    canvas.style.cursor = hoverObj ? "grab" : "default";
    return;
  }
  moveHand(!hand.sticky); // carrying after a click: the hand follows, but only a press picks things up
});
function moveHand(sweep, press = false) {
  raycaster.ray.intersectPlane(planeAt(1.05), hand.anchor);
  raycaster.ray.intersectPlane(planeAt(0), hand.floor);
  if (press) { const o = pickThing() ?? nearestFree(hand.floor, REACH * .8); if (o) grabPile(o); }
  if (sweep) {
    const o = pickThing(); if (o) grab(o);
    // the whole path since the last event counts, so a fast sweep does not skip things
    const from = prevFloor ?? hand.floor;
    for (const t of floorFree()) if (segmentDistance(t.group.position.x, t.group.position.z, from, hand.floor) < REACH) grab(t);
    prevFloor = hand.floor.clone();
  }
  hand.overBox = pickBox();
  // over the cabinet the box catchers can be missed between cells: use the nearest box
  if (hand.overBox < 0 && hand.list.length && hand.anchor.z < SHELF_Z + 1.6) {
    let best = -1, dist = 1.4;
    folders.forEach((F) => { const d = Math.abs(F.box.position.x - hand.anchor.x); if (d < dist) { dist = d; best = F.i; } });
    hand.overBox = best;
  }
}
function release(e) {
  if (!hand.active) return;
  try { canvas.releasePointerCapture(hand.pointerId); } catch {}
  // a press that did not travel is a click, however long it lasted (slow frames or a slow finger must not turn it into a drop)
  const click = e && e.type === "pointerup" && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8;
  const pickedNow = downAt ? hand.list.length > downAt.had : false;
  downAt = null;
  // a click that picked something up (not on a box) keeps it in hand; a click on bare floor while carrying sets it down
  if (click && pickedNow && hand.overBox < 0) { hand.sticky = true; resetIdle(); return; }
  hand.active = false; hand.sticky = false; stage.dataset.holding = "false";
  const box = hand.overBox, list = hand.list; hand.list = []; hand.overBox = -1;
  if (box >= 0) depositInto(list, box);
  else list.forEach((o, i) => { const a = i * 2.4, r = i ? .32 * Math.sqrt(i) : 0; o.state = "floor"; o.held = null; o.rest = { x: hand.floor.x + Math.cos(a) * r, z: hand.floor.z + Math.sin(a) * r, rot: (R() - .5) * .5 }; o.user = { mode: "dropped" }; });
  resetIdle();
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointerleave", () => { if (!hand.active) hoverObj = null; });
canvas.addEventListener("pointercancel", () => { hand.sticky = false; release(); });
function slotIn(box, n) { const f = folders[box]; return { x: f.box.position.x + ((n % 5) - 2) * .2, y: SHELF_Y + BOX.h * .5 + Math.min(n, 30) * .022, /* box.glb is deep: start halfway up so the pile shows over the rim */ z: f.box.position.z + ((n % 2) ? .12 : -.1), rot: (n % 3 - 1) * .2 }; }
function depositInto(list, box) {
  const now = performance.now();
  list.forEach((o, i) => {
    const s = slotIn(box, deposits[box] + i);
    o.state = "flying"; o.fly = { from: { x: o.group.position.x, y: o.group.position.y, z: o.group.position.z }, to: s, t0: now + i * 35, dur: 520, box };
  });
  deposits[box] += list.length;
  folders[box].bump = 1;
  if (!list.length) return;
  depositCount++;
  // Nothing is put away for you: one click picks up a whole pile, so four round trips empty the floor.
  // The last pile: the camera starts rising while its cards are still dropping into the box.
  if (!gateOpen && !floorFree().length && !hand.list.length) { openGate(); autoClearAt = now + FLOOR_LOOK; return; }
  setTimeout(() => { if (!gateOpen) { nudge(); lastNudge = performance.now(); nudges = 1; } }, 520 + list.length * 35);
}
const FLOOR_LOOK = 650, READY_LEAD = 950;
let depositCount = 0, demoNext = 0;
function openGate() { if (gateOpen) return; gateOpen = true; stage.dataset.try = "done"; }
function resetIdle() { gateSince = performance.now(); lastNudge = gateSince; }
function blockedAttempt() {
  const now = performance.now();
  nudge(); lastNudge = now;
  if (++blocked >= 3 && now - gateSince > 4000 && !demoTimer && !demoNext && !hand.active) autoDemo();
}
let nudgeT0 = -1e9, nudgeCluster = 1;
function nudge() {
  if (reduced) { nudgeT0 = performance.now(); return; }
  const free = floorFree(); if (!free.length) return;
  const counts = CLUSTERS.map((_, c) => free.filter((o) => o.cluster === c).length);
  nudgeCluster = counts.indexOf(Math.max(...counts));
  nudgeT0 = performance.now(); nudges++;
}
// Passive viewers (scrolling at the stop) are shown the same gesture: a pile gathers into the hand and goes into its box,
// pile after pile until the floor is empty.
function autoDemo() {
  const list = floorFree().filter((o) => o.cluster === nudgeCluster);
  if (!list.length) { if (!floorFree().length) { openGate(); autoClearAt = performance.now() + FLOOR_LOOK; } return; }
  const box = CLUSTERS[nudgeCluster].box;
  const c = list.reduce((s, o) => [s[0] + o.group.position.x, s[1] + o.group.position.z], [0, 0]).map((v) => v / list.length);
  hand.anchor.set(c[0], 1.05, c[1]);
  grabPile(list.reduce((a, o) => (Math.hypot(o.group.position.x - c[0], o.group.position.z - c[1]) < Math.hypot(a.group.position.x - c[0], a.group.position.z - c[1]) ? o : a)));
  demoTimer = setTimeout(() => {
    demoTimer = 0;
    const held = hand.list; hand.list = [];
    depositInto(held, box);
    if (floorFree().length) demoNext = setTimeout(() => { demoNext = 0; if (!gateOpen && tryActive() && !hand.active) { nudge(); autoDemo(); } }, 1100);
  }, 750);
}
function resetTry() {
  if (demoTimer) { clearTimeout(demoTimer); demoTimer = 0; }
  if (demoNext) { clearTimeout(demoNext); demoNext = 0; }
  depositCount = 0;
  hand.active = false; hand.list = []; deposits.fill(0); gateOpen = false; blocked = 0; nudges = 0; autoClearAt = 0; callT0 = -1e9; stage.dataset.try = "closed";
  for (const o of objects) { o.state = "floor"; o.user = null; o.held = null; o.fly = null; o.rest = { ...o.target }; }
}

// ───────────── per-frame scene composition ─────────────
let lastBeat = "", glReady = false, tidyBuilt = false;
const autoBoxed = (o) => o.user == null || o.user.mode === "dropped";
function boxCounts(p) {
  const counts = [...deposits];
  if (p < B.clear[0]) return counts;
  // past the clear beat everything left on the floor has gone into its pile's box, however we got here
  if (p >= B.clear[1]) { for (const o of objects) if (autoBoxed(o) && o.state === "floor") counts[CLUSTERS[o.cluster].box]++; return counts; }
  if (!clearPlan.size) computeClearOrder();
  const t = local("clear", p);
  for (const o of objects) if (autoBoxed(o) && o.state === "floor" && clearU(o, t) >= 1) counts[CLUSTERS[o.cluster].box]++;
  return counts;
}
// "The rest goes the same way": each remaining pile is swept together, lifted and carried to its box,
// one pile after another, so it reads as the same gesture repeated (not as files sorting themselves).
const clearPlan = new Map();
let clearPiles = 0;
const CLEAR_LEN = .4;
function clearStart(k) { return clearPiles > 1 ? .03 + k * ((.94 - CLEAR_LEN) / (clearPiles - 1)) : .25; }
function clearU(o, t) { const P = clearPlan.get(o); return P ? clamp((t - clearStart(P.k)) / CLEAR_LEN) : 0; }
function computeClearOrder() {
  const list = objects.filter((o) => autoBoxed(o) && o.state === "floor");
  const piles = [...new Set(list.map((o) => o.cluster))].map((c) => {
    const members = list.filter((o) => o.cluster === c);
    const cx = members.reduce((a, o) => a + o.rest.x, 0) / members.length, cz = members.reduce((a, o) => a + o.rest.z, 0) / members.length;
    members.sort((a, b) => Math.hypot(b.rest.x - cx, b.rest.z - cz) - Math.hypot(a.rest.x - cx, a.rest.z - cz));
    return { c, members, cx, cz };
  }).sort((a, b) => a.cx - b.cx);
  clearPiles = piles.length;
  piles.forEach((P, k) => P.members.forEach((o, i) => clearPlan.set(o, { k, i, n: P.members.length, cx: P.cx, cz: P.cz })));
}

function arc(from, to, u, height) {
  return { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) + Math.sin(Math.PI * u) * height, z: lerp(from.z, to.z, u) };
}
function placeShadow(o, x, z, y, alpha = 1) {
  const s = Math.max(o.size[0], o.size[1]) * (1.35 + y * .5);
  o.shadow.position.set(x + y * .12, .003, z + y * .1);
  o.shadow.scale.set(s, s * .8, 1);
  o.shadow.material.opacity = clamp(.85 - y * .35) * alpha;
}
// Dots rise from the stack in hand toward the cabinet and fade out before they reach it: "up there",
// never "this box" — which box is right is the person's call (CLAUDE.md §11). The boxes hopping say "into a box".
let guideA = 0;
function updateGuide(holding, now) {
  if (!guide) return;
  const show = holding && hand.overBox < 0 && now - heldSince > 220;
  guideA += ((show ? 1 : 0) - guideA) * .18;
  guide.material.opacity = guideA * .78; guide.visible = guideA > .02;
  if (!guide.visible) return;
  let j = 0; slotX.forEach((x, i) => { if (Math.abs(x - hand.anchor.x) < Math.abs(slotX[j] - hand.anchor.x)) j = i; });
  const n = Math.min(hand.list.length, 24);
  const a = { x: hand.anchor.x, y: hand.anchor.y + n * .028 + .06, z: hand.anchor.z };
  // lands on the face of the box (the part the camera can see), arching over the floor on the way
  const b = { x: slotX[j], y: SHELF_Y + BOX.h * .62, z: SHELF_Z + .05 + BOX.d / 2 + .08 };
  const c = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + .9, z: lerp(a.z, b.z, .6) };

  const pos = guide.geometry.attributes.position.array, col = guide.geometry.attributes.color.array, phase = (now / 900) % 1;
  for (let i = 0; i < GUIDE_N; i++) {
    const t = .03 + .8 * ((i + phase) / GUIDE_N), u = 1 - t;
    col[i * 4 + 3] = smooth(.03, .12, t) * (1 - smooth(.34, .62, t));
    pos[i * 3] = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
    pos[i * 3 + 1] = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
    pos[i * 3 + 2] = u * u * a.z + 2 * u * t * c.z + t * t * b.z;
  }
  guide.geometry.attributes.position.needsUpdate = true; guide.geometry.attributes.color.needsUpdate = true;
}
function showThing(o, showIcon, alpha = 1) {
  o.icon.visible = showIcon; o.thing.visible = !showIcon;
  o.icon.material.opacity = alpha;
  for (const m of o.mats) m.opacity = alpha;
}

// Damped spring (semi-implicit Euler in small fixed substeps so it stays stable on slow frames).
// zeta < 1 overshoots a little and settles: the weight in the hand.
function spring(st, target, freq, zeta, dt) {
  const w = 2 * Math.PI * freq, n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) { st.v += (-w * w * (st.x - target) - 2 * zeta * w * st.v) * h; st.x += st.v * h; }
  return st.x;
}
let lastGL = 0;
function frameGL(p, now) {
  const dt = Math.min(1 / 20, Math.max(0, (now - (lastGL || now)) / 1000)); lastGL = now;
  const fall = fallU(p), back = local("back", p);
  // camera: top-down → floor in "fall", floor → top-down in "back"
  const toFloor = inOut(smooth(.12, .78, fall)), toTop = inOut(smooth(0, .62, back));
  const pose = p < B.back[0] ? mixPose(POSE_TOP(), POSE_FLOOR(), toFloor) : mixPose(POSE_FLOOR(), POSE_TOP(), toTop);
  setCamera(pose);
  wallpaper.material.opacity = p < B.back[0] ? 1 - smooth(.18, .58, fall) : smooth(.34, .74, back);
  room3d.visible = pose.pitch < 86;

  if (p < B.try[0] - .004 && (gateOpen || deposits.some(Boolean) || objects.some((o) => o.user))) resetTry();
  if (p < B.clear[0]) clearPlan.clear(); else if (!clearPlan.size) computeClearOrder();

  const clearT = local("clear", p), nudgeAge = (now - nudgeT0) / 1000;
  for (const o of objects) {
    let x, y, z, rot = 0, flip = 0, lean = 0, icon = false, alpha = 1, scale = 1;
    if (p < B.fall[0]) { x = o.home.x; z = o.home.z; y = .004; icon = true; rot = o.home.rot; scale = .68 / o.size[0]; }
    else if (p < B.try[0]) {
      const u = clamp((fall - .22 - o.order * .55) / .32);
      const e = inOut(u);
      ({ x, y, z } = arc({ x: o.home.x, y: .004, z: o.home.z }, { x: o.target.x, y: o.thick / 2, z: o.target.z }, e, 1.5));
      rot = lerp(o.home.rot, o.target.rot, e); flip = u * Math.PI * 2; icon = u < .25; scale = lerp(.68 / o.size[0], 1, smooth(.15, .6, u));
    } else if (o.state === "held") {
      const i = o.held.i, fan = (i % 7 - 3) * .05;
      const tx = hand.anchor.x + fan, ty = hand.anchor.y + Math.min(i, 24) * .028, tz = hand.anchor.z + (i % 2 ? .04 : -.04);
      const H = o.held, f = 5.2 - Math.min(i, 12) * .18;
      H.sx ??= { x: H.x, v: 0 }; H.sy ??= { x: H.y, v: 0 }; H.sz ??= { x: H.z, v: 0 };
      const far = Math.hypot(tx - H.sx.x, tz - H.sz.x), lift = Math.min(.7, far * .18);
      if (reduced) { H.sx.x = tx; H.sy.x = ty; H.sz.x = tz; H.sx.v = H.sy.v = H.sz.v = 0; }
      else if (now - H.t0 >= (H.delay || 0)) { spring(H.sx, tx, f, .6, dt); spring(H.sy, ty + lift, f * 1.1, .8, dt); spring(H.sz, tz, f, .6, dt); }
      x = H.x = H.sx.x; y = H.y = H.sy.x; z = H.z = H.sz.x; rot = fan * 2; scale = .82;
      flip = clamp(H.sz.v * .05, -.32, .32); lean = clamp(-H.sx.v * .05, -.32, .32);
    } else if (o.state === "flying" || o.state === "boxed") {
      const f = o.fly, u = o.state === "boxed" ? 1 : clamp((now - f.t0) / f.dur);
      if (u >= 1 && o.state === "flying") o.state = "boxed";
      const e = inOut(u);
      ({ x, y, z } = arc(f.from, { x: f.to.x, y: f.to.y, z: f.to.z }, e, 1.1));
      rot = f.to.rot * e; scale = lerp(o.state === "boxed" ? .5 : .82, .5, e);
      if (p >= B.back[0]) alpha = 1 - smooth(.05, .3, back);
    } else {
      // resting on the floor; in "clear" it sweeps itself into its cluster's box
      const r = o.rest; x = r.x; z = r.z; y = o.thick / 2; rot = r.rot;
      if (p >= B.clear[0] && clearPlan.has(o)) {
        const u = clearU(o, clearT), box = CLUSTERS[o.cluster].box, P = clearPlan.get(o);
        if (u > 0) {
          const g = inOut(smooth(0, .3, u)), l = inOut(smooth(.3, .44, u)), f = inOut(smooth(.44 + P.i * .004, 1, u));
          const fan = (P.i % 7 - 3) * .05;
          const pile = { x: P.cx + fan, y: o.thick / 2 + P.i * .03 + l * 1.0, z: P.cz + (P.i % 2 ? .04 : -.04) };
          const s = slotIn(box, deposits[box] + P.i);
          if (f <= 0) { x = lerp(r.x, pile.x, g); z = lerp(r.z, pile.z, g); y = lerp(o.thick / 2, pile.y, g) + Math.sin(Math.PI * g) * .08; }
          else ({ x, y, z } = arc(pile, s, f, 1.0));
          rot = f > 0 ? lerp(fan * 2, s.rot, f) : lerp(r.rot, fan * 2, g);
          scale = f > 0 ? lerp(.82, .5, f) : lerp(1, .82, g);
        }
        if (p >= B.back[0]) alpha = 1 - smooth(.05, .3, back);
      }
      o.hv ??= { x: 0, v: 0 };
      const hoverOn = o === hoverObj && o.state === "floor" && !hand.active ? 1 : 0;
      if (reduced) o.hv.x = hoverOn; else spring(o.hv, hoverOn, 6, .45, dt);
      y += o.hv.x * .07; scale *= 1 + o.hv.x * .05;
      // "ready" wave just before the rest is put away: piles hop once, left to right
      if (autoClearAt && o.state === "floor" && !reduced) {
        const a = (now - (autoClearAt - READY_LEAD)) / 1000 - PILE_RANK[o.cluster] * .16 - o.order * .12;
        if (a > 0 && a < .36) { const w = Math.sin(Math.PI * a / .36); y += w * .15; rot += w * .08; }
      }
      if (o.cluster === nudgeCluster && nudgeAge < 1.1 && o.state === "floor") {
        const w = Math.max(0, Math.sin(clamp((nudgeAge - o.order * .5) / .45) * Math.PI));
        if (reduced) scale *= 1 + .06 * Math.sin(Math.min(1, nudgeAge) * Math.PI); else { y += w * .16; rot += w * .12; }
      }
    }
    o.group.position.set(x, y, z);
    o.group.rotation.set(flip, rot, lean, "YXZ");
    o.group.scale.setScalar(scale);
    showThing(o, icon, alpha);
    o.group.visible = alpha > .01;
    const onFloor = !(o.state === "flying" || o.state === "boxed") || p < B.try[0];
    const piled = o.state === "held" ? o.held.i : (p >= B.clear[0] && clearU(o, clearT) > .2) ? clearPlan.get(o)?.i ?? 0 : 0;
    const shadowA = piled > 0 ? 0 : o.state === "held" || (p >= B.clear[0] && clearU(o, clearT) > .2) ? .55 : 1;
    placeShadow(o, x, z, Math.max(0, y - .02), (onFloor && o.group.visible && !(p >= B.clear[0] && clearU(o, clearT) > .85)) ? alpha * (icon ? 0 : 1) * shadowA : 0);
  }

  // folders: rise to the back wall and become boxes in the second part of "fall", come back as tidy icons in "back"
  const shelf = shelfU(p), counts = boxCounts(p);
  const holding = hand.active && hand.list.length > 0;
  if (holding && hand.overBox < 0 && now - callT0 > 2600) callBoxes();
  updateGuide(holding, now);
  for (const F of folders) {
    const u = clamp((shelf - .08 - F.i * .1) / .58), slot = { x: slotX[F.i], y: SHELF_Y + BOX.h * .55, z: SHELF_Z + BOX.d / 2 + .15 };
    let px, py, pz, rx = -Math.PI / 2, s = 1, planeA = 1, boxS = 0, rz = 0;
    if (p < B.back[0]) {
      const e = inOut(u);
      ({ x: px, y: py, z: pz } = arc({ x: F.home.x, y: .006, z: F.home.z }, slot, e, 1.4));
      rx = lerp(-Math.PI / 2, 0, smooth(.1, .8, u)); s = lerp(1, 1.5, e); rz = lerp(F.home.rot, 0, e);
      planeA = 1 - smooth(.72, .95, u); boxS = outBack(smooth(.68, 1, u));
    } else {
      const v = clamp((back - .18 - F.i * .05) / .5), e = inOut(v);
      const tidy = { x: F.tidy[0], y: .006, z: F.tidy[1] };
      ({ x: px, y: py, z: pz } = arc(slot, tidy, e, 1.2));
      rx = lerp(0, -Math.PI / 2, smooth(.2, .9, v)); s = lerp(1.5, 1, e);
      planeA = smooth(0, .3, v); boxS = 1 - smooth(0, .35, v);
    }
    F.plane.position.set(px, py, pz); F.plane.rotation.set(rx, 0, rz); F.plane.scale.setScalar(s);
    F.plane.material.opacity = planeA; F.plane.visible = planeA > .01;
    // a deposit squashes the box and it wobbles back; the call makes each box hop in turn
    F.bs ??= { x: 0, v: 0 }; F.hy ??= { x: 0, v: 0 };
    if (F.bump) { if (!reduced) F.bs.v -= 3.4; F.bump = 0; }
    if (F.kickAt && now >= F.kickAt) { if (!reduced) F.hy.v += 5.2; F.kickAt = 0; }
    spring(F.bs, 0, 4.2, .35, dt); spring(F.hy, 0, 3.3, .42, dt);
    const sq = F.bs.x, sb = Math.max(.001, boxS);
    F.box.visible = boxS > .01; F.box.scale.set(sb * (1 - sq * .45), sb * (1 + sq * .9), sb * (1 - sq * .45));
    F.box.position.y = SHELF_Y + Math.max(-.012, F.hy.x);
    const hop = clamp(F.hy.x / .14);
    const over = hand.active && hand.overBox === F.i;
    const target = over ? 1 : hop > 0 ? .7 * hop : (p >= B.try[0] && p < B.clear[0] && !gateOpen && nudgeAge < 1.4 && CLUSTERS[nudgeCluster].box === F.i) ? .6 * Math.sin(clamp(nudgeAge / 1.4) * Math.PI) : 0;
    F.glow += (target - F.glow) * .2; F.rimGlow.material.opacity = F.glow * .55;
    const pending = over ? hand.list.length : 0, key = `${counts[F.i]}|${pending}`;
    if (key !== F.shown) {
      F.shown = key;
      const cv = labelCanvas(F.f, counts[F.i], iconImages[`folder-${F.f.tone}`], pending);
      F.labelTex.image = cv; F.labelTex.needsUpdate = true;
    }
  }
  insidePass.render(renderer, scene, camera);
  return counts;
}

// ───────────── 3D room ─────────────
// Renders the room at walk-in t and returns the laptop screen's corners in plate px (the 1672×941 world the desktop
// and the title live in). null until room.glb is in; the poster (a still of the same camera) covers that wait.
function roomQuad(t) {
  const q = room.render(t, W0 * cover, H0 * cover);
  if (!q) return null;
  const ox = (vw - W0 * cover) / 2, oy = (vh - H0 * cover) / 2;
  return q.map(([x, y]) => [(x - ox) / cover, (y - oy) / cover]);
}
const insidePass = renderer ? new StyledPass(renderer, room.style) : null;
// the review panel: always on the prototype page, on the real landing only with ?lab
const showLab = stage.dataset.lab === "always" || new URLSearchParams(location.search).has("lab");
const lab = initLab({ room, insidePass, seek: (v) => jump(v), get progress() { return prog; }, B, GATE, panel: showLab, posterPath: (cam) => `./assets/landing/room-3d/poster-${cam}.webp` });

// ───────────── the way in: the button → into the laptop → app.html (10-09 plan, 10-11 3D) ─────────────
// One button on the tidied room. It plays the walk-in once more, into the tidied laptop; when the screen fills the
// frame the browser goes to app.html. Before leaving, this page's address becomes #end, so the browser's back button
// returns to the tidied room rather than to the start of the story. A modified click (new tab) is left alone.
const ENTER_MS = 1900;
const APP_MISSING = stage.dataset.app === "missing"; // the claude.ai review copy has no app.html
let enter = null;
function enterU(now) {
  if (!enter) return 0;
  const t = enter.dur ? clamp((now - enter.t0) / enter.dur) : 1;
  return enter.back ? 1 - t : t;
}
cta.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!room.ready || tween || Math.abs(prog - 1) > 1e-4) return; // no 3D room: a plain link
  e.preventDefault();
  if (enter) return;
  enter = { t0: performance.now(), dur: reduced ? 0 : ENTER_MS, href: a.href };
  if (reduced) veil.style.opacity = "1";
});
function finishEnter(now) {
  if (!enter || enter.done || (enter.dur && now - enter.t0 < enter.dur)) return;
  if (enter.back) { enter = null; return; }
  enter.done = true;
  try { history.replaceState(null, "", "#end"); } catch { /* a viewer may refuse; back then starts the story over */ }
  if (APP_MISSING) {
    // review copy: say where it would go, then step back out into the room
    showNote("여기서 정리방(app.html)으로 넘어가요. 검토 사본에는 없어서 방으로 돌아올게요.");
    setTimeout(() => { enter = { t0: performance.now(), dur: ENTER_MS * .7, back: true }; veil.style.opacity = "0"; }, 1500);
    return;
  }
  location.href = enter.href;
}
function showNote(text) {
  let n = document.querySelector(".enter-note");
  if (!n) { n = document.createElement("p"); n.className = "enter-note"; n.setAttribute("role", "status"); stage.append(n); }
  n.textContent = text; n.dataset.on = "true";
  setTimeout(() => { n.dataset.on = "false"; }, 2600);
}
// Back from app.html: the browser may restore this page exactly as it left it (zoomed into the screen) or load it
// fresh at #end. Either way the story rests on the tidied room.
function restAtEnd() { enter = null; veil.style.opacity = "0"; jump(1); }
addEventListener("pageshow", (e) => { if (e.persisted && location.hash === "#end") restAtEnd(); });

// ───────────── DOM composition per frame ─────────────
function frameDOM(p, counts) {
  const dive = local("dive", p), out = local("out", p);
  const glOn = p >= B.fall[0] && p < B.out[0];
  canvas.hidden = !glOn;
  // room → laptop: the camera walks up to the 3D laptop and the desktop rides on its screen
  if (p < B.fall[0]) {
    room.setState("messy");
    roomCanvas.hidden = false;
    const q3 = roomQuad(dive);
    roomCanvas.style.opacity = String(1 - smooth(.9, 1, dive));
    // depth of field: the camera focuses on the screen, so the room goes soft as it closes in
    const blur = lab.blur ? 6 * smooth(.18, .75, dive) : 0;
    roomCanvas.style.filter = blur > .15 ? `blur(${blur.toFixed(2)}px)` : "none";
    if (paintRef) paintRef.style.opacity = lab.overlay && dive < .02 ? ".42" : "0";
    if (deskMode !== "messy") buildDesk("messy");
    if (q3) {
      // the walk-in ends square on the screen; the last stretch only squares the 1.72:1 screen to the 16:9 plate
      const w = smooth(.8, 1, dive);
      const quad = q3.map((pt, i) => [lerp(pt[0], FULL[i][0], w), lerp(pt[1], FULL[i][1], w)]);
      const m = quadMatrix(W0, H0, quad);
      desk.style.transform = deskChrome.style.transform = m; featherDesk(quad);
    }
    desk.style.opacity = q3 ? String(smooth(.006, .04, p)) : "0"; // the laptop screen lights up as the scroll begins
    for (const it of items) {
      const el = it.el; if (!el) continue;
      const a = (p - it.popP) / POP_LEN;
      if (a <= 0) { el.style.opacity = "0"; continue; }
      const s = a < 1 ? lerp(.2, 1, outBack(a)) : 1, drop = 1 - Math.pow(1 - clamp(a * 1.3), 3);
      el.style.opacity = String(clamp(a * 4));
      el.style.transform = `translateY(${(1 - drop) * -14}px) rotate(${it.deg}deg) scale(${s})`;
    }
    deskChrome.style.opacity = String(smooth(.55, .9, dive));
    fitChrome(smooth(.8, 1, dive));
    desk.hidden = false;
  } else if (p < B.out[0]) {
    roomCanvas.hidden = true; desk.hidden = true; if (paintRef) paintRef.style.opacity = "0";
    const fall = fallU(p), back = local("back", p);
    deskChrome.style.transform = "none"; desk.style.setProperty("--fe", "0px");
    fitChrome(1);
    deskChrome.style.opacity = p < B.back[0] ? String(1 - smooth(0, .14, fall)) : String(smooth(.82, 1, back));
    desk.style.transform = "none";
  } else {
    // tidy desktop on the laptop, the camera stepping back into the tidied room (the same walk, reversed)
    if (deskMode !== "tidy" || !tidyBuilt) { buildDesk("tidy", counts); tidyBuilt = true; }
    room.setState("tidy");
    roomCanvas.hidden = false; if (paintRef) paintRef.style.opacity = "0";
    // after the button: the same walk-in again, into the tidied laptop (enterU 0 → 1)
    const eu = enterU(performance.now());
    const q3 = roomQuad(Math.max(1 - out, inOut(eu)));
    roomCanvas.style.opacity = String(smooth(0, .12, out) * (1 - smooth(.9, 1, eu)));
    const blur = lab.blur ? 6 * Math.max(1 - smooth(.25, .82, out), smooth(.18, .75, eu)) : 0;
    roomCanvas.style.filter = blur > .15 ? `blur(${blur.toFixed(2)}px)` : "none";
    if (q3) {
      const w = Math.max(1 - smooth(0, .2, out), smooth(.8, 1, eu));
      const quad = q3.map((pt, i) => [lerp(pt[0], FULL[i][0], w), lerp(pt[1], FULL[i][1], w)]);
      desk.style.transform = deskChrome.style.transform = quadMatrix(W0, H0, quad); featherDesk(quad);
    }
    desk.hidden = false; desk.style.opacity = String(Math.max(1 - smooth(.86, 1, out) * .15, smooth(0, .2, eu)));
    deskChrome.style.opacity = String(Math.max(1 - smooth(.1, .3, out), smooth(.55, .9, eu)));
    fitChrome(Math.max(1 - smooth(0, .2, out), smooth(.8, 1, eu)));
  }
  if (p < B.out[0]) tidyBuilt = false;
  // title: visible on the first room, back with the buttons on the last
  const tIn = (p < .5 ? 1 - smooth(.012, .05, p) : smooth(.72, .92, out)) * (1 - smooth(0, .2, enterU(performance.now())));
  title.style.opacity = String(tIn);
  title.style.visibility = tIn < .01 ? "hidden" : "visible";
  cta.hidden = !(noGL || (p >= B.out[0] && out > .7));
  cta.inert = !!enter;
  // the scroll cue appears only on a finished scene that a scroll can leave (not at the hands-on stop)
  const atStop = Math.abs(p - GATE) < 1e-4 && (!gateOpen || autoClearAt);
  const cueOn = !noGL && atRest() && p < 1 - 1e-4 && !atStop && !hand.active && (p < 1e-4 || performance.now() - arrivedAt > 1300);
  cue.style.opacity = cueOn ? "1" : "0";
}

// ───────────── loop ─────────────
// Debug / test seek (no UI): jumping past the stop counts as having passed it.
function jump(v) {
  if (v > GATE && !gateOpen) { gateOpen = true; stage.dataset.try = "done"; }
  tween = null; prog = clamp(v); arrivedAt = performance.now();
}
// Screen-reader description of each finished scene (the visible page stays wordless).
const SCENE_TEXT = new Map([
  [0, "밤의 다락방. 스탠드가 켜진 책상 위에 노트북이 있고 바닥에 파일이 흩어져 있습니다. 아래로 스크롤하면 노트북 화면으로 들어갑니다."],
  [B.dive[1], "파일 아이콘이 가득한 바탕화면. 계속 스크롤하면 아이콘이 방바닥의 물건이 되고 폴더는 벽 수납장의 상자가 됩니다."],
  [GATE, "바닥에 종류별로 모인 파일 더미 네 개와 수납장의 상자 네 개. 더미를 누르면 통째로 집히고, 상자를 누르면 그 안에 들어갑니다. 키보드에서는 Enter를 누르면 시연이 재생됩니다."],
  [B.back[1], "더미가 모두 상자에 들어가고, 상자는 정리된 바탕화면의 폴더 네 개가 되었습니다."],
  [1, "아침 해가 드는 정리된 방. 바닥에 흩어져 있던 파일이 모두 치워졌습니다. 정리방 들어가기 버튼을 누르면 노트북 화면으로 들어갑니다."],
]);
let announced = -1;
function announce(p) {
  if (arrivedAt === announced || !atRest()) return;
  announced = arrivedAt;
  for (const [r, text] of SCENE_TEXT) if (Math.abs(r - p) < 1e-4) { sceneStatus.textContent = text; return; }
}

function loop(now) {
  if (tween) {
    const { t, p: tp } = tweenAt(tween, now);
    prog = clamp(tp, tween.lo, tween.hi);
    if (t >= 1) {
      prog = tween.to; tween = null; arrivedAt = now;
      if (Math.abs(prog - GATE) < 1e-4) { resetIdle(); if (reduced) openGate(); }
    }
  }
  const p = prog;
  if (hand.active && !tryActive()) release();
  stage.dataset.try = p >= B.try[0] - .004 && p < B.clear[0] ? (gateOpen ? "done" : "open") : "closed";
  if (p >= B.try[0] - .004 && p < B.clear[0] && !gateOpen) {
    if (!gateSince) resetIdle();
    if (!hand.active && now - lastNudge > (nudges < 1 ? 2500 : nudges < 3 ? 4000 : 6000)) { nudge(); lastNudge = now; }
  } else gateSince = 0;
  // the rest goes on time even if a hand is still busy: whatever is in it lands in the box below it, or on the floor
  // (and from there goes with its pile)
  if (gateOpen && autoClearAt && now > autoClearAt && !tween && Math.abs(p - GATE) < 1e-4) { if (hand.active) { hand.sticky = false; release(); } autoClearAt = 0; goTo(B.back[1]); }
  // The WebGL room only exists between the desktop hand-off and the pull-back; skip it elsewhere.
  const counts = glReady && p >= B.fall[0] && p < B.out[0] ? frameGL(p, now) : glReady ? boxCounts(p) : FOLDERS.map(() => 0);
  frameDOM(p, counts);
  finishEnter(now);
  stage.dataset.scene = p < .1 || p >= B.out[0] + .03 ? "room" : "inside";
  announce(p);
  requestAnimationFrame(loop);
}
function resize() {
  layoutWorld(); fitTop();
  if (renderer) {
    // the inside-the-laptop scene follows the room's device quality (render-quality.js): same pixel cap and scale
    const q = room.quality;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.profile.maxDpr) * q.scale);
    renderer.setSize(vw, vh, false); insidePass?.resize();
  }
  room.resize(vw, vh);
  camera.aspect = vw / vh; camera.updateProjectionMatrix();
  fitFloor();
}
room.onQuality = (q) => { insidePass?.setEffects(q.profile.effects); resize(); };
new ResizeObserver(resize).observe(stage);
resize();
if (noGL) stage.dataset.still = "true";
else buildGL().then(() => { glReady = true; fitFloor(); }).catch((e) => console.error("landing GL", e));
// room.glb (4 MB); the poster shows the same camera until they are in, then fades out
facesReady.then(() => room.load("./models/room.glb")).then(() => {
  room.setStyle(lab.style);
  stage.dataset.room = "ready";
  if (cameBack) restAtEnd();
  setTimeout(() => { poster.style.opacity = "0"; }, 60);
  setTimeout(() => room.warm(), 400); // after the first frames, before anyone reaches the last room
}).catch((e) => {
  console.error("landing room", e);
  stage.dataset.room = "failed";
  const box = document.querySelector(".loading");
  if (box) box.textContent = `3D 방을 불러오지 못했어요 (${e?.message ?? e}). 지금 보이는 건 정지 이미지예요.`;
});
requestAnimationFrame(loop);
// ───────────── site nav (css/site-nav.css) ─────────────
// Shown on arrival, tucked up after 3 s so the story has the whole screen, back when the pointer touches the top edge
// or a nav link gets keyboard focus. Not while a pile is in the hand (the boxes sit high on the screen).
// Touch screens and pens have no "near the top" without a tap, so there it simply stays.
const topNav = $("#topNav");
const NAV_HOLD = 3000, NAV_EDGE = 28, NAV_LEAVE = 700;
let navTimer = 0;
const navOpen = () => topNav.dataset.state === "open";
function navSet(open) { clearTimeout(navTimer); navTimer = 0; topNav.dataset.state = open ? "open" : "closed"; }
function navCloseLater(ms) { clearTimeout(navTimer); navTimer = setTimeout(() => { navTimer = 0; if (!topNav.matches(":hover, :focus-within")) navSet(false); }, ms); }
if (topNav && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  navCloseLater(NAV_HOLD);
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    if (!navOpen()) { if (e.clientY <= NAV_EDGE && !hand.active && !hand.list.length) navSet(true); }
    else if (e.clientY > topNav.offsetHeight + 24 && !navTimer) navCloseLater(NAV_LEAVE);
  }, { passive: true });
  topNav.addEventListener("pointerenter", () => { if (navOpen()) { clearTimeout(navTimer); navTimer = 0; } });
  topNav.addEventListener("pointerleave", () => navCloseLater(NAV_LEAVE));
  topNav.addEventListener("focusin", () => navSet(true));
  topNav.addEventListener("focusout", () => navCloseLater(NAV_LEAVE));
}

// ───────────── mouse parallax (10-13, user) ─────────────
// The room camera leans a little towards the pointer (room-layer.js LOOK). Mouse only; reduced motion keeps it still;
// leaving the window or the tab puts it back to straight ahead.
if (!reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") room.setLook(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
  }, { passive: true });
  addEventListener("mouseout", (e) => { if (!e.relatedTarget) room.setLook(0, 0); });
  addEventListener("blur", () => room.setLook(0, 0));
}

window.__coziumLanding = window.__animatic = { get navState() { return topNav?.dataset.state; }, seek: (v) => jump(v), step, holdEnter: (u) => { enter = u == null ? null : { t0: performance.now() - u * 1e9, dur: 1e9, href: "" }; }, get progress() { return prog; }, get moving() { return !!tween; }, objects, folders, camera, canvas, hand, room, get gateOpen() { return gateOpen; }, get floorR() { return floorR; } };
