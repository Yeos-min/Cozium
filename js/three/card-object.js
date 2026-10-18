/**
 * card-object.js — 파일 카드 하나.
 *
 * 프리미티브는 모서리를 둥글린 얇은 판이다. 윗면에 파일명 텍스처를 굽는다 (card-face.js).
 * `assets.js`의 MODEL_MANIFEST.card에 .glb를 넣으면 이 판 대신 그 모델이 들어간다.
 * 스프링·기울기·그림자 같은 손맛 코드는 모델이 바뀌어도 그대로 쓰인다.
 */
import { familyColor } from "../ui/board-layout.js";
import { loadModel } from "./assets.js";
import { makeCardTexture } from "./card-face.js";
import { makeTextOverlay } from "./text-overlay.js";
import { fileFootprint, formStyle } from "./file-form.js";
import { thicknessMultiplier } from "./stacking.js";
import { tossLanding, tossPlan, tossPose } from "./toss.js";
import { sampleThrow } from "./throw.js";
import { TUNING, springStep } from "./tuning.js";
import { surfaceMaterial } from "./materials.js";

const sharedGeometries = new Map();

/** 모서리 둥근 직사각형을 눕혀서 판으로. UV는 0..1로 정규화한다. */
export function buildCardGeometry(THREE, width, depth, thickness, style = {}) {
  const w = width;
  const h = depth;
  const r = Math.min(style.corner ?? TUNING.card.corner, Math.min(w, h) / 2 - 0.01);
  const fold = Math.min(w, h) * (style.fold ?? 0);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  if (fold) {
    // 메모지 오른쪽 아래가 안으로 접힌 실루엣. 표면의 접힘과 같은 크기다.
    shape.lineTo(w / 2 - fold, -h / 2);
    shape.lineTo(w / 2, -h / 2 + fold);
  } else {
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  }
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

  const bevel = Math.min(style.bevel ?? TUNING.card.bevel, thickness / 3);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, thickness - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
    UVGenerator: {
      generateTopUV(_geometry, vertices, indexA, indexB, indexC) {
        return [indexA, indexB, indexC].map((index) => {
          const x = vertices[index * 3];
          const y = vertices[index * 3 + 1];
          return new THREE.Vector2((x + w / 2) / w, (y + h / 2) / h);
        });
      },
      generateSideWallUV(_geometry, vertices, indexA, indexB, indexC, indexD) {
        return [indexA, indexB, indexC, indexD].map((index) => {
          const x = vertices[index * 3];
          const z = vertices[index * 3 + 2];
          return new THREE.Vector2((x + w / 2) / w, z / Math.max(thickness, 0.001));
        });
      },
    },
  });
  geometry.translate(0, 0, -thickness / 2 + bevel);
  geometry.rotateX(-Math.PI / 2); // 눕힌다: 판의 앞면이 위를 본다
  geometry.computeVertexNormals();
  return geometry;
}

export class CardObject {
  /**
   * @param {object} THREE
   * @param {object} args
   * @param {string} args.id
   * @param {{name:string,extension:string,size:number}} args.item
   * @param {number} args.width  월드 단위
   * @param {number} args.depth
   */
  constructor(THREE, { id, item, width, depth, loadThumbnail }) {
    this.THREE = THREE;
    this.id = id;
    this.item = item;
    const style = formStyle(item.extension);
    const footprint = fileFootprint(item.extension, { width, height: depth });
    this.width = width = footprint.width;
    this.depth = depth = footprint.height;
    this.form = style.kind;
    this.color = familyColor(item.family);
    this.disposed = false;

    const baseThickness = TUNING.card.thickness * style.thickness;
    const geometryKey = JSON.stringify([width, depth, baseThickness, style]);
    if (!sharedGeometries.has(geometryKey)) {
      sharedGeometries.set(geometryKey, buildCardGeometry(THREE, width, depth, baseThickness, style));
    }
    this.geometry = sharedGeometries.get(geometryKey);

    const tint = new THREE.Color(this.color).lerp(new THREE.Color(TUNING.card.faceColor), 1 - TUNING.card.edgeTint);
    if (style.edge) tint.set(style.edge);
    this.baseSideColor = tint.clone();
    this.statusColors = {
      conflict: new THREE.Color(TUNING.card.conflictColor),
      error: new THREE.Color(TUNING.card.errorColor),
    };
    this.faceMaterial = surfaceMaterial({
      map: makeCardTexture(THREE, item, this.color, loadThumbnail),
      roughness: this.form === "photo" ? 0.58 : this.form === "note" ? 0.9 : 0.82,
      metalness: 0.02,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: 1,
    });
    this.sideMaterial = surfaceMaterial({
      color: tint,
      roughness: 0.7,
      metalness: 0.04,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: 1,
    });

    this.group = new THREE.Group();
    this.group.userData.cardId = id;

    this.mesh = new THREE.Mesh(this.geometry, [this.faceMaterial, this.sideMaterial]);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.cardId = id;
    // 파일 크기만큼 두꺼워지고, 책상 위에 얹힌다 (지오메트리는 y=0을 중심으로 만들어져 있다)
    this.thicknessScale = thicknessMultiplier(item.size);
    // 던질 때의 무게 0(가벼움)…1(무거움): 두께 배율을 로그로 편다
    {
      const { min, max } = TUNING.card.thicknessRange;
      this.weight = Math.min(1, Math.max(0, Math.log(this.thicknessScale / min) / Math.log(max / min)));
    }
    this.flight = null;
    this.inHand = false;
    this.thickness = baseThickness * this.thicknessScale;
    this.mesh.scale.y = this.thicknessScale;
    this.mesh.position.y = this.thickness / 2;
    this.group.add(this.mesh);
    this.textOverlay = makeTextOverlay(THREE, this.mesh, this.faceMaterial.map.userData.textTexture, 0);

    // 집기 판정을 너그럽게 하는 보이지 않는 상자
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.04, 0.34, depth * 1.04),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hitbox.position.y = 0.12;
    this.hitbox.userData.cardId = id;
    this.group.add(this.hitbox);

    this.state = {
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      spin: 0, spinV: 0,
      tiltX: 0, tiltXV: 0,
      tiltZ: 0, tiltZV: 0,
      scale: 1, scaleV: 0,
      facePitch: 0, facePitchV: 0,
    };
    this.target = { x: 0, y: 0, z: 0, spin: 0, scale: 1, facePitch: 0 };
    this.spring = TUNING.card.spring;
    this.follow = 1;
    this.selected = false;
    this.hovered = false;
    this.status = "idle";
    this.glow = 0;
    this.flash = 0;

    this.#swapInModel();
  }

  async #swapInModel() {
    const model = await loadModel(this.THREE, "card", this.item.family);
    if (!model || this.disposed) return;
    this.mesh.visible = false;
    model.scale.y *= this.thicknessScale; // 모델도 파일 크기만큼 두꺼워진다
    this.group.add(model);
    this.model = model;
  }

  /** 애니메이션 없이 그 자리에 놓는다 (첫 등장) */
  place({ x, y = 0, z, spin = 0, scale = 1, facePitch = 0 }) {
    Object.assign(this.state, { x, y, z, spin, scale, facePitch, vx: 0, vy: 0, vz: 0, spinV: 0, scaleV: 0, facePitchV: 0 });
    Object.assign(this.target, { x, y, z, spin, scale, facePitch });
    this.#apply();
  }

  setTarget({ x, y, z, spin, scale, facePitch = 0 }) {
    if (x !== undefined) this.target.x = x;
    if (y !== undefined) this.target.y = y;
    if (z !== undefined) this.target.z = z;
    if (spin !== undefined) this.target.spin = spin;
    if (scale !== undefined) this.target.scale = scale;
    this.target.facePitch = facePitch;
  }

  /**
   * 손을 떠났다: 지금 자리에서 target까지 포물선으로 날아간다(TUNING.card.toss). target이 날아가는 동안 바뀌면
   * (쌓이는 높이가 정해지는 등) 그 새 자리로 간다. delay초 동안은 손 자리에 머문다(여러 장일 때 시간차).
   */
  launch(delay = 0) {
    const s = this.state;
    this.flight = { t: -delay, from: { x: s.x, y: s.y, z: s.z, spin: s.spin }, plan: null };
  }

  /** 우클릭으로 던졌다: 미리 계산한 궤적(throw.js)을 그대로 따라간다. 착지 뒤 겨눈 바닥 칸까지는 스프링으로 미끄러진다. */
  launchPath(path, delay = 0) {
    const s = this.state;
    this.flight = { t: -delay, path, spin0: s.spin };
  }

  /** 날아가는 중이면 자리·기울기를 정하고 true. 다 날았으면 착지(튀기)하고 false. 계산은 toss.js / throw.js. */
  #fly(dt) {
    const f = this.flight, s = this.state, tg = this.target, toss = TUNING.card.toss;
    f.t += dt;
    if (f.t < 0) return true; // 차례 기다리는 중: 손 자리 그대로
    if (f.path) return this.#followPath(f, s, tg, toss);
    if (!f.plan) { f.plan = tossPlan(f.from, tg, this.weight, toss); f.side = Math.random() > 0.5 ? 1 : -1; }
    const u = Math.min(1, f.t / f.plan.dur);
    if (u >= 1) {
      const land = tossLanding(this.weight, toss);
      Object.assign(s, { x: tg.x, y: tg.y, z: tg.z, vx: 0, vz: 0, vy: land.vy, spinV: 0 });
      s.scaleV += land.scaleV;
      this.flight = null;
      return false;
    }
    Object.assign(s, tossPose(f.from, tg, this.weight, u, f.plan, toss, f.side));
    s.vx = s.vy = s.vz = s.tiltZV = s.tiltXV = 0;
    return true;
  }

  #followPath(f, s, tg, toss) {
    const p = sampleThrow(f.path, f.t), u = Math.min(1, f.t / Math.max(0.01, f.path.duration));
    // 쌓일 자리(target.y)가 바닥보다 높으면 내려오다 거기서 멈춘다
    if (p.done || (p.vy < 0 && p.y <= tg.y && u > 0.5)) {
      const land = tossLanding(this.weight, toss);
      Object.assign(s, { x: p.x, y: Math.max(p.y, tg.y), z: p.z, vx: p.vx * 0.15, vz: p.vz * 0.15, vy: land.vy, spinV: 0 });
      s.scaleV += land.scaleV;
      this.flight = null;
      return false;
    }
    const tumble = TUNING.card.throw.tumble, speed = Math.hypot(p.vx, p.vz) || 1;
    s.x = p.x; s.y = p.y; s.z = p.z;
    s.spin = f.spin0 + (tg.spin - f.spin0) * u;
    // 진행 방향으로 코를 숙이고 든다(올라갈 때 들리고 내려올 때 숙임). 팔랑임은 없다.
    s.tiltX = Math.max(-0.6, Math.min(0.6, -Math.atan2(p.vy, speed) * tumble));
    s.tiltZ = 0;
    s.vx = s.vy = s.vz = s.tiltZV = s.tiltXV = 0;
    return true;
  }

  setStatus(status) {
    this.status = status;
  }

  setSelected(selected) {
    this.selected = selected;
  }

  setHovered(hovered) {
    this.hovered = hovered;
  }

  /** 충돌로 튕겨 돌아올 때 */
  reject() {
    this.state.vy += TUNING.card.rejectHop * 4;
    this.state.tiltZV += (Math.random() > 0.5 ? 1 : -1) * TUNING.card.rejectWobble * 12;
    this.flash = 1;
  }

  /** 더미에서 쏟아져 나올 때 */
  spillFrom({ x, z }, delay = 0) {
    this.state.x = x;
    this.state.z = z;
    this.state.y = TUNING.supplyRise;
    this.state.scale = 0.55;
    this.state.vy = 0;
    this.delay = delay;
    this.#apply();
  }

  update(dt) {
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return;
      this.delay = 0;
    }
    const s = this.state;
    const spring = this.spring;
    const scaled = { freq: spring.freq * this.follow, damping: spring.damping };

    const flying = this.flight ? this.#fly(dt) : false;
    if (!flying) {
      [s.x, s.vx] = springStep(s.x, s.vx, this.target.x, dt, scaled);
      [s.z, s.vz] = springStep(s.z, s.vz, this.target.z, dt, scaled);
      [s.y, s.vy] = springStep(s.y, s.vy, this.target.y, dt, { freq: scaled.freq * 1.15, damping: spring.damping });
      [s.spin, s.spinV] = springStep(s.spin, s.spinV, this.target.spin, dt, scaled);
    }
    [s.scale, s.scaleV] = springStep(s.scale, s.scaleV, this.target.scale, dt, { freq: 7, damping: 0.85 });
    [s.facePitch, s.facePitchV] = springStep(s.facePitch, s.facePitchV, this.target.facePitch, dt, { freq: 7, damping: 1 });

    // 움직이는 방향으로 기운다. 속도가 곧 손의 관성이다.
    if (!flying) {
      const tiltZTarget = Math.max(-TUNING.card.tiltMax, Math.min(TUNING.card.tiltMax, -s.vx * TUNING.card.tiltPerSpeed));
      const tiltXTarget = Math.max(-TUNING.card.tiltMax, Math.min(TUNING.card.tiltMax, s.vz * TUNING.card.tiltPerSpeed));
      [s.tiltZ, s.tiltZV] = springStep(s.tiltZ, s.tiltZV, tiltZTarget, dt, { freq: 6, damping: 0.7 });
      [s.tiltX, s.tiltXV] = springStep(s.tiltX, s.tiltXV, tiltXTarget, dt, { freq: 6, damping: 0.7 });
    }

    const glowTarget = this.selected ? TUNING.card.selectGlow : this.hovered ? TUNING.card.selectGlow * 0.4 : 0;
    this.glow += (glowTarget - this.glow) * Math.min(1, dt * 14);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    // 충돌·실패는 섬광이 지나간 뒤에도 옆면 색으로 남는다. 왜 안 들어갔는지 계속 보여야 한다.
    const statusColor = this.statusColors[this.status];
    this.sideMaterial.color.lerp(statusColor ?? this.baseSideColor, Math.min(1, dt * 9));

    this.#apply();
  }

  #apply() {
    const s = this.state;
    this.group.position.set(s.x, s.y, s.z);
    this.group.rotation.set(s.facePitch + s.tiltX, s.spin, s.tiltZ, "YXZ");
    this.group.scale.setScalar(s.scale);

    const emissive = this.faceMaterial.emissive;
    if (this.flash > 0.001) {
      emissive.setRGB(this.flash * 0.55, 0, 0);
      this.sideMaterial.emissive.setRGB(this.flash * 0.55, 0, 0);
    } else if (this.glow > 0.001) {
      const c = new this.THREE.Color("#d9ff57").multiplyScalar(this.glow * 0.5);
      emissive.copy(c);
      this.sideMaterial.emissive.copy(c);
    } else if (emissive.r + emissive.g + emissive.b > 0) {
      emissive.setScalar(0);
      this.sideMaterial.emissive.setScalar(0);
    }
  }

  get position() {
    return this.group.position;
  }

  dispose() {
    this.disposed = true;
    this.textOverlay.dispose();
    this.faceMaterial.dispose();
    this.sideMaterial.dispose();
    this.hitbox.geometry.dispose();
    this.hitbox.material.dispose();
    this.group.removeFromParent();
  }
}

export function disposeSharedCardGeometry() {
  for (const geometry of sharedGeometries.values()) geometry.dispose();
  sharedGeometries.clear();
}
