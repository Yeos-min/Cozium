// 침대 힌트(2026-11-06, 사용자 시안 B): 게임에서 침대를 겨누면 「누르면 시간이 바뀐다」는 연필 아이콘 + 글자.
// 낮엔 달 「눌러서 밤으로」, 밤엔 해 「눌러서 아침으로」. 게임(three/board-3d.js)에서만 씀 — 랜딩 침대는 11-07 사용자가 뺌.
// 선은 시작 말풍선과 같은 연필 두 번 긋기(진한 선 + 살짝 비낀 옅은 선). 색은 CSS(.time-hint)에서 정한다.

const pair = (d) => `<path class="th-s" d="${d}"/><path class="th-s2" d="${d}" transform="translate(1.1 -.9)"/>`;

function sun(cx, cy, r) {
  let s = `<circle class="th-s" cx="${cx}" cy="${cy}" r="${r}"/><circle class="th-s2" cx="${cx + 1}" cy="${cy - .8}" r="${r}"/>`;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + .2, r0 = r + 4, r1 = r + 9;
    s += pair(`M${(cx + Math.cos(a) * r0).toFixed(1)} ${(cy + Math.sin(a) * r0).toFixed(1)} L${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)}`);
  }
  return s;
}

function moon(cx, cy, r) {
  const d = `M${cx + r * .35} ${cy - r} A${r} ${r} 0 1 0 ${cx + r} ${cy + r * .45} A${r * .78} ${r * .78} 0 0 1 ${cx + r * .35} ${cy - r}Z`;
  return `<path class="th-f" d="${d}"/>${pair(d)}${pair(`M${cx + r + 6} ${cy - r - 4} l3 0 m-1.5 -1.5 l0 3`)}${pair(`M${cx + r + 12} ${cy - 3} l2.4 0 m-1.2 -1.2 l0 2.4`)}`;
}

/** night = 지금 밤인가. 밤이면 아침으로 가는 해, 낮이면 밤으로 가는 달 */
export function timeHintMarkup(night) {
  const icon = night ? sun(30, 26, 11) : moon(28, 26, 13);
  return `<svg class="th-icon" width="60" height="52" viewBox="0 0 60 52" aria-hidden="true">${icon}</svg><span class="th-label">${night ? "눌러서 아침으로" : "눌러서 밤으로"}</span>`;
}
