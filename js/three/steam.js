/**
 * steam.js — 책상 머그잔 위로 피어오르는 김 (2026-10-13 사용자 아이디어 "커피에 김 모락모락").
 * 스프라이트 몇 장이 천천히 오르며 커지고, 흔들리다 사라진다. 메시가 아니라서 버텍스 스냅·외곽선을 타지 않는다.
 * 게임(scene-kit)과 랜딩(room-layer)이 같이 쓴다. 크기는 머그잔 너비에 맞춘다.
 */
import * as THREE from "three";
import { STEAM, puffPose } from "./steam-path.js";

export { STEAM };


let wispTexture = null;
function wisp() {
  if (wispTexture) return wispTexture;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 96;
  const g = c.getContext("2d");
  // 둥근 덩이 셋을 살짝 어긋나게 겹쳐 가장자리가 고르지 않게
  for (const [x, y, r, a] of [[32, 58, 26, 0.75], [24, 40, 18, 0.55], [40, 30, 15, 0.45]]) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 96);
  }
  wispTexture = new THREE.CanvasTexture(c);
  wispTexture.colorSpace = THREE.SRGBColorSpace;
  return wispTexture;
}

export class Steam {
  /** top: 머그 입구 중심(월드), width: 머그 너비(월드). */
  constructor(top, width, opts = {}) {
    this.opts = { ...STEAM, ...opts };
    this.width = width;
    this.group = new THREE.Group();
    this.group.name = "mug-steam";
    this.group.position.copy(top);
    this.group.userData.noSnap = true;
    this.puffs = [];
    for (let i = 0; i < this.opts.puffs; i++) {
      const material = new THREE.SpriteMaterial({
        map: wisp(), color: this.opts.color, transparent: true, opacity: 0, depthWrite: false, fog: false,
      });
      material.userData.outlineParameters = { visible: false };
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0.25);
      sprite.renderOrder = 2;
      sprite.raycast = () => {}; // 조준선이 김을 집지 않게
      this.group.add(sprite);
      this.puffs.push(sprite);
    }
    this.update(0);
  }

  /** 김은 조명을 받지 않는다(밝은 낮 그대로면 밤에 하얗게 뜬다). 조명 프리셋이 바뀔 때 색과 진하기를 맞춘다. */
  setTint(color = this.opts.color, strength = 1) {
    this.strength = strength;
    for (const sprite of this.puffs) sprite.material.color.set(color);
  }

  update(t) {
    const w = this.width, k = this.strength ?? 1;
    this.puffs.forEach((sprite, i) => {
      const pose = puffPose(i, t, this.opts);
      sprite.position.set(pose.x * w, pose.y * w, pose.z * w);
      sprite.scale.set(pose.scale * w, pose.scale * w * 1.5, 1);
      sprite.material.opacity = pose.opacity * k;
      sprite.material.rotation = pose.rotation;
    });
  }

  dispose() {
    for (const sprite of this.puffs) sprite.material.dispose();
    this.group.removeFromParent();
    if (this.coffee) { this.coffee.geometry.dispose(); this.coffee.material.dispose(); this.coffee.removeFromParent(); }
  }
}

/**
 * 방 모델에서 "Mug" 노드를 찾아 그 위에 김을 세운다. 없으면 null.
 * 손잡이 때문에 상자 중심은 잔 중심이 아니다 — 입구 테두리 꼭짓점들의 평균이 잔 중심, 가장 가까운 것이 안쪽 반지름.
 * 모델의 잔은 비어 있어서 커피 면(원판)을 하나 채운다.
 */
export function steamFromMug(room, parent, opts) {
  const mug = room.getObjectByName("Mug");
  if (!mug?.geometry) return null;
  room.updateMatrixWorld(true);
  const pos = mug.geometry.attributes.position, v = new THREE.Vector3(), pts = [];
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mug.matrixWorld);
    pts.push(v.clone());
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const rim = pts.filter((p) => p.y > maxY - (maxY - minY) * 0.06);
  const center = rim.reduce((c, p) => c.add(p), new THREE.Vector3()).multiplyScalar(1 / rim.length);
  const dists = rim.map((p) => Math.hypot(p.x - center.x, p.z - center.z)).sort((a, b) => a - b);
  const inner = dists[0], outer = dists[dists.length - 1];
  const scale = parent.getWorldScale(new THREE.Vector3()).x;

  const top = parent.worldToLocal(new THREE.Vector3(center.x, maxY, center.z));
  const steam = new Steam(top, (outer * 2) / scale, opts);
  parent.add(steam.group);

  // 커피 면: 테두리보다 조금 아래, 안쪽 반지름보다 살짝 작게
  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(inner * 0.97 / scale, 24),
    new THREE.MeshBasicMaterial({ color: "#4a2c1c" }),
  );
  coffee.name = "mug-coffee";
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.copy(parent.worldToLocal(new THREE.Vector3(center.x, maxY - (maxY - minY) * 0.12, center.z)));
  coffee.userData.noSnap = true;
  coffee.raycast = () => {};
  parent.add(coffee);
  steam.coffee = coffee;
  return steam;
}
