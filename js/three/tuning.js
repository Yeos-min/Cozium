/**
 * tuning.js — 3D 장면의 모든 숫자. 전부 `[임시]`다. 손맛은 여기를 고치며 찾는다.
 *
 * 코드 곳곳에 숫자를 흩뿌리지 않는다. 값 하나를 바꾸려고 파일 세 개를 열지 않기 위해서다.
 * 브라우저 콘솔에서 `window.__tuning`으로 실시간으로 만질 수 있다 (board-3d.js가 걸어 둔다).
 */

export const UNIT = 0.01; // 논리 1px → 월드 0.01. 보드 1280×720 → 12.8×7.2

export const TUNING = {
  /**
   * 그림 방식 (10-11, 사용자가 랜딩에서 고른 것을 게임에도). material "toon" = 툰 3단, "pbr" = 예전 재질.
   * rays = 천창 햇살 줄기.
   */
  render: { material: "toon", rays: true },
  dithering: {
    preset: "fine",
    levels: { off: 0, fine: 16, medium: 8, coarse: 4 }, // 색 채널당 단계 수.
    cellSize: 2, // Bayer 패턴 한 칸의 화면 CSS px. 캔버스 해상도는 유지.
  },
  vertexWobble: {
    preset: "wobble",
    cellSizes: { off: 0, subtle: 1, wobble: 3, ps1: 6 }, // 투영된 정점의 화면 CSS px 격자.
  },
  outline: {
    thickness: 1, // 외곽선 굵기. 설정 UI에서 0~4px 조절.
    opacity: 1,
    // 10-11: 갈색 고정(#51351f) 대신 주변색을 어둡게 한 선. ink "fixed"면 color 한 색.
    color: "#26262a",
    ink: "around",
    inkDark: 0.34,
    depthThreshold: 0.015,
    normalThreshold: 0.65,
    normalThicknessRatio: 0.4, // 주요 내부 꺾임은 실루엣보다 가늘게.
  },
  /**
   * 1인칭. 방 안에 서서 둘러본다. `[임시]`
   * 참고 게임 둘 다 1인칭이고, 몰입의 대부분이 "방 안에 있다"에서 나온다 (§2-1).
   */
  firstPerson: {
    label: "1인칭",
    eyeHeight: 3.1,
    /**
     * 시야각. 넓을수록 주변 시야의 흐름이 커져 멀미가 심해진다.
     * 방의 가구와 중앙 정리 공간이 함께 보이는 초기값. `[임시]`
     */
    fov: 66,
    /**
     * 시작할 때 바닥을 내려다보는 각도.
     * 수납장과 방을 먼저 보여주고, 가까운 파일은 시점을 내려 확인한다.
     */
    pitch: -19,
    pitchRange: [-78, 24],
    moveSpeed: 7.0,
    sprintMultiplier: 1.9,
    lookSensitivity: 0.10, // 픽셀당 도 (커서 드래그용)
    /**
     * 이동 가속·감속. 크면 즉각적이고 작으면 미끄러진다.
     * 미끄러지는 느낌은 멀미의 큰 원인이다 — 눈이 보는 움직임과 몸이 예상하는 것이 어긋난다.
     */
    moveSmoothing: 18,
    /**
     * 보드 가까운 쪽 가장자리에서 이만큼 물러나 선다.
     * 너무 붙으면 발 앞의 카드가 화면 아래로 잘린다.
     */
    spawnBack: 2.6,
    bodyRadius: 0.7, // 벽과 상자에 파고들지 않게
    /**
     * 점프(10-11 사용자 친구들 요청: 상자가 많아져 길을 막으면 넘어가게). Space.
     * height: 발이 올라가는 높이(게임 단위, 1 = 0.5 m). 상자 하나(0.98)를 넘고 그 위에 설 수 있게 1.25.
     * rise: 꼭대기까지 걸리는 초. step: 이만큼 낮은 턱은 걸어서 올라선다. headroom: 머리 위 여유(경사 천장).
     * 가구(침대·책상)는 높이가 없어 여전히 막힌다. 두 단 상자는 한 단 위에서 한 번 더 뛰어야 오른다. `[임시]`
     */
    jump: { height: 1.25, rise: 0.3, step: 0.08, headroom: 0.2 },

    /**
     * ── 멀미 관련 `[임시]` ──
     * 머리 흔들림은 멀미의 대표적인 원인이라 기본은 꺼 둔다. 손맛이 아쉬우면 0.02쯤부터 올려 본다.
     */
    headBob: 0,
    headBobSpeed: 9,
    /** 포인터 락 감도. 픽셀당 도 — 락에서는 movementX가 오므로 커서 드래그와 값이 다르다 */
    lockedSensitivity: 0.075,
    /**
     * 커서 드래그 시점만 평활화한다. 60fps 기준 비율이며 다른 fps에서는 시간으로 보정한다.
     * 포인터 락 입력은 이 값을 쓰지 않고 다음 프레임에 전부 반영한다.
     */
    lookSmoothing: 0.38,

    /**
     * 손. 집은 카드가 시야 앞에 들려 있는 자리.
     * 카메라 오른쪽 아래를 따라가며, 카드 앞면이 보이도록 세운다.
     */
    hand: {
      distance: 2.05,
      height: -0.64, // 카메라 기준 아래쪽
      side: 0.92,
      pitch: 1.12,
      scale: 0.95, // 다락방 카드(55 × 33 cm) 기준. 예전 큰 카드는 0.65
      rise: 0.025, // 한 장 쌓일 때마다
      back: 0.018, // 뒤 카드가 물러나는 정도
      fan: 0.04, // 옆으로 펴지는 정도. 몇 장 들었는지 보이게
      spring: { freq: 7.5, damping: 0.85 },
      maxVisible: 5, // 나머지는 HUD의 개수로 표시한다
    },

    /** 조준선으로 쓸어 담기 */
    gather: {
      /** 버튼을 누른 채 훑으면 조준선에 닿는 카드가 손으로 온다 */
      sweep: true,
    },
  },

  /** 1인칭에서만 세우는 방 */
  room: {
    primitiveBed: false,
    wallHeight: 5.8,
    wallThickness: 0.4,
    color: "#526580",
    trimColor: "#29394f",
    margin: 220,
    shelfY: 0.34,
    shelfBack: 1.55,
  },

  /**
   * 따뜻한 나무 책상. 정리 시뮬레이터들은 예외 없이 밝고 채도가 높다.
   * 어두운 무채색은 "작업 도구"로 읽히고, 따뜻한 나무는 "물건이 놓인 곳"으로 읽힌다.
   */
  desk: {
    floorColors: ["#799da9", "#adc7ce"],
    floorRepeat: 1.8,
    // 따뜻한 나무와 밝은 종이의 대비.
    color: "#799da9",
    playColor: "#799da9",
    boxZoneColor: "#799da9",
    background: "#182237",
    edgeColor: "#29394f",
    margin: 260, // 책상이 보드 밖으로 뻗는 논리 여백
  },

  /**
   * 다락방 낮(10-11): 랜딩 마지막 방과 같은 '오후 햇살'. 천창으로 드는 해 + 지붕 그림자, 노란 하늘빛.
   * 방향은 +x 경사의 천창 쪽에서. 방은 게임 단위(0.5 m)라 거리·그림자 범위는 랜딩의 두 배.
   */
  light: {
    ambient: { color: "#f6e2c6", intensity: 0.5 },
    key: { color: "#ffd9a0", intensity: 3.8, elevation: 47.3, azimuth: 110.8, distance: 30, target: [0, 0, 0.8] },
    fill: { color: "#8cbde2", intensity: 0, elevation: 35, azimuth: 30, distance: 14 },
    hemi: { sky: "#fff3dc", ground: "#8a6844", intensity: 1.7 },
    // 예전 절차 방의 스탠드. 다락방에서는 쓰지 않는다(모델 불러오기 실패 때의 빈 방에도 없음).
    practical: { color: "#ffd77c", intensity: 1.4, distance: 4.8, glow: 0.25 },
    exposure: 1,
    background: "#cfe5ef",
    shadow: { mapSize: 2048, radius: 0, bias: -0.0004, normalBias: 0.04, intensity: 1, extent: 13, type: "pcf" },
  },

  /**
   * 밤(10-13 사용자 아이디어 "침대 상호작용 시 시간이 흐름"). 빈손으로 침대를 누르면 낮 ↔ 밤.
   * 색·세기는 랜딩의 저녁 스탠드 빛(room-layer.js lamp)과 같다. 거리는 게임 단위(1 = 0.5 m)라 랜딩의 2배,
   * 점광원 세기는 같은 자리가 같은 밝기가 되게 2^decay배. 점광원 둘은 낮에도 세기 0으로 켜 둬서 바꿀 때 셰이더를 다시 만들지 않는다.
   */
  night: {
    duration: 1.8, // 초. 해가 지는/뜨는 동안
    hemi: { sky: "#3a4a78", ground: "#24180f", intensity: 0.55 },
    ambient: { color: "#28304f", intensity: 0.5 },
    key: { color: "#9fb2e6", intensity: 0.3 }, // 천창으로 드는 달빛
    background: "#1d2440",
    lamp: { color: "#ffbe6a", intensity: 18, distance: 14, decay: 1.6 },
    glow: { color: "#bfd4ff", intensity: 4.8, distance: 6, decay: 2 },
    steam: { color: "#dbe3ff", strength: 0.8 },
  },

  wallWash: { amount: 0, scale: 1.25 },

  card: {
    thickness: 0.055, // 기준 두께. 실제 두께는 파일 크기로 곱해진다
    /**
     * 파일 크기 = 두께. 600MB 영상은 두툼하고 3KB 메모는 얇다.
     * 물건성을 주면서 정보도 같이 준다. 참고한 두 게임에 없는 우리만의 수단이다.
     */
    thicknessRange: { min: 0.45, max: 4.2 },
    thicknessReferenceKb: 700 * 1024, // 이 크기에서 max에 닿는다
    corner: 0.018,
    bevel: 0.004,
    // [임시] 형태로 읽히는 파일. 크기=두께 관계는 각 재질 안에서 유지한다.
    forms: {
      card: { thickness: 1 },
      photo: { aspect: 1.25, thickness: 0.22, corner: 0.012, bevel: 0.002, edge: "#eee7d7" },
      note: { aspect: 1, thickness: 0.35, corner: 0.012, bevel: 0.002, fold: 0.16, edge: "#e4cc73" },
      // 다락방 책 더미(10-11). 크기=두께는 그대로, 책답게 두툼하게. 옆면 = 종이 묶음.
      book: { aspect: 1.33, thickness: 2.4, corner: 0.016, bevel: 0.006, edge: "#efe3c4" },
    },
    faceColor: "#fff0cc",
    edgeTint: 0.5,
    /**
     * 쌓기. 겹친 면적이 카드 넓이의 이 비율을 넘으면 아래 카드 위에 얹힌다.
     * 살짝 스친 것만으로 떠오르면 책상이 들썩여 보인다.
     */
    stackOverlap: 0.16,
    stackGap: 0.004, // 얹힌 카드 사이의 아주 얇은 틈

    /** 상태별 높이 */
    restHeight: 0,
    hoverHeight: 0.09,
    liftHeight: 0.62,
    /** 스프링: freq가 클수록 빠르고, damping 1이면 오버슛 없음 */
    spring: { freq: 4.4, damping: 0.78 },
    dragSpring: { freq: 9.5, damping: 0.9 },
    /**
     * 손을 떠나는 카드(내려놓기·상자에 넣기)의 포물선 (2026-10-13 사용자). 무게 = 두께 배율(파일 크기).
     * 가벼운 파일(heavy 0): 높고 느리게, 팔랑이며 사뿐히. 무거운 파일(heavy 1): 낮고 빠르게 툭, 작게 튄다.
     * time 초(거리 3 기준), apex 꼭대기 높이(거리 3 기준), bounce 착지 뒤 위로 튀는 속도, flutter 좌우 흔들림 폭,
     * stagger 여러 장일 때 장당 시간차(초). 도착점은 무게와 상관없이 늘 겨눈 자리다.
     */
    toss: {
      // 좌클릭으로 바닥에 놓을 때. 10-13 21시 "휴지 같다" → 팔랑임·흔들림 빼고 덜 뜨게
      light: { time: 0.5, apex: 0.62, bounce: 0.2, flutter: 0, tilt: 0 },
      heavy: { time: 0.34, apex: 0.28, bounce: 1.25, flutter: 0, tilt: 0 },
      stagger: 0.035, staggerMax: 0.45,
    },
    /**
     * 우클릭 던지기(10-13 21시 사용자: 보는 방향으로, 위로도). 누른 만큼 세게(chargeTime초면 가득), 시선 방향으로.
     * 속도는 게임 단위/초(1 = 0.5 m), 중력도 게임 단위(실제 19.6보다 조금 세게 — 둥실 뜨는 '휴지' 느낌을 빼려고).
     * 같은 힘이면 무거운 파일이 덜 날아간다(heavyFactor). 여러 장은 spread(라디안)·speedJitter로 살짝 흩어진다.
     */
    throw: {
      chargeTime: 0.9, minSpeed: 3.5, maxSpeed: 17,
      lightFactor: 1.08, heavyFactor: 0.8,
      gravity: 22, upBias: 0.12,
      wallBounce: 0.35, slideOff: 2.2,
      spread: 0.05, speedJitter: 0.06,
      tumble: 0.35, // 날아가는 동안 진행 방향으로 기우는 정도
      previewDots: 22,
    },
    /** 더미로 집을 때 뒤 카드가 따라오는 지연 (장당 초) */
    pileLag: 0.028,
    pileLagMax: 0.34,
    /** 드래그 방향으로 기우는 정도 */
    tiltPerSpeed: 0.085,
    tiltMax: 0.42,
    /** 집을 때 살짝 커짐 */
    liftScale: 1.06,
    /** 상자에 들어간 뒤 */
    placedScale: 0.8, // 다락방 상자(폭 1.03) 안에 들어가는 크기
    placedStack: 0.05, // 한 장 쌓일 때마다 올라가는 높이
    /** 충돌로 튕겨 돌아올 때 */
    rejectHop: 0.5,
    rejectWobble: 0.5,
    selectGlow: 0.12,
    /** 충돌·실패 카드의 옆면 색. 섬광이 지나간 뒤에도 남는다 */
    conflictColor: "#ff8276",
    errorColor: "#ffcf6b",
  },

  label: {
    /** 카드 윗면에 굽는 텍스처 해상도 */
    texture: { width: 400, height: 244, dpi: 1 },
    /** 항상 떠 있는 HTML 라벨 대신, 가리키는 카드에만 크게 띄운다 */
    hoverDelay: 0,
  },

  box: {
    wall: 0.075,
    // models/box.glb ×2 (0.493 m). 예전 코드 상자는 1.08.
    height: 0.98,
    innerPad: 0.06,
    // 나무 상자. 책상보다 밝아야 "담는 그릇"으로 읽힌다
    color: "#bd7549",
    rimColor: "#f2ba72",
    targetRimColor: "#ffdb68",
    virtualRimColor: "#8ee6a5",
    lift: 0.025,
    innerGlow: 0.12,
    spring: { freq: 6.5, damping: 0.7 },
  },

  pile: {
    maxHeight: 0.48, // 전체 대기열에 대한 남은 비율로 낮아진다.
    cardGap: 0.014,
    maxVisible: 14,
    jitter: 0.02,
    spring: { freq: 5.5, damping: 0.8 },
  },

  /** 상자 위에 더미를 올려 두면 열리는 시간(ms) */
  springOpenMs: 650,
  /** 몇 개 들어갔는지 상자 위에 떠오르는 숫자 */
  popup: { riseMs: 1100 },
  /** 클릭과 드래그를 가르는 화면 이동량(px) */
  dragThreshold: 5,
  /** 파동으로 카드가 쏟아질 때 장당 지연(초) */
  supplyStagger: 0.045,
  supplyRise: 0.9,
};

/** 각도 → 방향 벡터 성분. elevation 0 = 수평, 90 = 바로 위 */
export function directionFromAngles(elevationDeg, azimuthDeg) {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  const horizontal = Math.cos(el);
  return { x: horizontal * Math.sin(az), y: Math.sin(el), z: horizontal * Math.cos(az) };
}

/**
 * 임계 감쇠 스프링 한 스텝. 큰 dt에서도 터지지 않게 나눠 적분한다.
 * @returns {[number, number]} [새 위치, 새 속도]
 */
export function springStep(value, velocity, target, dt, { freq, damping }) {
  const omega = 2 * Math.PI * freq;
  const steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.016)));
  const h = dt / steps;
  let x = value;
  let v = velocity;
  for (let i = 0; i < steps; i += 1) {
    v += (-2 * damping * omega * v - omega * omega * (x - target)) * h;
    x += v * h;
  }
  return [x, v];
}
