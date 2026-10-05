// Reserved for model typography. The postprocessor renders this layer last,
// against the original scene depth, so text stays sharp without showing through objects.
export const TEXT_LAYER = 1;

export function makeTextOverlay(THREE, mesh, texture, faceIndex) {
  const ink = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const materials = mesh.material.map((_, index) => index === faceIndex ? ink : hidden);
  const overlay = new THREE.Mesh(mesh.geometry, materials);
  overlay.layers.set(TEXT_LAYER);
  overlay.userData.modelText = true;
  overlay.raycast = () => {}; // Text must not add a new picking surface.
  mesh.add(overlay); // Inherits scale, thickness, rotations and animation exactly.
  return {
    mesh: overlay,
    setTexture(next) { ink.map = next; ink.needsUpdate = true; },
    dispose() { overlay.removeFromParent(); ink.dispose(); hidden.dispose(); },
  };
}
