/** 집기 대상과 그 조상만 갱신한다. 방 장식은 레이캐스트에 쓰이지 않는다. */
export function updatePickMatrices(camera, objects) {
  camera.updateWorldMatrix(true, false, true);
  for (const object of objects) object.updateWorldMatrix(true, true, true);
}