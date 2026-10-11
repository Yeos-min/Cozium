import * as THREE from "three";
import { TEXT_LAYER } from "./text-overlay.js";

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const compositeShader = /* glsl */`
  uniform sampler2D source;
  uniform sampler2D normals;
  uniform sampler2D depths;
  uniform float ditherLevels;
  uniform float ditherCellSize;
  uniform vec2 outlineStep;
  uniform vec2 cameraRange;
  uniform bool perspective;
  uniform float outlineOpacity;
  uniform vec3 outlineColor;
  uniform float inkTint;
  uniform float inkDark;
  uniform float depthThreshold;
  uniform float normalThreshold;
  uniform float normalThicknessRatio;
  varying vec2 vUv;
  float bayerThreshold(vec2 pixel) {
    vec2 p = mod(floor(pixel), 4.0);
    float value;
    if (p.y < 1.0) value = p.x < 1.0 ? 0.0 : p.x < 2.0 ? 8.0 : p.x < 3.0 ? 2.0 : 10.0;
    else if (p.y < 2.0) value = p.x < 1.0 ? 12.0 : p.x < 2.0 ? 4.0 : p.x < 3.0 ? 14.0 : 6.0;
    else if (p.y < 3.0) value = p.x < 1.0 ? 3.0 : p.x < 2.0 ? 11.0 : p.x < 3.0 ? 1.0 : 9.0;
    else value = p.x < 1.0 ? 15.0 : p.x < 2.0 ? 7.0 : p.x < 3.0 ? 13.0 : 5.0;
    return (value + 0.5) / 16.0;
  }
  float viewDepth(vec2 uv) {
    float d = texture2D(depths, uv).r;
    float near = cameraRange.x, far = cameraRange.y;
    return perspective ? near * far / max(far - d * (far - near), 0.00001) : mix(near, far, d);
  }
  void main() {
    vec3 color = texture2D(source, vUv).rgb;
    if (ditherLevels > 1.0) {
      float steps = ditherLevels - 1.0;
      float threshold = bayerThreshold(gl_FragCoord.xy / ditherCellSize);
      color = floor(clamp(color, 0.0, 1.0) * steps + threshold) / steps;
    }
    if (outlineOpacity > 0.0) {
      float centerDepth = viewDepth(vUv);
      vec3 centerNormal = texture2D(normals, vUv).rgb;
      float depthEdge = 0.0, normalEdge = 0.0;
      for (int i = 0; i < 4; i++) {
        float angle = float(i) * 0.785398;
        vec2 offset = vec2(cos(angle), sin(angle)) * outlineStep;
        vec2 a = vUv + offset, b = vUv - offset;
        // Opposite samples suppress outlines on a continuous sloping floor.
        depthEdge = max(depthEdge, abs(viewDepth(a) + viewDepth(b) - 2.0 * centerDepth) / max(centerDepth, 0.1));
        // Creases use a narrower footprint than silhouettes. Keep texture detail
        // out of the edge buffer, so fabric patterns do not become ink contours.
        vec2 innerOffset = offset * normalThicknessRatio;
        normalEdge = max(normalEdge, max(length(texture2D(normals, vUv + innerOffset).rgb - centerNormal), length(texture2D(normals, vUv - innerOffset).rgb - centerNormal)));
      }
      // Only the edge transition is soft; the body of a detected line is opaque.
      float edge = max(smoothstep(depthThreshold * 0.8, depthThreshold * 1.2, depthEdge), smoothstep(normalThreshold, normalThreshold * 1.2, normalEdge));
      // Ink "around" (10-11, the user's pick on the landing): the line takes the colour under it, darkened,
      // so a green blanket gets a deep green line and the cream wall a dark warm one. inkTint 0 = one fixed colour.
      vec3 around = texture2D(source, vUv).rgb;
      around += texture2D(source, vUv + vec2(outlineStep.x, 0.0)).rgb + texture2D(source, vUv - vec2(outlineStep.x, 0.0)).rgb;
      around += texture2D(source, vUv + vec2(0.0, outlineStep.y)).rgb + texture2D(source, vUv - vec2(0.0, outlineStep.y)).rgb;
      vec3 ink = mix(outlineColor, pow(clamp(around / 5.0, 0.0, 1.0), vec3(1.35)) * inkDark, inkTint);
      color = mix(color, ink, edge * outlineOpacity);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function material(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

/** Geometry outlines over the original render, followed by depth-tested model text. */
export class OutlineEffect {
  constructor(renderer, outline = { thickness: 0 }, dithering = { preset: "off", levels: { off: 0 }, cellSize: 2 }) {
    this.renderer = renderer;
    this.outline = outline;
    this.dithering = dithering;
    this.size = new THREE.Vector2();
    this.source = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.composite = material(compositeShader, {
      source: { value: null }, normals: { value: null }, depths: { value: null },
      ditherLevels: { value: 0 }, ditherCellSize: { value: 1 },
      outlineStep: { value: new THREE.Vector2() }, cameraRange: { value: new THREE.Vector2() },
      perspective: { value: true }, outlineOpacity: { value: 0 }, outlineColor: { value: new THREE.Color() },
      inkTint: { value: 0 }, inkDark: { value: 0.34 },
      depthThreshold: { value: 0.015 }, normalThreshold: { value: 0.35 },
      normalThicknessRatio: { value: 1 },
    });
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  ensureTargets() {
    if (this.source) return;
    this.source = new THREE.FramebufferTexture(1, 1);
    this.source.minFilter = this.source.magFilter = THREE.LinearFilter;
    this.geometryTarget = new THREE.WebGLRenderTarget(1, 1, {
      // Interpolate the normal buffer for stable subpixel crease strokes.
      // The depth texture keeps its own nearest filtering for silhouettes.
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    this.composite.uniforms.source.value = this.source;
    this.composite.uniforms.normals.value = this.geometryTarget.texture;
    this.composite.uniforms.depths.value = this.geometryTarget.depthTexture;
    this.resize();
  }

  resize() {
    if (!this.source) return;
    this.renderer.getDrawingBufferSize(this.size);
    const { x: width, y: height } = this.size;
    if (this.source.image.width !== width || this.source.image.height !== height) {
      this.source.dispose();
      this.source.image.width = width;
      this.source.image.height = height;
      this.source.needsUpdate = true;
    }
    this.geometryTarget.setSize(width, height);
    // A disabled outline can still leave sampler uniforms active. Resize the
    // depth image now, before such a sampler initializes its immutable storage.
    const depth = this.geometryTarget.depthTexture;
    depth.image.width = width;
    depth.image.height = height;
    depth.needsUpdate = true;
  }

  pass(shader, target) {
    this.quad.material = shader;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const thickness = Math.max(0, this.outline.thickness ?? 0);
    const levels = this.dithering.levels[this.dithering.preset] ?? 0;
    const post = thickness > 0 || levels > 1;
    const previous = {
      target: renderer.getRenderTarget(), autoClear: renderer.autoClear, layers: camera.layers.mask,
      background: scene.background, override: scene.overrideMaterial, shadows: renderer.shadowMap.autoUpdate,
    };
    const hidden = [];
    try {
      camera.layers.disable(TEXT_LAYER);
      if (post) this.ensureTargets();
      if (thickness > 0) {
        // Hidden interaction volumes and invisible glow planes aren't model edges.
        scene.traverse(object => {
          if (!object.visible || !object.material) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          if (!object.isMesh || materials.every(m => !m.visible || (m.transparent && m.opacity === 0))) {
            object.visible = false;
            hidden.push(object);
          }
        });
        scene.background = null;
        scene.overrideMaterial = this.normalMaterial;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(this.geometryTarget);
        renderer.render(scene, camera);
        for (const object of hidden) object.visible = true;
        hidden.length = 0;
        scene.background = previous.background;
        scene.overrideMaterial = previous.override;
        renderer.shadowMap.autoUpdate = previous.shadows;
      }
      renderer.setRenderTarget(previous.target);
      renderer.render(scene, camera); // Retain this full-resolution depth for text.
      if (post) {
        // r185's copy helper can retain the composite's active texture unit.
        renderer.resetState();
        renderer.copyFramebufferToTexture(this.source);
        const u = this.composite.uniforms;
        u.ditherLevels.value = levels;
        u.ditherCellSize.value = Math.max(0.001, this.dithering.cellSize * renderer.getPixelRatio());
        u.normals.value = thickness > 0 ? this.geometryTarget.texture : this.source;
        u.depths.value = thickness > 0 ? this.geometryTarget.depthTexture : this.source;
        u.outlineOpacity.value = thickness > 0 ? this.outline.opacity ?? 0.6 : 0;
        u.outlineStep.value.set(thickness * renderer.getPixelRatio() / this.size.x, thickness * renderer.getPixelRatio() / this.size.y);
        u.cameraRange.value.set(camera.near, camera.far);
        u.perspective.value = !!camera.isPerspectiveCamera;
        u.outlineColor.value.set(this.outline.color ?? "#584632").convertLinearToSRGB();
        u.inkTint.value = this.outline.ink === "around" ? 1 : 0;
        u.inkDark.value = this.outline.inkDark ?? 0.34;
        u.depthThreshold.value = this.outline.depthThreshold ?? 0.015;
        u.normalThreshold.value = this.outline.normalThreshold ?? 0.35;
        u.normalThicknessRatio.value = THREE.MathUtils.clamp(this.outline.normalThicknessRatio ?? 1, 0, 1);
        renderer.autoClear = false; // Do not clear the main scene depth.
        this.pass(this.composite, previous.target);
      }
      // Render model text against the original scene depth.
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      scene.background = null;
      camera.layers.set(TEXT_LAYER);
      renderer.render(scene, camera);
    } finally {
      for (const object of hidden) object.visible = true;
      camera.layers.mask = previous.layers;
      scene.background = previous.background;
      scene.overrideMaterial = previous.override;
      renderer.shadowMap.autoUpdate = previous.shadows;
      renderer.autoClear = previous.autoClear;
      renderer.setRenderTarget(previous.target);
    }
  }

  dispose() {
    for (const resource of [this.source, this.geometryTarget, this.composite, this.normalMaterial, this.quad.geometry]) resource?.dispose();
  }
}
