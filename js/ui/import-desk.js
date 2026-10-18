/**
 * import-desk.js — 가져오기 화면 = 노트북 바탕화면 (2026-10-18, 사용자 선택).
 *
 * 랜딩이 노트북 화면으로 들어가 끝나는데, 그 바탕화면이 곧 이 화면이다. 여기는 보이는 것만 맡는다:
 * 창 끌기·앞으로 오기, 작업표시줄 시계, Helper 트레이 불, 드롭한 항목을 바탕화면 아이콘으로 깔기, 방으로 떠나는 연출.
 * 파일 읽기·연결·시작은 전부 onboarding.js(Onboarding)가 한다. 이 모듈은 파일을 읽지 않는다.
 */
import { extensionOf, familyOf } from "./layout.js";
import { enableResize } from "./win-frame.js";

const ICONS = "./assets/landing/parts/desktop-v4/icons/";
const ICON_BY_FAMILY = { image: "photo", design: "photo", video: "video", audio: "audio", archive: "archive" };
const CELL = { w: 100, h: 104 };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function iconFor(item) {
  return `${ICONS}${ICON_BY_FAMILY[familyOf(item.extension ?? extensionOf(item.name))] ?? "document"}.webp`;
}

export function mountImportDesk({ root, startSample }) {
  const $ = (selector) => root.querySelector(selector);
  const desk = $(".desk");
  const files = $("#desk-files");
  const importWin = $("#win-import");
  const helperWin = $("#mode-helper");
  const trayHelper = $("#tray-helper");
  const clock = $("#tray-clock");
  let shownKey = "";
  let movedAside = false;
  let importLeft = null; // 가져오기 창이 비켜 선 자리(옮기는 중에는 offsetLeft가 아직 옛 자리라 따로 기억)

  // ── 시계 ──
  const tick = () => {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = `${now.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}\n${now.getMonth() + 1}. ${now.getDate()}.`;
  };
  tick();
  setInterval(tick, 15000);

  // ── 창: 제목줄을 잡고 끈다, 누르면 앞으로 ──
  const front = (win) => {
    for (const other of root.querySelectorAll(".win")) other.classList.toggle("is-front", other === win);
  };
  // 위치는 바탕화면 단위(client/offset)로 잰다(zoom이 걸려도 맞게. 지금은 안 건다 — 10-18 사용자: 큰 화면 배율은 랜딩만).
  const deskBox = () => ({ width: desk.clientWidth, height: desk.clientHeight });
  const zoom = () => desk.currentCSSZoom || 1;
  const clampInto = (win, left, top) => {
    const bounds = deskBox();
    return {
      left: Math.min(Math.max(left, 30), bounds.width - Math.min(win.offsetWidth, 160) - 30),
      top: Math.min(Math.max(top, 30), bounds.height - 120),
    };
  };
  const place = (win, left, top) => {
    const p = clampInto(win, left, top);
    Object.assign(win.style, { left: `${p.left}px`, top: `${p.top}px`, right: "auto" });
    return p;
  };
  for (const win of root.querySelectorAll(".win")) {
    win.addEventListener("pointerdown", () => front(win));
    const bar = win.querySelector(".win-bar");
    bar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const start = { x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop };
      bar.setPointerCapture(event.pointerId);
      win.style.transition = "none";
      const move = (e) => place(win, start.left + (e.clientX - start.x) / zoom(), start.top + (e.clientY - start.y) / zoom());
      const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up); };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    });
  }


  // 창 가장자리·모서리를 끌어 크기 바꾸기(10-18, 결과 창과 같은 손잡이)
  for (const win of [importWin, helperWin]) enableResize(win, { container: desk, minW: 340, minH: 240, inset: { left: 30, top: 30, right: 30, bottom: 56 + 30 + 12 } });

  const openHelper = () => {
    helperWin.hidden = false;
    front(helperWin);
    helperWin.querySelector("input")?.focus({ preventScroll: true });
    syncPressed();
  };
  const syncPressed = () => {
    for (const el of root.querySelectorAll('.tb-app[data-desk="helper"]')) el.setAttribute("aria-pressed", String(!helperWin.hidden));
  };

  // ── 아이콘·작업표시줄 단추 ──
  root.addEventListener("click", (event) => {
    const el = event.target.closest("[data-desk]");
    if (!el) return;
    const what = el.dataset.desk;
    if (what === "sample") startSample();
    else if (what === "helper") helperWin.hidden ? openHelper() : (helperWin.hidden = true, syncPressed());
    else if (what === "helper-close") { helperWin.hidden = true; syncPressed(); }
    else if (what === "import") { importWin.hidden = false; front(importWin); importWin.querySelector("#start-web:not(:disabled), #load-sample")?.focus({ preventScroll: true }); }
  });
  if (new URLSearchParams(location.search).has("helper")) openHelper();

  // ── 드롭한 항목을 바탕화면에 깐다(폴더 먼저, 위에서 아래로 줄을 채우고 다음 줄) ──
  function layoutFiles(state) {
    const items = [
      ...state.folders.map((folder, i) => ({ name: folder.name, icon: `${ICONS}folder-sand.webp`, out: i >= state.maxBoxes })),
      ...state.files.map((file) => ({ name: file.name, icon: iconFor(file) })),
    ];
    const key = `${items.length}|${items.slice(0, 3).map((it) => it.name).join("/")}`;
    if (key === shownKey) return;
    shownKey = key;
    files.replaceChildren();
    if (!items.length) return;

    // 파일이 처음 들어오면 가져오기 창을 오른쪽(그림 쪽)으로 비켜 준다. 아이콘은 왼쪽 크림 벽지에 깔린다.
    const bounds = deskBox();
    if (!movedAside && bounds.width > 820) {
      movedAside = true;
      importWin.style.transition = reduced() ? "none" : "left 0.45s cubic-bezier(.3,.8,.3,1), top 0.45s cubic-bezier(.3,.8,.3,1)";
      importLeft = place(importWin, bounds.width - importWin.offsetWidth - Math.max(70, bounds.width * 0.07), Math.max(70, bounds.height * 0.11)).left;
    }
    const left0 = 44 + CELL.w + 18, top0 = 44;
    const right = bounds.width > 820 ? Math.min(importLeft ?? importWin.offsetLeft, bounds.width) - 24 : bounds.width - 30;
    const bottom = bounds.height - 56 - 30 - 30;
    const rows = Math.max(1, Math.floor((bottom - top0) / CELL.h));
    const cols = Math.max(1, Math.floor((right - left0) / CELL.w));
    const capacity = rows * cols;
    const shown = items.length > capacity ? items.slice(0, capacity - 1) : items;
    const fragment = document.createDocumentFragment();
    shown.forEach((item, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      fragment.append(icon(item, left0 + col * CELL.w, top0 + row * CELL.h, i));
    });
    if (shown.length < items.length) {
      const i = shown.length, more = icon({ name: `외 ${items.length - shown.length}개`, icon: `${ICONS}document.webp` }, left0 + Math.floor(i / rows) * CELL.w, top0 + (i % rows) * CELL.h, i);
      more.classList.add("more");
      more.querySelector("b").textContent = `+${items.length - shown.length}`;
      fragment.append(more);
    }
    files.append(fragment);
  }

  function icon(item, x, y, i) {
    const li = document.createElement("li");
    li.className = "desk-file";
    li.style.left = `${x}px`;
    li.style.top = `${y}px`;
    // 하나씩 점점 빠르게 나타난다(랜딩 바탕화면과 같은 느낌)
    li.style.animationDelay = `${Math.min(1.2, Math.sqrt(i) * 0.09)}s`;
    if (item.out) li.dataset.out = "true";
    const img = document.createElement("img");
    img.src = item.icon;
    img.alt = "";
    const name = document.createElement("span");
    name.textContent = item.name;
    li.append(img, document.createElement("b"), name);
    li.title = item.out ? `${item.name} — 상자는 한 번에 20개까지라 이번엔 빠짐` : item.name;
    return li;
  }

  return {
    refresh(state) {
      trayHelper.dataset.on = String(state.helper);
      trayHelper.title = state.helper ? "Desktop Helper 연결됨" : "Desktop Helper 연결 안 됨";
      if (state.helper && helperWin.hidden) openHelper();
      layoutFiles(state);
    },
    /** 방으로 떠난다: 아이콘이 아래로 떨어지고 창이 접히고 화면이 어두워진다. */
    leave() {
      if (reduced()) return Promise.resolve();
      const bounds = desk.getBoundingClientRect(), z = zoom();
      const falling = [...root.querySelectorAll(".desk-file, .desk-icons li")];
      falling.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--y", `${(r.top - bounds.top) / z}px`);
        el.style.animationDelay = `${Math.min(0.25, (r.left / Math.max(1, bounds.width)) * 0.25 + (i % 5) * 0.012)}s`;
        el.style.setProperty("--spin", `${(i % 2 ? 1 : -1) * (6 + (i % 7) * 3)}deg`);
      });
      root.classList.add("is-leaving");
      return new Promise((resolve) => setTimeout(resolve, 820));
    },
    /** 시작이 실패해 이 화면에 남았으면 떠나던 연출을 되돌린다. */
    restore() {
      if (!root.hidden) root.classList.remove("is-leaving");
    },
  };
}
