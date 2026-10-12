import * as THREE from "../../vendor/three/three.module.min.js";

const snapVertex = /* glsl */`
  if (retroSnapEnabled > 0.5 && gl_Position.w > 0.000001) {
    vec2 screenUv = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
    screenUv = floor(screenUv * retroSnapGrid + 0.5) / retroSnapGrid;
    gl_Position.xy = (screenUv * 2.0 - 1.0) * gl_Position.w;
  }
`;

/** Projected vertex snapping. World geometry, collisions and shadow cameras stay intact. */
export class VertexSnapEffect {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.patched = new WeakSet();
    this.size = new THREE.Vector2();
    this.uniforms = {
      retroSnapEnabled: { value: 0 },
      retroSnapGrid: { value: new THREE.Vector2(1, 1) },
    };
  }

  patchMaterial(material) {
    if (!material || this.patched.has(material)) return;
    this.patched.add(material);
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    const uniforms = this.uniforms;
    material.onBeforeCompile = function(shader, renderer) {
      previousCompile.call(this, shader, renderer);
      if (!shader.vertexShader.includes("#include <project_vertex>")) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = "uniform float retroSnapEnabled;\nuniform vec2 retroSnapGrid;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + snapVertex);
    };
    material.customProgramCacheKey = () => previousKey + "|retro-vertex-snap-v1";
    material.needsUpdate = true;
  }

  prepare(scene) {
    const cellSize = this.settings.cellSizes[this.settings.preset] ?? 0;
    this.uniforms.retroSnapEnabled.value = cellSize > 0 ? 1 : 0;
    this.renderer.getDrawingBufferSize(this.size);
    this.uniforms.retroSnapGrid.value.copy(this.size).divideScalar(Math.max(0.001, cellSize * this.renderer.getPixelRatio()));
    scene.traverse(object => {
      // userData.noSnap: big static quads (a floor of four corners) whose corners would snap apart (landing, 10-13)
      if (!object.isMesh || object.userData.noSnap) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) this.patchMaterial(material);
    });
  }
}
