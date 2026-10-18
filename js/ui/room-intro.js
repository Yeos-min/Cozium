/**
 * room-intro.js — 정리 시작 화면 (2026-10-18 사용자: "정리 시작 처음 화면에 조작방법 간단한 설명, 그리고 로딩화면도 필요해").
 *
 * 두 박자다.
 *   loading — 가져오기 화면이 어두워진 그 색(#2b2a21)에서 이어진다. 방 모델 받기 → 상자 → 셰이더 → 첫 프레임 진행 막대.
 *   ready   — 막이 걷히고 방이 어둡게 비친다. 가운데 조작 카드와 「방에 들어가기」. 누르면 마우스를 잡는다
 *             (포인터 락은 사용자 제스처 안에서만 걸리므로 이 단추가 곧 시작이다).
 * 보이는 것만 맡는다. 무엇을 기다릴지는 Board3D.whenReady가 정한다.
 */

const STEPS = {
  room: { from: 0, to: 0.72, label: "다락방 불러오는 중" },
  boxes: { from: 0.72, to: 0.8, label: "상자 꺼내는 중" },
  shaders: { from: 0.8, to: 0.95, label: "햇살 맞추는 중" },
  floor: { from: 0.95, to: 1, label: "파일 바닥에 까는 중" },
};

const TIPS = [
  "우클릭을 오래 누를수록 멀리 던져요. 위를 보면 높이 날아가요.",
  "던질 궤적 끝이 상자에 닿아 상자가 빛나면, 그대로 놓아 그 안에 넣을 수 있어요.",
  "빈손으로 상자를 클릭하면 안을 열어 볼 수 있어요.",
  "잘못 넣었으면 Ctrl+Z. 마지막 더미가 그대로 돌아와요.",
  "피곤하면 빈손으로 침대를 클릭해 봐요. 밤이 와요.",
  "카드를 누른 채 훑으면 닿는 대로 한 손에 담겨요.",
];

const MIN_LOADING_MS = 900; // 너무 빨리 끝나도 한 번은 읽힐 만큼
const GIVE_UP_MS = 25000; // 무엇이 멈춰도 이 뒤에는 들어갈 수 있게
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 마우스 그림. button: none | left | right */
function mouseIcon(button) {
  const fill = (side) => (button === side ? ' class="on"' : "");
  return `<svg viewBox="0 0 16 22" width="15" height="21" aria-hidden="true">
    <path${fill("left")} d="M7.4 1.2C4 1.4 1.3 4 1.3 7.4V9h6.1z"/>
    <path${fill("right")} d="M8.6 1.2c3.4.2 6.1 2.8 6.1 6.2V9H8.6z"/>
    <rect x="1.3" y="1.2" width="13.4" height="19.6" rx="6.7" fill="none"/>
    <path d="M1.3 9h13.4M8 1.2V9" fill="none"/>
  </svg>`;
}

export function mountRoomIntro({ root, onEnter }) {
  const $ = (selector) => root.querySelector(selector);
  const bar = $(".intro-bar"), fill = $(".intro-bar > span"), stepLabel = $("#intro-step"), percent = $("#intro-percent");
  const tip = $("#intro-tip"), mode = $("#intro-mode"), enterButton = $("#intro-enter");
  for (const el of root.querySelectorAll("i.mouse")) el.innerHTML = mouseIcon(el.dataset.btn);

  // 화면 크기에 맞춰 키운다(10-18 사용자: "너무 작다"). 1280 × 720을 1로, 큰 모니터일수록 같은 비율로 커진다.
  const fit = () => root.style.setProperty("--intro-scale", Math.min(2.6, Math.max(1, Math.min(innerWidth / 1280, innerHeight / 720))).toFixed(3));
  fit();
  addEventListener("resize", fit);

  let shown = 0, target = 0, done = false, startedAt = 0, raf = 0, tipTimer = 0, phase = "idle", fileLabel = "";

  const setPhase = (next) => {
    phase = next;
    root.dataset.phase = next;
  };

  let last = 0;
  const draw = (now) => {
    // 시간 기준으로 따라간다(느린 기기에서도 막대가 끝에서 질질 끌지 않게)
    const dt = Math.min(0.25, last ? (now - last) / 1000 : 0);
    last = now;
    const k = reduced() ? 1 : 1 - Math.exp(-dt * 7);
    shown += (target - shown) * k;
    if (target - shown < 0.01) shown = target;
    fill.style.transform = `scaleX(${shown.toFixed(4)})`;
    const value = Math.round(shown * 100);
    percent.value = `${value}%`;
    bar.setAttribute("aria-valuenow", String(value));
    if (done && shown >= 0.999 && now - startedAt >= MIN_LOADING_MS) { ready(); return; }
    raf = requestAnimationFrame(draw);
  };

  const showTip = (index) => {
    tip.classList.remove("is-in");
    void tip.offsetWidth; // 같은 애니메이션을 다시 건다
    tip.textContent = `팁 · ${TIPS[index % TIPS.length]}`;
    tip.classList.add("is-in");
  };

  function ready() {
    if (phase !== "loading") return;
    cancelAnimationFrame(raf);
    clearInterval(tipTimer);
    fill.style.transform = "scaleX(1)";
    percent.value = "100%";
    setPhase("ready");
    enterButton.focus({ preventScroll: true });
  }

  function enter() {
    if (phase !== "ready") return;
    setPhase("out");
    onEnter(); // 클릭(사용자 제스처) 안에서 바로 불러야 포인터 락이 걸린다
    setTimeout(() => { if (phase === "out") { root.hidden = true; setPhase("idle"); } }, reduced() ? 0 : 420);
  }

  enterButton.addEventListener("click", enter);
  document.addEventListener("keydown", (event) => {
    if (phase !== "ready" || event.repeat) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); enter(); }
  });

  return {
    get active() {
      return phase === "loading" || phase === "ready";
    },
    /** 가져오기 화면이 어두워진 직후에 띄운다. */
    show({ modeText, fileCount }) {
      fileLabel = fileCount ? `파일 ${fileCount}개 바닥에 까는 중` : STEPS.floor.label;
      mode.textContent = fileCount ? `${modeText} · 파일 ${fileCount}개` : modeText;
      shown = target = last = 0;
      done = false;
      startedAt = performance.now();
      fill.style.transform = "scaleX(0)";
      stepLabel.textContent = STEPS.room.label;
      root.hidden = false;
      setPhase("loading");
      let i = Math.floor(Math.random() * TIPS.length);
      showTip(i);
      clearInterval(tipTimer);
      tipTimer = setInterval(() => showTip(++i), 3600);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    },
    /** 보드가 준비되는 동안 막대를 채운다. ready(조작 안내)로 넘어가는 건 막대가 다 찬 뒤. */
    async track(board) {
      const giveUp = setTimeout(() => { target = 1; done = true; }, GIVE_UP_MS);
      try {
        await board.whenReady((step, fraction) => {
          const s = STEPS[step];
          if (!s) return;
          stepLabel.textContent = step === "floor" ? fileLabel : s.label;
          target = Math.max(target, s.from + (s.to - s.from) * Math.min(1, Math.max(0, fraction)));
        });
      } catch (error) {
        console.warn("[정리대] 방 준비 중 문제가 있었지만 그대로 들어갑니다:", error);
      }
      clearTimeout(giveUp);
      target = 1;
      done = true;
    },
  };
}
