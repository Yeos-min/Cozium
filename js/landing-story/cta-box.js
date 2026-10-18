/**
 * cta-box.js — 랜딩 마지막 「정리방 들어가기」 = 파일이 빨려 드는 상자 (2026-10-18 사용자 선택).
 *
 * 버튼이 작은 종이상자다. 마우스를 올리면(키보드로 닿아도) 뚜껑이 열리고, 둘레에 흩어진 파일 아이콘이 하나씩
 * 포물선을 그리며 상자 입구로 쏙 들어간다 — 게임에서 할 일을 버튼이 미리 보여 준다. 마우스가 떠나면 같은 길로
 * 도로 튀어나온다(WAAPI reverse). 누르면 뚜껑이 닫히며 상자가 꾹 눌리고, 그다음은 story.js의 걸어 들어가기 그대로.
 * 동작 줄이기 설정이면 뚜껑만 열고 닫는다.
 */
const box = document.querySelector(".cta-box");
if (box) {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const files = [...box.querySelectorAll(".cta-file")];
  let flights = [];
  let open = false;

  /** 파일 → 상자 입구까지의 포물선(파일 자리는 CSS 변수 --x --y --r, 상자 입구는 원점). */
  function fly(file, i) {
    const cs = getComputedStyle(file);
    const x = parseFloat(cs.getPropertyValue("--x")), y = parseFloat(cs.getPropertyValue("--y")), r = parseFloat(cs.getPropertyValue("--r"));
    const lift = 46 + Math.abs(x) * 0.18;
    return file.animate([
      { transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(1)`, opacity: 1 },
      { transform: `translate(${x * 0.9}px, ${y - 12}px) rotate(${r * 0.6}deg) scale(1.08)`, opacity: 1, offset: 0.14 },
      { transform: `translate(${x * 0.45}px, ${Math.min(y, 0) - lift}px) rotate(${-r}deg) scale(0.9)`, opacity: 1, offset: 0.58 },
      { transform: "translate(0px, -6px) rotate(0deg) scale(0.35)", opacity: 0 },
    ], { duration: 520 + Math.abs(x) * 0.6, delay: 70 + i * 75, easing: "cubic-bezier(.4, 0, .6, 1)", fill: "both" });
  }

  function openBox() {
    if (open || box.classList.contains("is-closing")) return;
    open = true;
    box.classList.add("is-open");
    if (reduced()) return;
    if (flights.length) { for (const a of flights) { if (a.playbackRate < 0) a.reverse(); a.play(); } return; }
    // 가까운 것부터: 바깥쪽 파일이 마지막에 들어가 「다 담겼다」가 읽히게
    const order = files.map((f, i) => [f, i]).sort((a, b) => Math.abs(parseFloat(getComputedStyle(a[0]).getPropertyValue("--x"))) - Math.abs(parseFloat(getComputedStyle(b[0]).getPropertyValue("--x"))));
    flights = order.map(([file], k) => {
      const a = fly(file, k);
      a.onfinish = () => { if (a.playbackRate > 0 && open) box.dataset.full = String(flights.every((f) => f.playState === "finished")); };
      return a;
    });
  }

  function closeBox() {
    if (!open || box.classList.contains("is-closing")) return;
    open = false;
    box.classList.remove("is-open");
    delete box.dataset.full;
    for (const a of flights) { if (a.playbackRate > 0) a.reverse(); else a.play(); } // 같은 길로 도로 튀어나온다
  }

  box.addEventListener("pointerenter", openBox);
  box.addEventListener("pointerleave", closeBox);
  box.addEventListener("focus", openBox);
  box.addEventListener("blur", closeBox);
  // 누르는 순간: 뚜껑이 닫히고 상자가 꾹(남은 파일은 마저 들어간다). 이동은 story.js가 맡는다.
  box.addEventListener("pointerdown", (e) => { if (e.button === 0) { openBox(); box.classList.add("is-press"); } });
  box.addEventListener("pointerup", () => box.classList.remove("is-press"));
  box.addEventListener("click", (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    for (const a of flights) { if (a.playbackRate < 0) a.reverse(); a.finish?.(); }
    box.classList.remove("is-press");
    box.classList.add("is-closing");
  });
  // 방에서 다시 돌아왔을 때(뒤로 가기, bfcache) 닫힌 처음 상태로
  addEventListener("pageshow", () => {
    box.classList.remove("is-closing", "is-open", "is-press");
    for (const a of flights) a.cancel();
    flights = [];
    open = false;
  });
}
