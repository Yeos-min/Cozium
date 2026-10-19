/**
 * scene-kit.js — 렌더러, 카메라, 조명, 방, 좌표 변환.
 *
 * board-3d.js가 "무엇을 놓을지"를 정하고, 이 파일이 "어떻게 보일지"를 맡는다.
 * 논리 좌표(1280×720)와 월드 좌표를 오가는 변환도 여기 있다.
 */
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import { BOARD_SIZE } from "../ui/board-layout.js";
import { OutlineEffect } from "./outline-effect.js";
import { VertexSnapEffect } from "./vertex-snap.js";
import { makeFloorTexture } from "./room-style.js";
import { addWallWash } from "./wall-wash.js";
import { ATTIC_BOX, ATTIC_FLOOR, ATTIC_HALF, ATTIC_OBSTACLES, ATTIC_SCALE, ATTIC_SHELF_RUNS, ATTIC_SPAWN, ATTIC_STACK, ATTIC_URL, ATTIC_WALK, atticCeilingAt } from "./attic-room.js";
import { wallShelfSlots } from "./folder-shelves.js";
import { surfaceMaterial, toonFrom } from "./materials.js";
import { GodRays, findSkylight } from "./godrays.js";
import { STEAM, steamFromMug } from "./steam.js";
import { groundAt, moveWalker, safeWalkPosition, stepVertical } from "./walk-collision.js";
import { LookInput } from "./look-input.js";
import { updatePickMatrices } from "./pick-matrices.js";
import { RenderQuality, detectDeviceTier, renderPixelRatio } from "./render-quality.js";
import { TUNING, UNIT, directionFromAngles } from "./tuning.js";

export { THREE, CSS2DObject };

const HALF_W = BOARD_SIZE.width / 2;
const HALF_H = BOARD_SIZE.height / 2;
const DEG = Math.PI / 180;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * 논리 좌표의 한 점 → 월드 XZ. 다락방(10-11)에서는 파일 바닥(ATTIC_FLOOR)의 왼쪽 위 모서리가 논리 (0, 0)이다.
 * 예전에는 1280×720 보드의 가운데가 월드 원점이었다.
 */
export function toWorld(cx, cy) {
  return { x: ATTIC_FLOOR.minX + cx * UNIT, z: ATTIC_FLOOR.minZ + cy * UNIT };
}

/** 월드 XZ → 논리 좌표 */
export function toLogical(x, z) {
  return { cx: (x - ATTIC_FLOOR.minX) / UNIT, cy: (z - ATTIC_FLOOR.minZ) / UNIT };
}

export function toWorldSize(logical) {
  return logical * UNIT;
}

export class SceneKit {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.disposed = false;
    this.clock = new THREE.Clock();
    this.pointerNdc = new THREE.Vector2(0, 0);
    this.placement = "bottom";
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // 1인칭
    this.mode = "walk";
    // y = 발 높이(점프·상자 위), vy = 위아래 속도
    this.walk = { x: 0, z: 0, y: 0, vy: 0, grounded: true, yaw: 0, pitch: TUNING.firstPerson.pitch, vx: 0, vz: 0, bob: 0 };
    this.jumpRequested = false;
    this.lookInput = new LookInput();
    this.renderQuality = new RenderQuality(new URLSearchParams(location.search).get("quality"));
    this.moveInput = { forward: 0, strafe: 0, sprint: false };

    this.#buildRenderer();
    // 자동 화질의 처음 단계는 GPU로 짐작한다(외장 high, 내장 balanced, 소프트웨어 low). ?quality=high|low면 고정.
    this.renderQuality.setStartTier(detectDeviceTier(this.renderer.getContext()));
    this.#buildScene();
    this.vertexSnap = new VertexSnapEffect(this.renderer, TUNING.vertexWobble);
    this.vertexSnap.patchMaterial(this.outlineEffect.normalMaterial);
    this.#buildLights();
    this.#buildDesk();
    this.#buildRoom();
    this.#applyRenderQuality();

    this.resetWalk();
    this.#applyCamera();
  }

  // ───────────────────────── 구성 ─────────────────────────

  #buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    // 그림자는 프로필의 shadowEvery 프레임마다만 다시 그린다(가벼움: 3프레임에 한 번). 방은 움직이지 않는다.
    this.renderer.shadowMap.autoUpdate = false;
    this.frameIndex = 0;
    this.renderer.shadowMap.type = TUNING.light.shadow.type === "pcf" ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = TUNING.light.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.classList.add("board-canvas");
    this.outlineEffect = new OutlineEffect(this.renderer, { ...TUNING.outline }, TUNING.dithering);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.classList.add("board-labels");

    this.root.append(this.renderer.domElement, this.labelRenderer.domElement);
  }

  #buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(TUNING.light.background ?? TUNING.desk.background);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 100);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.world = new THREE.Group();
    this.scene.add(this.world);
  }

  #buildLights() {
    const { key, fill, hemi, shadow } = TUNING.light;

    this.hemiLight = new THREE.HemisphereLight(hemi.sky, hemi.ground, hemi.intensity);
    this.ambientLight = new THREE.AmbientLight(TUNING.light.ambient.color, TUNING.light.ambient.intensity);
    this.scene.add(this.hemiLight, this.ambientLight);
    // 밤의 스탠드와 노트북 화면빛. 낮에는 세기 0(빛 개수가 그대로라 밤이 될 때 셰이더를 다시 안 만든다). 자리는 방이 오면 잡는다.
    const { lamp, glow } = TUNING.night;
    this.lampLight = new THREE.PointLight(lamp.color, 0, lamp.distance, lamp.decay);
    this.screenGlow = new THREE.PointLight(glow.color, 0, glow.distance, glow.decay);
    this.lampLight.position.set(7.3, 2, 4.9);
    this.screenGlow.position.set(6.6, 2.2, 1.9);
    this.scene.add(this.lampLight, this.screenGlow);
    this.night = 0;       // 0 = 낮, 1 = 밤
    this.nightTarget = 0;

    this.keyLight = new THREE.DirectionalLight(key.color, key.intensity);
    const keyDir = directionFromAngles(key.elevation, key.azimuth);
    this.keyLight.position.set(keyDir.x * key.distance, keyDir.y * key.distance, keyDir.z * key.distance);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
    this.keyLight.shadow.radius = shadow.radius;
    this.keyLight.shadow.bias = shadow.bias;
    this.keyLight.shadow.normalBias = shadow.normalBias;
    this.keyLight.shadow.intensity = shadow.intensity ?? 1;
    const extent = shadow.extent ?? Math.max(BOARD_SIZE.width, BOARD_SIZE.height) * UNIT * 0.62;
    const shadowCamera = this.keyLight.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 1;
    shadowCamera.far = key.distance * 2.4;
    shadowCamera.updateProjectionMatrix();
    this.keyLight.target.position.set(...(key.target ?? [0, 0, -1]));
    this.scene.add(this.keyLight, this.keyLight.target);
    this.keyLight.target.updateMatrixWorld();

    const fillLight = new THREE.DirectionalLight(fill.color, fill.intensity);
    const fillDir = directionFromAngles(fill.elevation, fill.azimuth);
    fillLight.position.set(fillDir.x * fill.distance, fillDir.y * fill.distance, fillDir.z * fill.distance);
    if (fill.intensity > 0) this.scene.add(fillLight);
  }

  #buildDesk() {
    this.deskGroup = new THREE.Group();
    this.world.add(this.deskGroup);

    // 다락방 모델이 오기 전(또는 실패했을 때)의 바닥. 모델이 오면 숨긴다.
    const deskWidth = ATTIC_HALF.x * 2;
    const deskDepth = ATTIC_HALF.z * 2;

    this.deskTexture = makeFloorTexture();
    const repeat = TUNING.desk.floorRepeat;
    this.deskTexture.repeat.set(deskWidth / repeat, deskDepth / repeat);
    this.desk = new THREE.Mesh(
      new THREE.BoxGeometry(deskWidth, 0.4, deskDepth),
      surfaceMaterial({ color: 0xffffff, map: this.deskTexture, roughness: 0.94, metalness: 0 }),
    );
    this.desk.position.y = -0.2;
    this.desk.receiveShadow = true;
    this.deskGroup.add(this.desk);
    this.setPlacement("bottom");
  }

  /**
   * 1인칭 방. 사용자의 다락방(`models/room.glb`, 10-11)을 ×2로 불러온다. 오기 전에는 같은 크기의 빈 방(벽 넷)이
   * 서 있고, 오면 숨긴다. 불러오기에 실패해도 그 빈 방으로 놀 수 있다(가구 발자국·선반 자리는 같다).
   */
  #buildRoom() {
    const { wallThickness, color, trimColor } = TUNING.room;
    const wallHeight = 5.2;
    this.roomGroup = new THREE.Group();
    this.roomGroup.visible = true;
    this.world.add(this.roomGroup);
    this.roomHalf = { ...ATTIC_HALF };

    this.fallbackRoom = new THREE.Group();
    this.fallbackRoom.name = "attic-fallback-walls";
    this.roomGroup.add(this.fallbackRoom);
    const wallMaterial = surfaceMaterial({ color, roughness: 0.95, metalness: 0 });
    if (TUNING.wallWash.amount > 0) addWallWash(wallMaterial, TUNING.wallWash);
    const trimMaterial = surfaceMaterial({ color: trimColor, roughness: 0.8, metalness: 0 });
    const spans = [
      { w: this.roomHalf.x * 2 + wallThickness * 2, d: wallThickness, x: 0, z: -this.roomHalf.z - wallThickness / 2 },
      { w: this.roomHalf.x * 2 + wallThickness * 2, d: wallThickness, x: 0, z: this.roomHalf.z + wallThickness / 2 },
      { w: wallThickness, d: this.roomHalf.z * 2, x: -this.roomHalf.x - wallThickness / 2, z: 0 },
      { w: wallThickness, d: this.roomHalf.z * 2, x: this.roomHalf.x + wallThickness / 2, z: 0 },
    ];
    for (const span of spans) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(span.w, wallHeight, span.d), wallMaterial);
      wall.position.set(span.x, wallHeight / 2, span.z);
      wall.receiveShadow = true;
      this.fallbackRoom.add(wall);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(span.w * 1.001, 0.34, span.d * 1.6), trimMaterial);
      trim.position.set(span.x, 0.17, span.z);
      trim.receiveShadow = true;
      this.fallbackRoom.add(trim);
    }
    this.roomObstacles = ATTIC_OBSTACLES.map((obstacle) => ({ ...obstacle }));
    // 상자 칸: −x 처마 벽을 따라 바닥에 한 줄, 위에 한 단(선반 틀 없음, 10-11 사용자)
    this.shelfSlots = wallShelfSlots(ATTIC_SHELF_RUNS, ATTIC_BOX, { ...ATTIC_STACK, height: TUNING.box.height });
    this.roomReady = this.#loadAttic();
  }

  async #loadAttic() {
    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      // 받는 만큼 알린다(정리 시작 로딩 화면, 10-18). total을 모르면 0으로 온다.
      const gltf = await new GLTFLoader().loadAsync(ATTIC_URL, (event) => {
        this.root.dispatchEvent(new CustomEvent("roomprogress", { detail: { loaded: event.loaded, total: event.lengthComputable ? event.total : 0 } }));
      });
      if (this.disposed) return false;
      const room = gltf.scene;
      room.name = "attic-room";
      room.scale.setScalar(ATTIC_SCALE);
      room.updateMatrixWorld(true);
      let shell = null, shellVolume = 0;
      room.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const converted = materials.map(toonFrom);
        object.material = Array.isArray(object.material) ? converted : converted[0];
        if (materials.some((m) => m.name === "Laptop_screen")) this.laptopScreen = object;
        if (materials.some((m) => m.name === "Room")) {
          const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
          const volume = size.x * size.y * size.z;
          if (volume > shellVolume) { shellVolume = volume; shell = object; }
        }
      });
      this.roomGroup.add(room);
      this.attic = room;
      this.steam = steamFromMug(room, this.roomGroup, { opacity: 0.6 }); // 10-13: 책상 머그잔의 김(밝은 낮 벽이라 조금 진하게)
      if (this.laptopScreen) this.#lightLaptop(this.laptopScreen);
      this.#placeNightLights(room);
      this.fallbackRoom.visible = false;
      this.desk.visible = false;
      if (shell && TUNING.render.rays) this.#buildRays(shell);
      this.root.dataset.room = "attic";
      this.root.dispatchEvent(new Event("roomready"));
      return true;
    } catch (error) {
      console.warn("[정리대] 다락방 모델을 불러오지 못해 빈 방으로 둡니다:", ATTIC_URL, error);
      this.root.dataset.room = "fallback";
      return false;
    }
  }

  /** 책상 노트북 화면에 랜딩의 바탕화면을 띄운다. 랜딩에서 들어온 그 노트북이다. */
  #lightLaptop(mesh) {
    new THREE.TextureLoader().load("./assets/landing/parts/desktop-v4/wallpaper.webp", (texture) => { // 10-13 새 바탕화면
      if (this.disposed) { texture.dispose(); return; }
      texture.flipY = false; // glTF UV: 왼쪽 위가 (0, 0)
      texture.colorSpace = THREE.SRGBColorSpace;
      mesh.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    }, undefined, () => { /* 화면은 검은 채로 둔다 */ });
  }

  /** 밤 조명 자리: 버섯 스탠드(`Lantern`) 갓 아래, 노트북 화면 앞. 침대(`Bed.001`)는 누르는 범위로 상자 하나를 기억한다. */
  #placeNightLights(room) {
    const center = (object) => new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    const lantern = room.getObjectByName("Lantern");
    if (lantern) this.lampLight.position.copy(center(lantern)).add(new THREE.Vector3(-0.1, 0.1, 0));
    if (this.laptopScreen) {
      const screen = center(this.laptopScreen), toRoom = new THREE.Vector3(-screen.x, 0, -screen.z).normalize();
      this.screenGlow.position.copy(screen).addScaledVector(toRoom, 0.7);
    }
    const bed = room.getObjectByName("Bed001") ?? room.getObjectByName("Bed.001"); // GLTFLoader가 이름의 "."을 뺀다
    if (bed) this.bedBox = new THREE.Box3().setFromObject(bed);
    // 노트북(몸통 `Laptop` + 화면 `Laptop.001`): 누르는 범위 = 둘을 합친 상자(10-20 정리 끝내기)
    const laptop = new THREE.Box3();
    const body = room.getObjectByName("Laptop");
    if (body) laptop.expandByObject(body);
    if (this.laptopScreen) laptop.expandByObject(this.laptopScreen);
    if (!laptop.isEmpty()) this.laptopBox = laptop;
  }

  // ───────────────────────── 노트북 = 정리 끝내기 (10-20) ─────────────────────────

  /** 화면이 시야를 꽉 채우는 카메라 자리. 화면 메시(사각형)의 꼭짓점·법선으로 잰다. */
  laptopView() {
    const mesh = this.laptopScreen;
    if (!mesh?.geometry?.attributes?.normal) return null;
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position, points = [];
    for (let i = 0; i < position.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
    const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
    const normal = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0)
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
    if (normal.x * -center.x + normal.z * -center.z < 0) normal.negate(); // 방 가운데 쪽을 보는 면
    const right = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const up = normal.clone().cross(right).normalize();
    let halfW = 0, halfH = 0;
    for (const point of points) {
      const d = point.clone().sub(center);
      halfW = Math.max(halfW, Math.abs(d.dot(right)));
      halfH = Math.max(halfH, Math.abs(d.dot(up)));
    }
    const tan = Math.tan(this.camera.fov * DEG / 2);
    const distance = Math.min(halfH / tan, halfW / (tan * this.camera.aspect)) * TUNING.laptop.fill;
    const eye = center.clone().addScaledVector(normal, distance);
    const look = new THREE.Matrix4().lookAt(eye, center, new THREE.Vector3(0, 1, 0));
    return { center, normal, eye, quaternion: new THREE.Quaternion().setFromRotationMatrix(look) };
  }

  /** 지금 자리에서 노트북 화면 속으로. 화면이 꽉 차면 resolve(true). 노트북이 없으면 바로 false. */
  diveLaptop() {
    const view = this.laptopView();
    if (!view || this.dive) return Promise.resolve(false);
    const from = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
    // 화면 정면 몇 단위 앞을 거쳐 들어간다: 옆에서 눌러도 비스듬히 박히지 않고, 의자·책상 위로 넘어간다
    const via = view.center.clone().addScaledVector(view.normal, TUNING.laptop.approach);
    via.y = Math.max(via.y, Math.min(from.position.y, view.eye.y + 0.6));
    return new Promise((resolve) => {
      this.dive = { t: 0, direction: 1, duration: TUNING.laptop.dive, from, via, to: view, resolve };
    });
  }

  /** 화면 속에서 원래 서 있던 자리로 되돌아 나온다. 끝나면 걷기 카메라로. */
  surfaceLaptop() {
    const dive = this.dive;
    if (!dive) return Promise.resolve(false);
    return new Promise((resolve) => {
      Object.assign(dive, { direction: -1, duration: TUNING.laptop.surface, resolve });
    });
  }

  get diving() {
    return Boolean(this.dive);
  }

  #stepDive(dt) {
    const dive = this.dive;
    dive.t = clamp(dive.t + (dive.direction * dt) / dive.duration, 0, 1);
    const t = dive.t;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // 천천히 출발, 천천히 닿기
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    this.camera.position.set(
      a * dive.from.position.x + b * dive.via.x + c * dive.to.eye.x,
      a * dive.from.position.y + b * dive.via.y + c * dive.to.eye.y,
      a * dive.from.position.z + b * dive.via.z + c * dive.to.eye.z,
    );
    const turn = Math.min(1, t / 0.7); // 먼저 노트북 쪽으로 고개를 돌리고 다가간다
    this.camera.quaternion.slerpQuaternions(dive.from.quaternion, dive.to.quaternion, 1 - Math.pow(1 - turn, 3));
    if (dive.direction > 0 && t >= 1 && dive.resolve) { const done = dive.resolve; dive.resolve = null; done(true); }
    if (dive.direction < 0 && t <= 0) {
      const done = dive.resolve;
      this.dive = null;
      this.#applyCamera();
      done?.(true);
    }
  }

  /** 겨눴을 때 화면이 밝아지고, 다 치웠으면 화면이 천천히 숨 쉰다(부른다). */
  #stepLaptopGlow(dt) {
    const material = this.laptopScreen?.material;
    if (!material?.isMeshBasicMaterial) return;
    const target = this.laptopHover && !this.dive ? 1 : 0;
    this.laptopGlow = (this.laptopGlow ?? 0) + (target - (this.laptopGlow ?? 0)) * Math.min(1, dt * 10);
    const pulse = this.laptopCalling && !this.dive ? 0.5 + 0.5 * Math.sin(this.clock.elapsedTime * 3.2) : 0;
    material.color.setScalar(1 + TUNING.laptop.hoverGlow * this.laptopGlow + TUNING.laptop.callGlow * pulse * (1 - this.laptopGlow));
  }

  /** 낮 ↔ 밤. 바로 바뀌지 않고 TUNING.night.duration 동안 해가 진다(뜬다). */
  toggleNight() {
    this.nightTarget = this.nightTarget > 0.5 ? 0 : 1;
    this.root.dataset.time = this.nightTarget ? "night" : "day";
    return this.nightTarget === 1;
  }

  get isNight() {
    return this.nightTarget === 1;
  }

  #stepNight(dt) {
    if (this.night === this.nightTarget) return;
    const step = dt / TUNING.night.duration;
    this.night = this.nightTarget > this.night ? Math.min(1, this.night + step) : Math.max(0, this.night - step);
    this.#applyNight(this.night * this.night * (3 - 2 * this.night)); // 부드럽게 시작하고 멈춤
  }

  #applyNight(k) {
    const day = TUNING.light, N = TUNING.night;
    const mix = (target, a, b) => target.set(a).lerp(new THREE.Color(b), k);
    const lerp = (a, b) => a + (b - a) * k;
    mix(this.hemiLight.color, day.hemi.sky, N.hemi.sky);
    mix(this.hemiLight.groundColor, day.hemi.ground, N.hemi.ground);
    this.hemiLight.intensity = lerp(day.hemi.intensity, N.hemi.intensity);
    mix(this.ambientLight.color, day.ambient.color, N.ambient.color);
    this.ambientLight.intensity = lerp(day.ambient.intensity, N.ambient.intensity);
    mix(this.keyLight.color, day.key.color, N.key.color);
    this.keyLight.intensity = lerp(day.key.intensity, N.key.intensity);
    mix(this.scene.background, day.background ?? TUNING.desk.background, N.background);
    // 스탠드는 해가 반쯤 졌을 때부터 켜진다
    const lit = Math.min(1, Math.max(0, (k - 0.35) / 0.65));
    this.lampLight.intensity = N.lamp.intensity * lit;
    this.screenGlow.intensity = N.glow.intensity * lit;
    if (this.rays) {
      this.rays.base ??= { rays: this.rays.uniforms.strength.value, dust: this.rays.dustUniforms.strength.value };
      this.rays.uniforms.strength.value = this.rays.base.rays * (1 - k);
      this.rays.dustUniforms.strength.value = this.rays.base.dust * (1 - k);
      this.rays.on = k < 0.98;
    }
    this.steam?.setTint(new THREE.Color(STEAM.color).lerp(new THREE.Color(N.steam.color), k), lerp(1, N.steam.strength));
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** 천창으로 드는 햇살 줄기(랜딩과 같은 효과). 천창은 방 껍질에 위로 쏜 광선이 빠져나가는 곳으로 찾는다. */
  #buildRays(shell) {
    const bounds = new THREE.Box3().setFromObject(shell).expandByScalar(-0.3);
    bounds.min.y = 0.6;
    const corners = findSkylight(shell, bounds, { step: 0.12, y0: 2.4, near: 1.2 });
    if (!corners) return;
    const direction = this.keyLight.target.position.clone().sub(this.keyLight.position);
    this.rays = new GodRays(corners, direction, { dustSize: 32, drift: 0.1 });
  }

  /** 다락방은 선반 틀 없이 상자를 바닥에 바로 둔다(10-11). 칸 목록만 기억한다. */
  setFolderShelf(slots) {
    this.lastShelfSlots = slots;
  }

  /** 상자 배치 방식(board-3d가 "far" = 벽 상자 줄인지 본다). 다락방에서는 바닥 판이 따로 없다. */
  setPlacement(placement) {
    this.placement = placement;
    if (this.roomHalf) this.#clampWalk();
  }

  // ───────────────────────── 카메라 ─────────────────────────

  get isWalking() { return true; }

  #walkFov() {
    // Narrow app panels retain enough horizontal context to see the room, not only the shelf.
    const aspect = this.camera.aspect || 16 / 9;
    return Math.min(92, 2 * Math.atan(Math.tan(TUNING.firstPerson.fov * DEG / 2) * Math.max(1, 1.5 / aspect)) / DEG);
  }

  /** 핀보드·책 더미 앞에 서서 문 쪽 선반과 파일 바닥을 본다 */
  resetWalk() {
    this.clearLook();
    const bounds = this.#walkBounds();
    this.walk.x = clamp(ATTIC_SPAWN.x, bounds.minX, bounds.maxX);
    this.walk.z = clamp(ATTIC_SPAWN.z, bounds.minZ, bounds.maxZ);
    this.walk.yaw = ATTIC_SPAWN.yaw; // yaw 0 = -Z 방향
    this.walk.pitch = TUNING.firstPerson.pitch;
    this.walk.vx = 0;
    this.walk.vz = 0;
    this.walk.bob = 0;
    Object.assign(this.walk, { y: 0, vy: 0, grounded: true });
    this.#recoverWalk();
  }

  /** 다락방: 경사 천장이 눈높이보다 충분히 높은 곳까지만 걷는다(ATTIC_WALK). */
  #walkBounds() {
    return { ...ATTIC_WALK };
  }

  #clampWalk() {
    const bounds = this.#walkBounds();
    this.walk.x = clamp(this.walk.x, bounds.minX, bounds.maxX);
    this.walk.z = clamp(this.walk.z, bounds.minZ, bounds.maxZ);
  }

  #walkContext() {
    const fp = TUNING.firstPerson;
    return { bounds: this.#walkBounds(), radius: fp.bodyRadius,
      obstacles: this.walkObstacles ?? this.roomObstacles,
      // 높이가 있는 장애물(상자)은 발이 그보다 높으면 넘어간다. 그 위에 서면 머리가 지붕에 닿는 자리는 못 오른다.
      feet: this.walk.y ?? 0, step: fp.jump.step, ceilingAt: atticCeilingAt, headroom: fp.eyeHeight + fp.jump.headroom };
  }

  /** Space. 서 있을 때만 뛴다(공중 연속 점프 없음). */
  jump() {
    if (this.mode === "walk") this.jumpRequested = true;
  }

  #recoverWalk() {
    const safe = safeWalkPosition({ x: this.walk.x, z: this.walk.z }, this.#walkContext());
    if (!safe || (safe.x === this.walk.x && safe.z === this.walk.z)) return;
    Object.assign(this.walk, safe, { vx: 0, vz: 0 });
  }

  setWalkObstacles(obstacles) {
    this.walkObstacles = obstacles;
    if (!this.isWalking) return;
    this.#recoverWalk();
    this.#applyCamera();
  }

  /**
   * 락 입력은 다음 프레임에 전부 반영한다. 커서 드래그만 시간 기준으로 평활화한다.
   */
  look(dx, dy, locked = false) {
    if (this.mode !== "walk") return;
    const fp = TUNING.firstPerson;
    const sensitivity = locked ? fp.lockedSensitivity : fp.lookSensitivity;
    this.lookInput.add(dx, dy, { sensitivity, immediate: locked });
  }

  clearLook() { this.lookInput.clear(); }

  #stepLook(dt) {
    const fp = TUNING.firstPerson;
    const { yaw, pitch } = this.lookInput.consume(dt, { smoothing: fp.lookSmoothing });
    this.walk.yaw += yaw;
    this.walk.pitch = clamp(this.walk.pitch + pitch, fp.pitchRange[0], fp.pitchRange[1]);
  }

  /** 몸 앞 수평 방향 (시선 각도는 빼고) */
  forwardFlat() {
    const yaw = this.walk.yaw * DEG;
    return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  }

  /** 지금 서 있는 자리 */
  get eye() {
    return this.camera.position;
  }

  get yawRadians() {
    return this.walk.yaw * DEG;
  }

  /** @param {{forward?: number, strafe?: number, sprint?: boolean}} input */
  setMoveInput(input) {
    Object.assign(this.moveInput, input);
  }

  #applyCamera() {
    const fp = TUNING.firstPerson;
    const bob = fp.headBob > 0 ? Math.sin(this.walk.bob) * fp.headBob : 0;
    this.camera.position.set(this.walk.x, fp.eyeHeight + (this.walk.y ?? 0) + bob, this.walk.z);
    this.camera.rotation.set(this.walk.pitch * DEG, this.walk.yaw * DEG, 0);
  }

  #stepWalk(dt, lookDt = dt) {
    const fp = TUNING.firstPerson;
    this.#stepLook(lookDt);
    const yaw = this.walk.yaw * DEG;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const { forward, strafe } = this.moveInput;

    let dirX = -sin * forward + cos * strafe;
    let dirZ = -cos * forward - sin * strafe;
    const length = Math.hypot(dirX, dirZ);
    if (length > 1) {
      dirX /= length;
      dirZ /= length;
    }

    const speed = fp.moveSpeed * (this.moveInput.sprint ? fp.sprintMultiplier : 1);
    const smoothing = Math.min(1, dt * fp.moveSmoothing);
    this.walk.vx += (dirX * speed - this.walk.vx) * smoothing;
    this.walk.vz += (dirZ * speed - this.walk.vz) * smoothing;

    const context = this.#walkContext();
    Object.assign(this.walk, moveWalker({ x: this.walk.x, z: this.walk.z },
      { x: this.walk.vx * dt, z: this.walk.vz * dt }, context));
    this.#clampWalk();

    // 점프·낙하. 높이 h를 시간 t에 오르는 포물선: 중력 2h/t², 처음 속도 2h/t.
    const { jump } = fp;
    const gravity = (2 * jump.height) / (jump.rise * jump.rise);
    if (this.jumpRequested && this.walk.grounded) {
      this.walk.vy = gravity * jump.rise;
      this.walk.grounded = false;
    }
    this.jumpRequested = false;
    const ground = groundAt({ x: this.walk.x, z: this.walk.z }, context);
    const maxFeet = atticCeilingAt(this.walk.x) - fp.eyeHeight - jump.headroom;
    // 느린 프레임에서도 같은 포물선이 되게 1/120초씩 나눠 적분한다(최대 0.25초).
    const steps = Math.max(1, Math.ceil(Math.min(dt, 0.25) * 120));
    for (let i = 0; i < steps; i++) Object.assign(this.walk, stepVertical(this.walk, { dt: Math.min(dt, 0.25) / steps, ground, gravity, maxFeet }));

    const pace = Math.hypot(this.walk.vx, this.walk.vz);
    this.walk.bob = pace > 0.15 ? this.walk.bob + dt * fp.headBobSpeed * (pace / fp.moveSpeed) : this.walk.bob * 0.86;
    this.#applyCamera();
  }

  /**
   * 크기는 컨테이너가 정한다. 예전에는 여기서 16:9로 높이를 박았는데,
   * 전체 화면 모드에서는 뷰포트를 채워야 하므로 CSS(aspect-ratio 또는 height:100%)에 맡긴다.
   */
  resize() {
    const width = this.root.clientWidth || 1280;
    const height = this.root.clientHeight || Math.round((width * BOARD_SIZE.height) / BOARD_SIZE.width);
    this.camera.aspect = width / height;
    if (this.isWalking) this.camera.fov = this.#walkFov();
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(renderPixelRatio(width, height, window.devicePixelRatio, this.renderQuality.profile, this.renderQuality.scale));
    this.renderer.setSize(width, height, false);
    this.outlineEffect.resize();
    this.labelRenderer.setSize(width, height);
    this.#applyCamera();
    this.root.dataset.renderPixels = String(this.renderer.domElement.width * this.renderer.domElement.height);
  }

  setRenderQuality(mode) {
    this.renderQuality.set(mode);
    this.#applyRenderQuality();
  }

  refreshRenderStyle() {
    const profile = this.renderQuality.profile;
    Object.assign(this.outlineEffect.outline, TUNING.outline, { thickness: profile.effects ? TUNING.outline.thickness : 0 });
  }

  #applyRenderQuality() {
    const profile = this.renderQuality.profile;
    this.refreshRenderStyle();
    if (this.keyLight.shadow.mapSize.x !== profile.shadowSize) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.mapPass?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.mapPass = null;
      this.keyLight.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
    }
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
    this.root.dataset.renderQuality = this.renderQuality.active;
    this.root.dataset.renderScale = String(this.renderQuality.scale);
    this.root.dispatchEvent(new CustomEvent("renderqualitychange", { detail: {
      mode: this.renderQuality.mode, active: this.renderQuality.active, effects: profile.effects, scale: this.renderQuality.scale,
    } }));
  }

  /** 화면 좌표 → NDC */
  ndcFrom(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /**
   * 화면 좌표 → 높이 y의 수평면 위 월드 점.
   * 1인칭에서 지평선 위를 가리키면 광선이 바닥을 안 만난다. 그때는 null이다.
   */
  worldAt(clientX, clientY, height = 0) {
    const ndc = this.ndcFrom(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.groundPlane.constant = -height;
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, point)) return null;
    // 카메라 뒤나 지나치게 먼 곳은 버린다
    if (point.distanceTo(this.camera.position) > 200) return null;
    return point;
  }

  /**
   * 화면 좌표에서 오브젝트 집기.
   *
   * 카메라와 집기 대상의 월드 행렬을 먼저 갱신한다. 방 장식까지 순회하지 않는다.
   * 렌더 사이에 스토어가 바뀌어 오브젝트가 옮겨졌을 수 있고,
   * 그때 낡은 행렬로 레이캐스트하면 엉뚱한 것을 집는다. (배경 탭에서는 렌더가 아예 멈춘다.)
   */
  pick(clientX, clientY, objects) {
    if (objects.length === 0) return null;
    updatePickMatrices(this.camera, objects);
    this.raycaster.setFromCamera(this.ndcFrom(clientX, clientY), this.camera);
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  /**
   * 월드 점 → 캔버스 안 화면 좌표(px). 마퀴 판정과 라벨 위치에 쓴다.
   *
   * 카메라 행렬을 먼저 갱신한다. project()는 matrixWorldInverse를 쓰는데 그것은 render()에서만
   * 갱신되므로, 그냥 부르면 **직전 프레임의 카메라**로 투영된다. 1인칭에서는 그 한 프레임이 눈에 띈다.
   */
  toScreen(worldPoint) {
    this.camera.updateMatrixWorld();
    const projected = worldPoint.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((projected.x + 1) / 2) * rect.width,
      y: ((1 - projected.y) / 2) * rect.height,
      behind: projected.z > 1,
    };
  }

  setPointer(clientX, clientY) {
    this.pointerNdc.copy(this.ndcFrom(clientX, clientY));
  }

  // ───────────────────────── 루프 ─────────────────────────

  start(onFrame) {
    // 학교 PC에서도 같은 경로를 측정한다. 평소에는 계측 모듈을 불러오지 않는다.
    if (new URLSearchParams(location.search).get("profile") === "1") {
      Promise.all([import("./frame-profiler.js"), import("../../tools/game-pick-benchmark.js")]).then(([{ createFrameProfiler }, { mountPickBenchmark }]) => {
        if (this.disposed) return;
        this.profiler = createFrameProfiler(this);
        this.pickBenchmark = mountPickBenchmark(this);
      });
    }
    this.renderer.setAnimationLoop(() => {
      const elapsed = this.clock.getDelta();
      if (document.hidden || this.paused) { // paused: 결과 화면이 방을 덮고 있는 동안(10-18) 그리지 않는다
        if (this.profiler?.active) this.profiler.startFrame(elapsed);
        this.clearLook(); this.renderQuality.resetSamples(); return;
      }
      if (this.renderQuality.observe(elapsed)) this.#applyRenderQuality();
      this.#stepNight(Math.min(elapsed, 0.1));
      this.#stepLaptopGlow(Math.min(elapsed, 0.1));
      if (this.profiler?.active) this.profiler.startFrame(elapsed);
      const dt = Math.min(elapsed, 0.05);
      if (this.profiler?.active) {
        this.profiler.measure("camera", () => {
          if (this.dive) this.#stepDive(Math.min(elapsed, 0.1)); else this.#stepWalk(dt, Math.min(elapsed, 0.25));
        });
        this.profiler.measure("board", () => onFrame(dt));
        this.profiler.measure("webgl", () => this.#renderWebGL(dt));
        this.profiler.measure("labels", () => this.labelRenderer.render(this.scene, this.camera));
        this.profiler.endFrame();
      } else {
        if (this.dive) this.#stepDive(Math.min(elapsed, 0.1)); else this.#stepWalk(dt, Math.min(elapsed, 0.25));
        onFrame(dt);
        this.#renderWebGL(dt);
        this.labelRenderer.render(this.scene, this.camera);
      }
    });
  }

  /** 배경 탭에서는 렌더 루프가 멈춘다. 테스트가 손으로 한 프레임 돌릴 때 쓴다. */
  step(dt) {
    this.#stepWalk(dt);
  }

  #renderWebGL() {
    const profile = this.renderQuality.profile;
    if (this.frameIndex++ % profile.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
    this.steam?.update(this.clock.elapsedTime);
    this.vertexSnap.prepare(this.scene);
    this.outlineEffect.render(this.scene, this.camera);
    if (this.rays && TUNING.render.rays && profile.rays) {
      this.rays.render(this.renderer, this.camera, this.clock.elapsedTime, this.renderer.getPixelRatio());
    }
  }

  dispose() {
    this.disposed = true;
    this.steam?.dispose();
    if (this.roomGroup) this.roomGroup.userData.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.pickBenchmark?.dispose();
    this.profiler?.dispose();
    this.outlineEffect.dispose();
    this.scene.traverse((object) => {
      if (object.isMesh) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}
