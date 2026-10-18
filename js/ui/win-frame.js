/**
 * win-frame.js — 바탕화면 창 끌기·크기 바꾸기 (2026-10-18, 사용자: 요약 창이 작아 스크롤이 생겨 모서리를 잡고 늘리려 했는데 안 됨).
 *
 * 창 가장자리 8곳(네 변·네 모서리)에 손잡이를 붙인다. 진짜 운영체제 창처럼 커서가 바뀌고 끌면 그쪽으로 늘어난다.
 * 바탕화면(container) 밖으로는 못 나간다(작업표시줄 위까지). 최소 크기는 minW·minH.
 */
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** container 안에서 창이 차지할 수 있는 사각형(바탕화면 테두리·작업표시줄 빼고). */
function limits(container, inset) {
  // 바탕화면 단위(큰 화면에서는 CSS zoom이 걸려 있다 — desk-scale.js)
  return { left: inset.left, top: inset.top, right: container.clientWidth - inset.right, bottom: container.clientHeight - inset.bottom };
}
const zoomOf = (el) => el.currentCSSZoom || 1;

export function enableResize(win, { container, minW = 360, minH = 260, inset = { left: 30, top: 30, right: 30, bottom: 120 }, onChange = () => {} }) {
  for (const edge of EDGES) {
    const handle = document.createElement("span");
    handle.className = `win-grip win-grip-${edge}`;
    handle.dataset.edge = edge;
    handle.setAttribute("aria-hidden", "true");
    win.append(handle);
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight };
      const box = limits(container, inset);
      win.classList.add("is-resizing");
      Object.assign(win.style, { left: `${start.left}px`, top: `${start.top}px`, right: "auto", width: `${start.w}px`, height: `${start.h}px`, maxHeight: "none", transition: "none", animation: "none" });
      const move = (e) => {
        const z = zoomOf(win), dx = (e.clientX - start.x) / z, dy = (e.clientY - start.y) / z;
        let { left, top, w, h } = start;
        if (edge.includes("e")) w = Math.min(Math.max(minW, start.w + dx), box.right - left);
        if (edge.includes("s")) h = Math.min(Math.max(minH, start.h + dy), box.bottom - top);
        if (edge.includes("w")) { const nl = Math.max(box.left, Math.min(start.left + dx, start.left + start.w - minW)); w = start.w + (start.left - nl); left = nl; }
        if (edge.includes("n")) { const nt = Math.max(box.top, Math.min(start.top + dy, start.top + start.h - minH)); h = start.h + (start.top - nt); top = nt; }
        Object.assign(win.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        win.classList.remove("is-resizing");
        onChange();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }
}

/** 제목줄을 잡고 끈다. 단추·입력 위에서는 안 끈다. */
export function enableDrag(win, bar, { container, inset = { left: 30, top: 30, right: 30, bottom: 120 }, onChange = () => {} }) {
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, a, input")) return;
    bar.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop };
    const box = limits(container, inset);
    Object.assign(win.style, { left: `${start.left}px`, top: `${start.top}px`, right: "auto", transition: "none", animation: "none" });
    const move = (e) => {
      const z = zoomOf(win);
      const left = Math.min(Math.max(box.left, start.left + (e.clientX - start.x) / z), box.right - 160);
      const top = Math.min(Math.max(box.top, start.top + (e.clientY - start.y) / z), box.bottom - 60);
      Object.assign(win.style, { left: `${left}px`, top: `${top}px` });
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
      onChange();
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  });
}

/** 다시 열 때 손으로 바꾼 자리·크기를 지운다. */
export function resetFrame(win) {
  for (const key of ["left", "top", "right", "width", "height", "maxHeight", "transition", "animation"]) win.style[key] = "";
}
