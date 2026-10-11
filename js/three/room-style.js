// Same vendored module as the browser import map; also importable by the Node geometry tests.
import * as THREE from "../../vendor/three/three.module.min.js";
import { TUNING } from "./tuning.js";

export function makeFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const colors = TUNING.desk.floorColors;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = colors[(x + y) % 2];
    ctx.fillRect(x * 16, y * 16, 16, 16);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
