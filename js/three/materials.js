/**
 * materials.js — 표면 재질을 한곳에서 만든다. (Claude, 2026-10-11)
 *
 * 랜딩과 같은 그림(사용자 선택 10-11): 툰 3단(MeshToonMaterial + 3칸 그라데이션). `TUNING.render.material`을
 * "pbr"로 바꾸면 예전처럼 MeshStandardMaterial로 돌아간다. 거칠기·금속은 툰에 없는 값이라 넘기지 않는다.
 * 불러온 모델(방, 상자)의 PBR 재질은 `toonFrom`으로 같은 규칙에 맞춘다.
 */
import * as THREE from "../../vendor/three/three.module.min.js";
import { TUNING } from "./tuning.js";

let gradient = null;
/** 그림자 단계 3칸. 랜딩 room-layer.js와 같은 값. */
export function toonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export function isToon() {
  return (TUNING.render?.material ?? "pbr") === "toon";
}

const PBR_ONLY = ["roughness", "metalness", "roughnessMap", "metalnessMap", "envMap", "envMapIntensity", "clearcoat", "sheen"];

/** MeshStandardMaterial과 같은 인자를 받는다. */
export function surfaceMaterial(params = {}) {
  if (!isToon()) return new THREE.MeshStandardMaterial(params);
  const rest = { ...params };
  for (const key of PBR_ONLY) delete rest[key];
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...rest });
}

/** 불러온 모델의 재질 하나를 툰으로. 이름·텍스처·투명·양면·깊이 보정은 그대로 둔다(노멀맵만 뺌). */
export function toonFrom(material) {
  if (!isToon() || !material || material.isMeshToonMaterial || material.isMeshBasicMaterial || material.isShaderMaterial) return material;
  const out = new THREE.MeshToonMaterial({
    name: material.name,
    map: material.map ?? null,
    color: material.color?.clone() ?? new THREE.Color("#ffffff"),
    emissive: material.emissive?.clone() ?? new THREE.Color("#000000"),
    emissiveMap: material.emissiveMap ?? null,
    // 노멀맵은 넘기지 않는다(10-25): 3단 툰 경계에 회벽 요철이 섞여 벽에 들쭉날쭉한 명암 얼룩이 생겼다. 랜딩(room-layer.js)도 안 넘김
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits,
    gradientMap: toonGradient(),
  });
  out.userData = { ...material.userData };
  return out;
}
