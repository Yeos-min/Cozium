/**
 * 기기별 화질. 게임(`scene-kit.js`)과 랜딩(`landing-story/room-layer.js`)이 같이 쓴다.
 *
 * 자동(auto)은 두 단계로 맞춘다 (2026-10-11 사용자: "기기별 성능에 따라, 3D니까 해상도를 낮춘다거나").
 * 1. 처음 단계: GPU 이름과 코어·메모리로 짐작한다(`deviceTier`). 소프트웨어 GL은 low, 내장 그래픽은 balanced,
 *    외장·Apple M은 high.
 * 2. 실제 프레임 시간: 1.5초씩 평균을 보고 느리면(43fps 미만) 먼저 해상도 배율을 한 칸(12.5%) 낮추고,
 *    배율이 바닥이면 한 단계 아래 프로필로 내린다. 60fps를 몇 구간 연속 지키면 배율을 한 칸 올린다.
 *    느려질 때마다 다시 올리기까지 기다리는 구간이 두 배로 늘어(3 → 6 → 12 …) 왔다 갔다 하지 않는다.
 *    프로필 단계는 내려가기만 한다.
 *
 * 단계가 내려갈 때 빠지는 것: 해상도 상한 → 그림자 해상도·갱신 빈도 → 햇살 줄기 → 외곽선·디더링(low).
 */
export const RENDER_PROFILES = Object.freeze({
  high: Object.freeze({ maxDpr: 2, maxPixels: 4_000_000, shadowSize: 2048, shadowEvery: 1, rays: true, effects: true, minScale: 0.75 }),
  balanced: Object.freeze({ maxDpr: 1.5, maxPixels: 2_000_000, shadowSize: 1024, shadowEvery: 1, rays: true, effects: true, minScale: 0.625 }),
  low: Object.freeze({ maxDpr: 1, maxPixels: 1_000_000, shadowSize: 512, shadowEvery: 3, rays: false, effects: false, minScale: 0.5 }),
});
const ORDER = ["high", "balanced", "low"];
const WINDOW = 1.5;      // 초
const SLOW = 0.0235;     // 평균 프레임이 이보다 길면 느림(≈43fps)
const STEADY = 0.0185;   // 이보다 짧으면 60fps 유지
const STEP = 0.125;

export function qualityMode(value) {
  return value === "high" || value === "low" ? value : "auto";
}

export function renderPixelRatio(width, height, deviceDpr, profile, scale = 1) {
  const area = Math.max(1, Number.isFinite(width * height) ? width * height : 1);
  const dpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  return Math.min(dpr, profile.maxDpr, Math.sqrt(profile.maxPixels / area)) * Math.min(1, Math.max(0.25, scale || 1));
}

/**
 * 처음 단계 짐작. renderer = WebGL UNMASKED_RENDERER 문자열(Chrome은 "ANGLE (NVIDIA, NVIDIA GeForce …)" 꼴).
 * 모르면 balanced.
 */
export function deviceTier({ renderer = "", cores, memory, coarsePointer = false } = {}) {
  const name = String(renderer).toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(name)) return "low";
  let tier = "balanced";
  if (/nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|apple m\d/.test(name)) tier = "high";
  if (/intel|uhd|iris|mali|adreno|powervr|radeon\(tm\) graphics|vega \d/.test(name)) tier = "balanced";
  if ((cores && cores <= 4) || (memory && memory <= 4) || coarsePointer) tier = tier === "high" ? "balanced" : tier;
  if ((cores && cores <= 2) || (memory && memory <= 2)) tier = "low";
  return tier;
}

/** 브라우저에서 deviceTier에 넣을 값을 모은다. gl은 WebGL 컨텍스트(없으면 이름 없이 판단). */
export function detectDeviceTier(gl) {
  let renderer = "";
  try {
    const info = gl?.getExtension?.("WEBGL_debug_renderer_info");
    renderer = (info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter?.(gl.RENDERER) || "";
  } catch { /* 일부 브라우저는 막는다 */ }
  const nav = typeof navigator === "undefined" ? {} : navigator;
  const coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return deviceTier({ renderer, cores: nav.hardwareConcurrency, memory: nav.deviceMemory, coarsePointer });
}

export class RenderQuality {
  #mode;
  #active;
  #start;
  #scale = 1;
  #steady = 0;
  #patience = 3;
  #elapsed = 0;
  #frames = 0;

  /** @param {string} mode auto | high | low  @param {{tier?: string}} options tier = 자동일 때 처음 단계 */
  constructor(mode = "auto", { tier = "balanced" } = {}) {
    this.#start = ORDER.includes(tier) ? tier : "balanced";
    this.set(mode);
  }

  get mode() { return this.#mode; }
  get active() { return this.#active; }
  get profile() { return RENDER_PROFILES[this.#active]; }
  /** 해상도 배율(자동에서만 1보다 작아진다) */
  get scale() { return this.#scale; }

  /** 자동일 때 처음 단계를 바꾼다(GPU를 렌더러가 생긴 뒤에 알 때). */
  setStartTier(tier) {
    if (!ORDER.includes(tier)) return;
    this.#start = tier;
    if (this.#mode === "auto") this.set("auto");
  }

  set(mode) {
    this.#mode = qualityMode(mode);
    this.#active = this.#mode === "auto" ? this.#start : this.#mode;
    this.#scale = 1;
    this.#steady = 0;
    this.#patience = 3;
    this.resetSamples();
  }

  resetSamples() { this.#elapsed = 0; this.#frames = 0; }

  /**
   * 프레임마다 부른다. 긴 정지·숨은 탭(0.25초 넘는 간격)은 빼고 잰다. 바뀌면 true(해상도·그림자 다시 적용).
   */
  observe(dt, visible = true) {
    if (!visible || !Number.isFinite(dt) || dt <= 0 || dt > 0.25) {
      this.resetSamples();
      return false;
    }
    if (this.#mode !== "auto") return false;
    this.#elapsed += dt;
    this.#frames += 1;
    if (this.#elapsed < WINDOW) return false;
    const average = this.#elapsed / this.#frames;
    this.resetSamples();
    if (average > SLOW) {
      this.#steady = 0;
      this.#patience = Math.min(48, this.#patience * 2);
      if (this.#scale - STEP >= this.profile.minScale - 1e-9) {
        this.#scale -= STEP;
        return true;
      }
      const next = ORDER[ORDER.indexOf(this.#active) + 1];
      if (!next) return false;
      this.#active = next;
      this.#scale = 1;
      return true;
    }
    if (average < STEADY && this.#scale < 1) {
      this.#steady += 1;
      if (this.#steady >= this.#patience) {
        this.#steady = 0;
        this.#scale = Math.min(1, this.#scale + STEP);
        return true;
      }
      return false;
    }
    this.#steady = 0;
    return false;
  }
}
