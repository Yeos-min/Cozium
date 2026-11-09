// 연필 손그림 테두리(2026-11-07 사용자 A안: 정리방 UI도 랜딩 말풍선과 같은 「연필 + 크림 종이」로).
// [data-pen] 요소의 크기를 재서, 손으로 두 번 그은 둥근 사각(진한 선 + 살짝 비낀 옅은 선)을 요소 맨 뒤에 깐다.
// 크기가 바뀌면(글꼴이 늦게 들어옴, 문구가 바뀜, 창이 열림) ResizeObserver가 다시 그린다 —
// 11-07 사용자 지적 「WASD·Ctrl 오른쪽 여백이 없음」은 글꼴이 들어오기 전 크기로 그려서였다.
//
//   data-pen="paper"  종이 채움 + 연필 선(버튼·칩)
//   data-pen="ink"    먹 채움 + 연필 선(주 버튼: 「새 폴더」 「방에 들어가기」)
//   data-pen="line"   선만(키캡 kbd)
//   data-pen="sheet"  창 한 장: 종이는 CSS가 칠하고, 연필 선은 안쪽 12px에(어두운 배경 위라 바깥 선은 안 보임)
//
// 색·굵기는 css/room-paper.css(.pen). 쓰는 곳: js/app.js(정리방), js/ui/room-intro.js(정리 시작 화면).

const NS = "http://www.w3.org/2000/svg";
const drawn = new WeakSet();

/** 둥근 사각 경로. o = 두 번째 선의 어긋남, seed = 요소마다 다른 손떨림 */
function penPath(w, h, seed, o) {
  const small = h < 34, r = Math.min(small ? 9 : 14, h / 2.4, w / 2.4);
  const j = (k) => Math.sin(seed * 12.9 + k * 7.3) * (small ? 0.55 : 1.05);
  return `M${r + o} ${1.5 - o + j(1)} Q${w / 2} ${-1 + o * 0.5 + j(2)} ${w - r} ${1.5 + o} Q${w - 0.5} ${1 + o * 0.5} ${w - 1 - o} ${r} ` +
    `L${w - 1.5 + o + j(3)} ${h - r} Q${w - 1} ${h - 1} ${w - r} ${h - 1.5 + o} Q${w / 2} ${h + j(4) * 0.6} ${r} ${h - 1 - o} ` +
    `Q1 ${h - 1} ${1.5 + o} ${h - r} L${1 - o + j(5)} ${r} Q1 1 ${r + o} ${1.5 - o + j(1)}Z`;
}

// 글자로 만든 고정 seed — 다시 그려도 같은 손떨림
const seedOf = (el) => [...(el.textContent || el.className || "x")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) / 97;

function draw(el) {
  const kind = el.dataset.pen;
  const inset = kind === "sheet" ? 12 : 0;
  const w = Math.round(el.offsetWidth) - inset * 2, h = Math.round(el.offsetHeight) - inset * 2;
  let svg = el.querySelector(":scope > svg.pen");
  if (w < 4 || h < 4) { svg?.remove(); return; }
  if (!svg) {
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "pen");
    svg.setAttribute("aria-hidden", "true");
    el.prepend(svg);
  }
  if (svg.dataset.size === `${w}x${h}`) return;
  svg.dataset.size = `${w}x${h}`;
  svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.style.left = svg.style.top = `${inset}px`;
  const seed = seedOf(el), d0 = penPath(w, h, seed, 0), d1 = penPath(w, h, seed, h < 34 ? 0.9 : 1.2);
  const fill = kind === "paper" ? "f" : kind === "ink" ? "fi" : null;
  svg.innerHTML = `${fill ? `<path class="${fill}" d="${d0}"/>` : ""}<path class="s" d="${d0}"/><path class="s2" d="${d1}"/>`;
}

const sizes = new ResizeObserver((entries) => { for (const e of entries) draw(e.target); });

function watch(el) {
  if (drawn.has(el)) return;
  drawn.add(el);
  sizes.observe(el);
}

/** root 안의 [data-pen]과 kbd에 연필 테두리. 나중에 들어오는 것(안내 문구 속 kbd 등)도 따라간다 */
export function pencilize(root) {
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    const self = (selector) => (node.matches(selector) ? [node] : []);
    for (const k of [...self("kbd"), ...node.querySelectorAll("kbd")]) k.dataset.pen ??= "line";
    for (const el of [...self("[data-pen]"), ...node.querySelectorAll("[data-pen]")]) watch(el);
  };
  scan(root);
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) scan(n);
      // 글을 innerHTML·textContent로 바꾸면 깔아 둔 테두리도 같이 지워진다 → 다시 그림
      if (m.target instanceof Element && drawn.has(m.target) && !m.target.querySelector(":scope > svg.pen")) draw(m.target);
    }
  }).observe(root, { childList: true, subtree: true });
}

/** 연필 마우스 그림. button: none | left | right(누르는 쪽을 빨간 연필로 칠함). 정리 시작 화면·설정 창 공용 */
export function mouseIcon(button) {
  const pair = (d) => `<path class="s" d="${d}"/><path class="s2" d="${d}" transform="translate(.9 -.7)"/>`;
  const hot = button === "left" ? `<path class="hot" d="M3 10V8.5A7.5 7.5 0 0 1 10 2v8Z"/>` : button === "right" ? `<path class="hot" d="M17 10V8.5A7.5 7.5 0 0 0 10 2v8Z"/>` : "";
  return `<svg class="pen-mouse" viewBox="0 0 20 26" width="20" height="26" aria-hidden="true">${hot}${pair("M10 2a7.5 7.5 0 0 1 7.5 7.5v7a7.5 7.5 0 0 1-15 0v-7A7.5 7.5 0 0 1 10 2Z")}${pair("M10 2v8M2.5 10h15")}</svg>`;
}
