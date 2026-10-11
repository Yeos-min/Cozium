/**
 * assets.js — 3D 모델 교체 지점. **여기만 고치면 프리미티브가 실제 모델로 바뀐다.**
 *
 * `null`인 슬롯은 코드가 만든 프리미티브(둥근 카드, 나무 상자)를 쓴다.
 * `models/` 폴더에 .glb를 넣고 아래 경로를 채우면 그 모델이 대신 들어간다.
 * 규격과 주의사항은 `models/README.md`에 있다.
 *
 * 파일이 없거나 깨졌으면 콘솔에 한 줄 남기고 프리미티브로 되돌아간다. 장면은 죽지 않는다.
 */


/**
 * @typedef {object} ModelSlot
 * @property {string|null} url               .glb 경로. null이면 프리미티브
 * @property {Record<string,string>} [byFamily]  계열별로 다른 모델을 쓰고 싶을 때
 * @property {number} [scale=1]              불러온 뒤 곱할 배율
 * @property {[number,number,number]} [rotation]  라디안. 축이 안 맞을 때
 * @property {[number,number,number]} [offset]    월드 단위 위치 보정
 * @property {boolean} [fit=true]            아래 크기에 맞춰 자동 정규화
 * @property {string} [nodeName]            GLTFLoader가 불러온 이름으로 일부 오브젝트만 선택
 * @property {boolean} [opaque=false]       불필요한 GLB 투명 설정 보정
 */

/** @type {Record<string, ModelSlot>} */
export const MODEL_MANIFEST = {
  // 파일 카드. fit=true면 가로 1.72 × 세로 1.04 × 두께에 맞춰 자동 축소된다.
  card: {
    url: null,
    byFamily: {
      // image: "./models/card-image.glb",
      // model3d: "./models/card-blend.glb",
    },
  },
  // 배송지 상자. 사용자 모델(10-11): 미터 단위, 원점 = 바닥 가운데, 앞(+Z) = 손잡이 구멍 있는 짧은 면.
  // 게임 단위(0.5 m)로 ×2만 한다. 맞춤(fit)을 쓰면 비율이 칸에 맞춰 찌그러진다.
  box: { url: "./models/box.glb", fit: false, scale: 2 },
  // 아직 안 꺼낸 파일 더미
  pile: { url: null },
  // (10-11) 침대·책상은 다락방 모델(room.glb) 안에 있다. 예전 `bed`(Bed.glb)·`desk` 슬롯은 뺐다.
};

/** 모델을 정규화해 넣을 기준 크기 (월드 단위) */
export const SLOT_SIZE = {
  card: { x: 1.72, y: 0.055, z: 1.04 },
  box: { x: 2.0, y: 0.66, z: 1.12 },
  pile: { x: 1.5, y: 0.5, z: 0.92 },
};

const cache = new Map();
const warned = new Set();
let loaderPromise = null;

async function getLoader() {
  if (!loaderPromise) {
    // GLTFLoader는 112KB다. 실제로 모델을 쓸 때만 받는다.
    loaderPromise = import("three/addons/loaders/GLTFLoader.js").then((module) => new module.GLTFLoader());
  }
  return loaderPromise;
}

export function slotFor(kind, family) {
  const slot = MODEL_MANIFEST[kind];
  if (!slot) return null;
  const url = (family && slot.byFamily?.[family]) || slot.url;
  return url ? { ...slot, url } : null;
}

export function hasAnyModel() {
  return Object.values(MODEL_MANIFEST).some((slot) => slot.url || Object.keys(slot.byFamily ?? {}).length > 0);
}

/**
 * 모델을 불러 장면에 넣을 수 있는 Object3D를 돌려준다. 실패하면 null.
 * 같은 url은 한 번만 받고 복제해서 쓴다.
 *
 * @param {object} THREE  three 모듈 (호출부가 이미 들고 있다)
 * @param {string} kind   MODEL_MANIFEST의 키
 * @param {string} [family]
 */
export async function loadModel(THREE, kind, family) {
  const slot = slotFor(kind, family);
  if (!slot) return null;
  const { url } = slot;

  try {
    if (!cache.has(url)) {
      const loader = await getLoader();
      cache.set(
        url,
        loader.loadAsync(url).then((gltf) => gltf.scene),
      );
    }
    const source = await cache.get(url);
    const selected = slot.nodeName ? source.getObjectByName(slot.nodeName) : source;
    if (!selected) throw new Error(`모델 오브젝트를 찾을 수 없습니다: ${slot.nodeName}`);
    // Keep the selected node's world transform, then normalize a wrapper group.
    const object = slot.nodeName ? new THREE.Group() : source.clone(true);
    if (slot.nodeName) {
      source.updateMatrixWorld(true);
      const instance = selected.clone(true);
      selected.matrixWorld.decompose(instance.position, instance.quaternion, instance.scale);
      object.add(instance);
    }

    if (slot.fit !== false && SLOT_SIZE[kind]) {
      const target = SLOT_SIZE[kind];
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const ratio = Math.min(
        size.x > 0 ? target.x / size.x : Infinity,
        size.y > 0 ? target.y / size.y : Infinity,
        size.z > 0 ? target.z / size.z : Infinity,
      );
      if (Number.isFinite(ratio) && ratio > 0) object.scale.multiplyScalar(ratio);
      // 원점을 바닥 중앙으로
      const fitted = new THREE.Box3().setFromObject(object);
      const center = fitted.getCenter(new THREE.Vector3());
      object.position.sub(new THREE.Vector3(center.x, fitted.min.y, center.z));
    }

    if (slot.scale) object.scale.multiplyScalar(slot.scale);
    if (slot.rotation) object.rotation.set(...slot.rotation);
    if (slot.offset) object.position.add(new THREE.Vector3(...slot.offset));

    object.traverse((child) => {
      if (child.isMesh) {
        if (slot.opaque) {
          const opaqueMaterial = (sourceMaterial) => {
            const result = sourceMaterial.clone();
            result.transparent = false;
            result.opacity = 1;
            result.depthWrite = true;
            return result;
          };
          child.material = Array.isArray(child.material) ? child.material.map(opaqueMaterial) : opaqueMaterial(child.material);
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  } catch (error) {
    if (!warned.has(url)) {
      warned.add(url);
      console.warn(`[정리대] 모델을 불러오지 못해 프리미티브로 대체합니다: ${url}`, error);
    }
    return null;
  }
}
