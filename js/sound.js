// 소리(2026-11-09 사용자): 배경음악은 다락방이 보일 때만, 노트북 속(바탕화면·결과 화면)은 조용히.
// 노트북으로 들어가면 페이드 아웃, 방으로 나오면 그 자리부터 페이드 인. 효과음은 파일 없이 Web Audio로 합성한다.
// 랜딩(js/landing-story/story.js)과 정리방(js/app.js)이 같이 쓴다.
//
//   import { sound } from "../sound.js";
//   sound.setRoom(true)     방이 보인다 → 음악 페이드 인(false면 페이드 아웃 뒤 멈춤)
//   sound.play("box")       box · pick · throw · pin · ui · done · laptop · pop · go · page · gulp
//   sound.play("laptop", { gain: .4, ifRunning: true })   크기 바꾸기 · 오디오가 이미 깨어 있을 때만(밀려 쌓이지 않게)
//   sound.bindToggle(btn)   켜기/끄기 단추. 끈 상태는 이 브라우저에 기억한다
//
// 브라우저는 사용자가 한 번 누르기 전엔 소리를 못 내게 한다. 첫 클릭·키에서 오디오를 깨우고 음악을 받아 온다.
// sound.prime()은 누르기 전에 미리 깨워 보는 것 — 브라우저가 허락할 때만 난다(랜딩 첫 화면 노트북 통통).

const BGM_URL = new URL("../assets/audio/bgm.mp3", import.meta.url).href; // Pixabay · dailyjoy 「Kalimba Soft Background Loop」 https://pixabay.com/music/beats-kalimba-soft-background-loop-156439/
// 이음매 없는 반복: 앞의 인코더 무음(23 ms)을 건너뛰고, 122 BPM 128박(마지막 타격의 울림이 잦아든 자리)에서 처음으로
const LOOP_START = 0.0234, LOOP_END = 62.99;
const MUSIC_GAIN = 0.32, SFX_GAIN = 0.55;
const FADE_IN = 2.0, FADE_OUT = 1.2; // 초
const STORE_KEY = "cozium.sound";

const MARIMBA = [[1, 1], [3.9, 0.25], [9.2, 0.06]];

/** 효과음 레시피(11-08 소리 고르기 페이지에서 고른 것 + 11-09 손본 것). v = 높이 ±6% 흔들기, k = 크기(기본 1) */
const RECIPES = {
  box: (v, k) => boxHit(v, k), // A 툭 — 종이상자. 여러 장이면 툭 → 톡톡톡 이어짐(boxHit)
  // B 스윽(11-09 사용자 「너무 날카로움, 무더기로 들으니 가벼움」): 높은 쉭 → 낮은 사락 + 손에 쥐는 묵직한 바닥음.
  // 연달아 집으면 조금씩 작고 낮게(pickRun)
  pick: (v, k) => {
    burst({ type: "bandpass", f: 900 * v, f2: 1500 * v, q: 0.7, dur: 0.2, gain: 0.38 * k, attack: 0.045 });
    burst({ type: "lowpass", f: 520 * v, dur: 0.12, gain: 0.26 * k, attack: 0.02 });
    tone({ f: 120 * v, f2: 85 * v, dur: 0.1, gain: 0.2 * k, at: 0.02 });
  },
  throw: (v, k) => { burst({ type: "lowpass", f: 1400 * v, dur: 0.06, gain: 0.55 * k }); tone({ f: 140 * v, f2: 90 * v, dur: 0.07, gain: 0.35 * k }); }, // C 착지 탁
  pin: (v, k) => { burst({ type: "bandpass", f: 4200 * v, q: 3, dur: 0.025, gain: 0.6 * k }); tone({ f: 320 * v, f2: 220 * v, dur: 0.06, gain: 0.35 * k, at: 0.01 }); }, // A 틱 — 압정
  ui: (v, k) => burst({ type: "bandpass", f: 2600 * v, q: 2, dur: 0.03, gain: 0.45 * k }), // A 연필 톡
  done: (v, k) => { tone({ f: 523 * v, dur: 0.5, gain: 0.3 * k, partials: MARIMBA }); tone({ f: 784 * v, dur: 0.8, gain: 0.3 * k, at: 0.16, partials: MARIMBA }); }, // A 딩동
  // 11-09 새로: 랜딩 첫 화면 노트북이 책상에 통 — 나무에 닿는 낮은 울림 + 플라스틱 딸깍
  laptop: (v, k) => {
    tone({ f: 190 * v, f2: 140 * v, dur: 0.11, gain: 0.42 * k, partials: [[1, 1], [2.6, 0.25]] });
    burst({ type: "lowpass", f: 1800 * v, dur: 0.035, gain: 0.3 * k });
    burst({ type: "bandpass", f: 3400 * v, q: 2.5, dur: 0.012, gain: 0.12 * k });
  },
  // 말풍선 「···」이 「정리 시작해볼까요?」로 부푼다 — 위로 올라가는 퐁 + 연필 사각
  pop: (v, k) => {
    tone({ f: 330 * v, f2: 640 * v, dur: 0.13, gain: 0.2 * k, attack: 0.012 });
    burst({ type: "bandpass", f: 2900 * v, q: 1.2, dur: 0.05, gain: 0.08 * k, at: 0.03 });
  },
  // 말풍선을 눌렀다 — 뽁 하고 파일이 노트북으로 빨려 드는 바람(약 1초)
  go: (v, k) => {
    tone({ f: 620 * v, f2: 940 * v, dur: 0.08, gain: 0.28 * k, attack: 0.005 });
    tone({ f: 940 * v, f2: 470 * v, dur: 0.12, gain: 0.12 * k, at: 0.07 });
    burst({ type: "bandpass", f: 420 * v, f2: 2200 * v, q: 0.9, dur: 1.15, gain: 0.2 * k, at: 0.06, attack: 0.55 });
  },
  // 결과 화면: 아이콘이 폴더로 쏙 — 짧고 맑은 톡. 연달아 들어가면 한 장마다 조금씩 높아져 드르르륵(gulpRun)
  gulp: (v, k) => {
    tone({ f: 620 * v, f2: 980 * v, dur: 0.06, gain: 0.16 * k, attack: 0.004 });
    burst({ type: "bandpass", f: 3000 * v, q: 2, dur: 0.018, gain: 0.1 * k });
  },
  // 「파일 없이 샘플로 둘러보기」 — 책장 넘기기: 종이가 휘는 사락사락 → 넘어가며 팔락
  page: (v, k) => {
    for (let i = 0; i < 5; i++) burst({ type: "bandpass", f: (2100 + i * 380) * v, q: 1.3, dur: 0.045, gain: (0.09 + i * 0.045) * k, at: i * 0.032 });
    burst({ type: "bandpass", f: 1300 * v, f2: 3000 * v, q: 0.7, dur: 0.2, gain: 0.4 * k, at: 0.04, attack: 0.09 });
    burst({ type: "lowpass", f: 900 * v, dur: 0.07, gain: 0.45 * k, at: 0.2, attack: 0.006 });
  },
};
const MIN_GAP = { pick: 0.08, throw: 0.07, pin: 0.06, ui: 0.04, done: 0.8, laptop: 0.1, gulp: 0.028, pop: 0.3, go: 0.5, page: 0.4 }; // 여러 장이 한꺼번에 와도 겹쳐 시끄럽지 않게(box는 boxHit이 줄 세움)

let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
let boxChain = { next: 0, n: 0 }, pickRun = { at: -1, n: 0 }, gulpRun = { at: -1, n: 0 };
let muted = readMuted();
let wantRoom = false; // 방이 보이는가(음악을 틀어야 하는가)
let bgm = null; // 받아 둔 AudioBuffer
let bgmLoading = null;
let source = null, startedAt = 0, startOffset = LOOP_START, stopTimer = 0; // 지금 도는 음악
const lastAt = {};
const toggles = new Set();

function readMuted() {
  try { return localStorage.getItem(STORE_KEY) === "off"; } catch { return false; }
}
function saveMuted() {
  try { localStorage.setItem(STORE_KEY, muted ? "off" : "on"); } catch { /* 저장이 막힌 브라우저: 이번 방문 동안만 */ }
}

/** 첫 사용자 동작에서 오디오를 만든다(그 전엔 만들면 브라우저가 경고하고 멈춰 둔다). */
function makeContext() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_GAIN; sfxBus.connect(master);
  }
  if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {});
  return true;
}
function wake() {
  if (!makeContext()) return false;
  loadMusic();
  syncMusic();
  return true;
}
if (typeof document !== "undefined") { // node 테스트에서 불러와도 조용히
  for (const type of ["pointerdown", "keydown", "touchend"]) addEventListener(type, wake, { capture: true, passive: true });
  // 탭을 떠나 있는 동안은 오디오를 쉰다(음악 위치는 그대로)
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}

function loadMusic() {
  if (bgm || bgmLoading || !ctx) return;
  bgmLoading = fetch(BGM_URL)
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer(); })
    .then((bytes) => new Promise((resolve, reject) => ctx.decodeAudioData(bytes, resolve, reject))) // 옛 Safari는 콜백형만
    .then((buffer) => { bgm = buffer; syncMusic(); })
    .catch((error) => { console.warn("배경음악을 불러오지 못했어요", error); }); // 음악이 없어도 게임은 그대로
}

/** 반복 구간 안에서 지금 음악이 어디쯤인지(초) */
function musicPosition() {
  if (!source) return startOffset;
  const span = LOOP_END - LOOP_START;
  let pos = startOffset + (ctx.currentTime - startedAt);
  if (pos > LOOP_END) pos = LOOP_START + ((pos - LOOP_START) % span);
  return pos;
}

function ramp(param, to, seconds) {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + seconds);
}

/** 원하는 상태(방이 보이나)에 음악을 맞춘다: 페이드 인 하며 이어 틀거나, 페이드 아웃 뒤 멈추고 자리를 기억한다. */
function syncMusic() {
  if (!ctx || !bgm) return;
  clearTimeout(stopTimer); stopTimer = 0;
  if (wantRoom) {
    if (!source) {
      source = ctx.createBufferSource();
      source.buffer = bgm; source.loop = true; source.loopStart = LOOP_START; source.loopEnd = LOOP_END;
      source.connect(musicBus);
      startedAt = ctx.currentTime;
      source.start(0, startOffset);
    }
    ramp(musicBus.gain, MUSIC_GAIN, FADE_IN);
  } else if (source) {
    ramp(musicBus.gain, 0, FADE_OUT);
    stopTimer = setTimeout(() => {
      stopTimer = 0;
      if (wantRoom || !source) return;
      startOffset = musicPosition();
      source.stop(); source.disconnect(); source = null;
    }, FADE_OUT * 1000 + 80);
  }
}

// ── 합성(소리 고르기 페이지와 같은 함수) ──
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
}
/** 노이즈 한 번: 필터 종류·주파수(시작→끝)·Q·길이·크기·시작 지연·어택. grains는 종이가 사락거리듯 크기를 잘게 흔든다 */
function burst({ type = "lowpass", f = 1000, f2 = null, q = 0.7, dur = 0.1, gain = 0.6, at = 0, attack = 0.003 }) {
  const t = ctx.currentTime + at, src = noise(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(sfxBus); src.start(t, Math.random() * Math.max(0, 1.4 - dur)); src.stop(t + dur + 0.05);
}
/** 사인 한 번: 주파수(시작→끝)·길이·크기·지연. 배음(partials)을 더하면 실로폰 같은 소리 */
function tone({ f = 200, f2 = null, dur = 0.12, gain = 0.5, at = 0, attack = 0.004, partials = null }) {
  const t = ctx.currentTime + at;
  for (const [mul, amp] of partials || [[1, 1]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * mul, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2 * mul, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * amp, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / Math.max(1, mul * 0.6));
    o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
}

/**
 * 상자에 들어가는 한 장. 붙어서 여러 번 오면(한꺼번에 여러 장 넣기) 줄을 세워 툭 → 톡 · 톡 · 톡으로 잦아든다
 * (11-09 사용자 「한번에 여러 파일 넣을 때 한번 툭하고 끝나니까 이상함」). 0.6초 넘게 밀리면 그 뒤는 버린다.
 */
function boxHit(v, k) {
  const now = ctx.currentTime;
  if (now > boxChain.next + 0.25) boxChain = { next: now, n: 0 };
  const at = Math.max(0, boxChain.next - now);
  if (at > 0.6) return;
  const n = boxChain.n++;
  if (n === 0) { burst({ f: 900 * v, dur: 0.09, gain: 0.55 * k }); tone({ f: 95 * v, f2: 60 * v, dur: 0.14, gain: 0.7 * k }); }
  else { // 종이 위에 종이가 얹히는 가벼운 톡
    const d = Math.max(0.35, 0.86 ** n) * k;
    burst({ f: 1300 * v, dur: 0.05, gain: 0.36 * d, at });
    tone({ f: 150 * v, f2: 105 * v, dur: 0.07, gain: 0.32 * d, at });
  }
  boxChain.next = now + at + 0.055 + Math.random() * 0.03;
}

function paintToggles() {
  for (const button of toggles) {
    button.setAttribute("aria-pressed", String(!muted));
    button.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
    button.title = muted ? "소리 켜기" : "소리 끄기";
    button.dataset.sound = muted ? "off" : "on";
  }
}

export const sound = {
  get muted() { return muted; },
  /** 자동 점검용: 지금 오디오·음악 상태 */
  get state() { return { audio: ctx?.state ?? "none", room: wantRoom, music: bgm ? (source ? "playing" : "paused") : "not loaded", level: musicBus ? +musicBus.gain.value.toFixed(3) : 0 }; },
  setMuted(next) {
    muted = !!next; saveMuted(); paintToggles();
    if (ctx) ramp(master.gain, muted ? 0 : 1, 0.25);
  },
  toggle() { this.setMuted(!muted); },
  /** 방(다락방)이 보이는지. 바뀔 때만 일한다 — 매 프레임 불러도 된다 */
  setRoom(on) {
    on = !!on;
    if (on === wantRoom) return;
    wantRoom = on;
    syncMusic();
  },
  /**
   * 효과음 하나. gain = 크기(기본 1). ifRunning = 오디오가 이미 돌 때만 — 저절로 되풀이되는 소리(노트북 통통)가
   * 깨기 전에 쌓였다가 첫 클릭에 한꺼번에 터지지 않게.
   */
  play(name, { gain = 1, ifRunning = false } = {}) {
    const recipe = RECIPES[name];
    if (!recipe || muted || !ctx || ctx.state === "closed") return; // 막 깨운 참(아직 suspended)이면 깨어나는 대로 난다
    if (ifRunning && ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (now - (lastAt[name] ?? -1) < (MIN_GAP[name] ?? 0)) return;
    lastAt[name] = now;
    if (name === "pick") { // 훑어서 연달아 집으면 조금씩 작게(무더기가 따갑지 않게)
      pickRun = now - pickRun.at < 0.3 ? { at: now, n: pickRun.n + 1 } : { at: now, n: 0 };
      gain *= Math.max(0.45, 0.85 ** pickRun.n);
    }
    let pitch = 1 + (Math.random() * 2 - 1) * 0.06;
    if (name === "gulp") { // 결과 화면에서 줄줄이 들어가면 한 음씩 올라간다(24장에서 멈춤), 오래 이어지면 조금 작게
      gulpRun = now - gulpRun.at < 0.4 ? { at: now, n: gulpRun.n + 1 } : { at: now, n: 0 };
      pitch = 1 + Math.min(gulpRun.n, 24) * 0.022 + (Math.random() * 2 - 1) * 0.015;
      gain *= Math.max(0.6, 0.98 ** gulpRun.n);
    }
    recipe(pitch, gain);
  },
  /** 누르기 전에 오디오를 깨워 본다. 브라우저가 막으면 조용히 기다렸다가 첫 클릭에 깬다(음악은 그때 받는다) */
  prime() { makeContext(); },
  /** 켜기/끄기 단추 하나를 묶는다. 단추 모양은 data-sound="on|off"로 CSS가 바꾼다 */
  bindToggle(button) {
    if (!button) return;
    toggles.add(button);
    button.addEventListener("click", () => { wake(); sound.toggle(); });
    paintToggles();
  },
};

/**
 * 화면 속 단추를 누를 때마다 「연필 톡」. 단추에 data-sfx="page"처럼 적으면 그 소리로 바꾼다.
 * 단추가 아닌 곳(3D 방 등)은 각자 부른다.
 */
export function clickSoundFor(root, selector = "button, summary, a.start, a.end-go, .win-link") {
  root.addEventListener("click", (event) => {
    const hit = event.target.closest?.(selector);
    if (hit && !hit.disabled && !hit.matches("[data-sound]")) sound.play(hit.dataset.sfx || "ui");
  }, { capture: true }); // 먼저 듣는다: 누르자마자 스스로 잠그는 단추(샘플로 둘러보기 등)도 소리가 나게
}
