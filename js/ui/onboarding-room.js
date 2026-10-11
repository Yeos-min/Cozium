/**
 * onboarding-room.js — 가져오기 화면의 ‘밤의 방’ 배경 (2026-10-08).
 *
 * 랜딩의 방 그림(1672×941)을 화면을 덮도록 배치하고(오른쪽 정렬: 노트북이 늘 보이게),
 * 그림 속 노트북 화면 네 꼭짓점에 바탕화면 그림을 원근 변환으로 붙인다. 랜딩의 Q_MESSY와 같은 값.
 * 화면 동작(드롭·연결)은 건드리지 않는다. Helper 칸은 접혀 있다가 주소로 연결하거나 연결되면 펼친다.
 */
const W0 = 1672, H0 = 941;
const Q_MESSY = [[1240, 288], [1332, 281.5], [1313, 348.5], [1223, 349]];

function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function mul3(m, n) { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(m[i * 3] * n[j] + m[i * 3 + 1] * n[3 + j] + m[i * 3 + 2] * n[6 + j]); return r; }
const matrix3d = (H) => `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,${H[8]})`;

const plate = document.getElementById("ob-plate");
const screen = document.getElementById("ob-screen");
if (plate && screen) {
  screen.style.transform = matrix3d(mul3(squareToQuad(Q_MESSY), [1 / W0, 0, 0, 0, 1 / H0, 0, 0, 0, 1]));
  const place = () => {
    const vw = innerWidth, vh = innerHeight, k = Math.max(vw / W0, vh / H0);
    plate.style.transform = `translate(${vw - W0 * k}px, ${(vh - H0 * k) / 2}px) scale(${k})`;
  };
  place();
  addEventListener("resize", place, { passive: true });
}

const helper = document.getElementById("mode-helper");
if (helper instanceof HTMLDetailsElement) {
  if (new URLSearchParams(location.search).has("helper")) helper.open = true;
  new MutationObserver(() => { if (helper.dataset.ready === "true") helper.open = true; })
    .observe(helper, { attributes: true, attributeFilter: ["data-ready"] });
}
