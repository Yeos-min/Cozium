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

/** 연필 체크(✓). 노트북 = 정리 끝내기(11-07 사용자: 침대 힌트와 같은 모양, 완료 = 체크) */
function check(cx, cy) {
  return pair(`M${cx - 13} ${cy + 1} L${cx - 4} ${cy + 10} L${cx + 14} ${cy - 11}`);
}

/**
 * 노트북 힌트: 침대 힌트와 같은 자리·같은 결의 연필 체크 + 글자.
 * calling = 다 치워서 노트북이 부르는 중(노트북 위에 늘 뜨는 이름표에도 같은 그림을 쓴다).
 */
export function doneHintMarkup(label = "눌러서 정리 끝내기") {
  return `<svg class="th-icon" width="60" height="52" viewBox="0 0 60 52" aria-hidden="true">${check(30, 26)}</svg><span class="th-label">${label}</span>`;
}

/** 상자를 빈손으로 겨누면: 열린 연필 폴더 + 「눌러서 ‘이름’ 열기」(11-07 사용자: 아래에 늘 떠 있던 안내를 없애고 필요할 때만).
 *  이름이 여기 들어가므로 그동안 상자 위 3D 이름표는 숨긴다(겹쳐서) */
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function folderHintMarkup(name = "폴더") {
  return `<svg class="th-icon" width="60" height="52" viewBox="0 0 60 52" aria-hidden="true">${pair("M10 40V14h13l4 5h21v7")}${pair("M10 40l7-14h38l-7 14Z")}</svg><span class="th-label">눌러서 ‘<b class="th-name">${esc(name)}</b>’ 열기</span>`;
}

/** night = 지금 밤인가. 밤이면 아침으로 가는 해, 낮이면 밤으로 가는 달 */
export function timeHintMarkup(night) {
  const icon = night ? sun(30, 26, 11) : moon(28, 26, 13);
  return `<svg class="th-icon" width="60" height="52" viewBox="0 0 60 52" aria-hidden="true">${icon}</svg><span class="th-label">${night ? "눌러서 아침으로" : "눌러서 밤으로"}</span>`;
}
