// Review panel for the 3D landing prototype: camera candidates, light, material and the game's three effects, applied to
// the room (and optionally to the scene inside the laptop). The settings live in the address (#cam=A&light=sun…), so a
// combination can be sent as a link or as the one line the copy button gives. Remembered per browser when storage works.
import { CAMERAS, LIGHTS, MATERIALS } from "./room-layer.js";
import { INKS } from "./outline-ink.js";

const GROUPS = [
  ["cam", "카메라", Object.fromEntries(Object.entries(CAMERAS).map(([k, c]) => [k, `${k} ${c.label}`]))],
  ["light", "처음 방 빛", LIGHTS],
  ["lightEnd", "정리된 방 빛", LIGHTS],
  ["mat", "재질", MATERIALS],
  ["outline", "외곽선", { 0: "0", 1: "1px", 2: "2px", 3: "3px", 4: "4px" }],
  ["ink", "외곽선 색", Object.fromEntries(Object.entries(INKS).map(([k, v]) => [k, v.label]))],
  ["dither", "디더링", { off: "끔", fine: "Fine", medium: "Medium", coarse: "Coarse" }],
  ["wobble", "정점 흔들림", { off: "끔", subtle: "Subtle", wobble: "Wobble", ps1: "PS1" }],
  ["tone", "톤 매핑", { none: "없음(게임)", aces: "ACES", agx: "AgX" }],
];
const TOGGLES = [["rays", "햇살 줄기 (오후 햇살 방에서)"], ["inside", "노트북 안 장면에도 효과"], ["blur", "다가갈 때 방 흐림"], ["overlay", "원화 겹쳐 보기(첫 장면)"]];
const KEY = "cozium-landing3d-lab-v2"; // v2 (10-11): the user's pick became the default

export function initLab({ room, insidePass, seek, B, GATE, panel = true, posterPath = (cam) => `./posters/${cam}.webp` }) {
  const defaults = { ...room.style, rays: true, inside: true, blur: true, overlay: false };
  if (!panel) {
    // the real landing: the chosen look, nothing stored, no panel
    const style = { ...defaults };
    room.setStyle(style); insidePass?.set(style);
    return { style, get blur() { return style.blur; }, get overlay() { return false; } };
  }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* private window */ }
  const fromHash = location.hash === "#end" ? {} : Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  for (const k of ["rays", "inside", "blur", "overlay"]) if (k in fromHash) fromHash[k] = fromHash[k] === "1";
  const style = { ...defaults, ...saved, ...fromHash };
  for (const [k, , opts] of GROUPS) if (!(String(style[k]) in opts)) style[k] = defaults[k];

  const el = document.createElement("aside");
  el.className = "lab"; el.dataset.open = "false";
  el.innerHTML = `<button class="lab-toggle" type="button" aria-expanded="false">렌더 테스트</button>
    <div class="lab-body" role="group" aria-label="렌더 테스트"></div>`;
  const body = el.querySelector(".lab-body"), toggle = el.querySelector(".lab-toggle");
  toggle.addEventListener("click", () => {
    const open = el.dataset.open !== "true";
    el.dataset.open = String(open); toggle.setAttribute("aria-expanded", String(open));
  });

  for (const [key, label, opts] of GROUPS) {
    const row = document.createElement("div"); row.className = "lab-row";
    row.innerHTML = `<span class="lab-label">${label}</span><div class="lab-seg"></div>`;
    const seg = row.querySelector(".lab-seg");
    for (const [v, text] of Object.entries(opts)) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.dataset.v = v;
      b.addEventListener("click", () => set({ [key]: key === "outline" ? +v : v }));
      seg.append(b);
    }
    row.dataset.key = key;
    body.append(row);
  }
  const toggles = document.createElement("div"); toggles.className = "lab-checks";
  for (const [key, label] of TOGGLES) {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" data-key="${key}"> ${label}`;
    l.querySelector("input").addEventListener("change", (e) => set({ [key]: e.target.checked }));
    toggles.append(l);
  }
  body.append(toggles);

  const jumps = document.createElement("div"); jumps.className = "lab-row";
  jumps.innerHTML = `<span class="lab-label">장면</span><div class="lab-seg"></div>`;
  for (const [text, v] of [["처음 방", 0], ["노트북 안", B.dive[1]], ["직접 담기", GATE], ["정리된 방", 1]]) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = text;
    b.addEventListener("click", () => seek(v));
    jumps.querySelector(".lab-seg").append(b);
  }
  body.append(jumps);

  const foot = document.createElement("div"); foot.className = "lab-foot";
  foot.innerHTML = `<code class="lab-code"></code><button type="button" class="lab-copy">설정 복사</button><button type="button" class="lab-reset">고른 설정으로</button>`;
  body.append(foot);
  const code = foot.querySelector(".lab-code");
  foot.querySelector(".lab-copy").addEventListener("click", async (e) => {
    const text = summary();
    try { await navigator.clipboard.writeText(text); e.target.textContent = "복사됨"; } catch { e.target.textContent = "위 줄을 직접 복사"; }
    setTimeout(() => { e.target.textContent = "설정 복사"; }, 1600);
  });
  foot.querySelector(".lab-reset").addEventListener("click", () => set({ ...defaults }));
  document.body.append(el);

  function summary() {
    return GROUPS.map(([k]) => `${k}=${style[k]}`).concat(TOGGLES.map(([k]) => `${k}=${style[k] ? 1 : 0}`)).join("&");
  }
  function paint() {
    for (const row of body.querySelectorAll(".lab-row[data-key]")) {
      for (const b of row.querySelectorAll("button")) b.setAttribute("aria-pressed", String(String(style[row.dataset.key]) === b.dataset.v));
    }
    for (const i of body.querySelectorAll("input[data-key]")) i.checked = !!style[i.dataset.key];
    code.textContent = summary();
  }
  function set(patch) {
    Object.assign(style, patch);
    room.setStyle(style);
    insidePass?.set(style);
    const poster = document.getElementById("poster");
    if (poster && !room.ready) poster.src = posterPath(style.cam);
    try { localStorage.setItem(KEY, JSON.stringify(style)); } catch { /* fine */ }
    if (location.hash !== "#end") try { history.replaceState(null, "", "#" + summary()); } catch { /* the review viewer may refuse */ }
    paint();
  }
  set({});
  return {
    style,
    get blur() { return style.blur; },
    get overlay() { return style.overlay; },
  };
}
