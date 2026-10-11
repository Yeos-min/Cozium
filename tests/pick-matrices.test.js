import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.module.min.js";
import { updatePickMatrices } from "../js/three/pick-matrices.js";

function makeScene() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 100);
  camera.position.set(0, 3, 9);
  camera.lookAt(0, 0, 0);
  scene.add(camera);
  const parents = [];
  const targets = [];
  for (let index = 0; index < 4; index += 1) {
    const parent = new THREE.Group();
    parent.position.set((index - 1.5) * 2, 0, 0);
    world.add(parent);
    const target = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.7, 1.5),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    target.position.y = 0.12;
    target.userData.id = String(index);
    parent.add(target);
    parents.push(parent);
    targets.push(target);
  }
  scene.updateMatrixWorld();
  return { scene, world, camera, parents, targets };
}

function cast(state, ndc, targeted) {
  if (targeted) updatePickMatrices(state.camera, state.targets);
  else state.scene.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(...ndc), state.camera);
  return raycaster.intersectObjects(state.targets, true).map((hit) => ({
    id: hit.object.userData.id,
    distance: hit.distance,
  }));
}

function assertSameHits(expected, actual, message) {
  assert.deepEqual(actual.map((hit) => hit.id), expected.map((hit) => hit.id), message);
  expected.forEach((hit, index) => {
    assert.ok(Math.abs(hit.distance - actual[index].distance) < 1e-10, message);
  });
}

test("picking follows moved, rotated and scaled target parents before another render", () => {
  const changes = [
    (state) => state.parents[1].position.set(0, 0.5, 1),
    (state) => {
      state.parents[1].rotation.set(0.3, 0.9, 0.2);
      state.parents[1].scale.set(1.2, 0.8, 0.6);
    },
    (state) => {
      state.world.position.set(0.8, 0.2, -0.7);
      state.world.rotation.y = 0.7;
      state.world.scale.set(1.1, 0.9, 1.2);
    },
    (state) => {
      state.scene.position.set(2, 0, 0);
      state.scene.rotation.y = 0.2;
    },
  ];
  for (const change of changes) {
    const full = makeScene();
    const targeted = makeScene();
    change(full);
    change(targeted);
    let hitRays = 0;
    for (let x = -6; x <= 6; x += 1) {
      for (let y = -4; y <= 4; y += 1) {
        const ndc = [x / 10, y / 10];
        const expected = cast(full, ndc, false);
        assertSameHits(expected, cast(targeted, ndc, true), "target hierarchy differs from a full scene update");
        hitRays += Number(expected.length > 0);
      }
    }
    assert.ok(hitRays > 0, "comparison must include actual hits");
  }
});

test("picking updates a moved camera and its parent before constructing the ray", () => {
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 100);
  camera.position.z = 8;
  parent.add(camera);
  scene.add(parent);
  const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  target.position.x = 2;
  scene.add(target);
  scene.updateMatrixWorld();
  parent.position.x = 2;
  parent.rotation.y = Math.PI / 2;
  camera.position.z = 6;
  updatePickMatrices(camera, [target]);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  assert.ok(raycaster.ray.origin.distanceTo(new THREE.Vector3(8, 0, 0)) < 1e-12);
  assert.ok(raycaster.ray.direction.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-12);
  assert.equal(raycaster.intersectObject(target)[0]?.object, target);
  const projected = new THREE.Vector3(2, 0, 0).project(camera);
  assert.ok(Math.abs(projected.x) < 1e-12 && Math.abs(projected.y) < 1e-12, "camera inverse must be current too");
});

test("recursive picking updates a descendant mesh under a target group", () => {
  const state = makeScene();
  const group = new THREE.Group();
  const nested = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  group.add(nested);
  nested.add(mesh);
  state.world.add(group);
  state.scene.updateMatrixWorld();
  group.position.x = 2;
  nested.position.x = -1;
  mesh.position.x = -1;
  state.targets = [group];
  updatePickMatrices(state.camera, state.targets);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), state.camera);
  assert.equal(raycaster.intersectObjects(state.targets, true)[0]?.object, mesh);
  assert.ok(Math.abs(mesh.matrixWorld.elements[12]) < 1e-12);
});

test("a target with a manual local matrix follows subsequent parent movement", () => {
  const full = makeScene();
  const targeted = makeScene();
  for (const state of [full, targeted]) {
    state.targets[1].matrixAutoUpdate = false;
    state.parents[1].position.set(0, 0.5, 1);
  }
  let hitRays = 0;
  for (let x = -4; x <= 4; x += 1) {
    for (let y = -3; y <= 3; y += 1) {
      const expected = cast(full, [x / 10, y / 10], false);
      assertSameHits(expected, cast(targeted, [x / 10, y / 10], true), "manual target matrix lost the parent transform");
      hitRays += Number(expected.length > 0);
    }
  }
  assert.ok(hitRays > 0);
  assert.deepEqual(targeted.targets[1].matrixWorld.toArray(), full.targets[1].matrixWorld.toArray());
});

test("picking does not update unrelated scenery or a target's sibling decoration", () => {
  const state = makeScene();
  const scenery = new THREE.Group();
  const decoration = new THREE.Object3D();
  state.scene.add(scenery);
  state.parents[1].add(decoration);
  state.scene.updateMatrixWorld();
  let unrelatedUpdates = 0;
  for (const object of [scenery, decoration]) {
    const updateMatrix = object.updateMatrix;
    object.updateMatrix = function () {
      unrelatedUpdates += 1;
      return updateMatrix.call(this);
    };
    object.position.x = 3;
  }
  state.parents[1].position.x = 0;
  updatePickMatrices(state.camera, state.targets);
  assert.equal(unrelatedUpdates, 0);
  assert.equal(state.targets[1].matrixWorld.elements[12], 0);
});

