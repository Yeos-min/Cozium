import * as THREE from "three";
import { TEXT_LAYER } from "./text-overlay.js";

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// RGB structure tensor; signed cross term is encoded for the RGBA8 fallback.
const tensorShader = /* glsl */`
  uniform sampler2D source;
  uniform vec2 texel;
  varying vec2 vUv;
  void main() {
    vec3 a = texture2D(source, vUv + texel * vec2(-1.0, -1.0)).rgb;
    vec3 b = texture2D(source, vUv + texel * vec2( 0.0, -1.0)).rgb;
    vec3 c = texture2D(source, vUv + texel * vec2( 1.0, -1.0)).rgb;
    vec3 d = texture2D(source, vUv + texel * vec2(-1.0,  0.0)).rgb;
    vec3 e = texture2D(source, vUv + texel * vec2( 1.0,  0.0)).rgb;
    vec3 f = texture2D(source, vUv + texel * vec2(-1.0,  1.0)).rgb;
    vec3 g = texture2D(source, vUv + texel * vec2( 0.0,  1.0)).rgb;
    vec3 h = texture2D(source, vUv + texel * vec2( 1.0,  1.0)).rgb;
    vec3 dx = (c + 2.0 * e + h - a - 2.0 * d - f) / 8.0;
    vec3 dy = (f + 2.0 * g + h - a - 2.0 * b - c) / 8.0;
    gl_FragColor = vec4(dot(dx, dx), dot(dy, dy), dot(dx, dy) * 0.5 + 0.5, 1.0);
  }
`;

const blurShader = /* glsl */`
  uniform sampler2D source;
  uniform vec2 stepSize;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(source, vUv) * 0.375
      + (texture2D(source, vUv + stepSize) + texture2D(source, vUv - stepSize)) * 0.25
      + (texture2D(source, vUv + 2.0 * stepSize) + texture2D(source, vUv - 2.0 * stepSize)) * 0.0625;
  }
`;

// Eight overlapping polynomial sectors aligned to the smoothed tensor's minor
// eigenvector. All sectors share the same 49 disk samples.
// Method reference: https://www.kyprianidis.com/p/tpcg2010/
const filterShader = /* glsl */`
  #define SECTOR_COUNT 8
  uniform sampler2D source;
  uniform sampler2D tensor;
  uniform vec2 texel;
  uniform float radius;
  uniform float alpha;
  uniform bool selectSector;
  varying vec2 vUv;
  void main() {
    vec3 t = texture2D(tensor, vUv).rgb;
    float jxy = (t.b - 0.5) * 2.0;
    float trace = t.r + t.g;
    float delta = sqrt(max((t.r - t.g) * (t.r - t.g) + 4.0 * jxy * jxy, 0.0));
    float angle = delta > 0.000001 ? 0.5 * atan(2.0 * jxy, t.r - t.g) : 0.0;
    float anisotropy = clamp(delta / max(trace, 0.000001), 0.0, 1.0);
    vec2 tangent = vec2(-sin(angle), cos(angle));
    vec2 normal = vec2(cos(angle), sin(angle));
    float stretch = 1.0 + anisotropy / max(alpha, 0.25);
    vec3 sums[SECTOR_COUNT];
    vec3 squares[SECTOR_COUNT];
    float weights[SECTOR_COUNT];
    for (int q = 0; q < SECTOR_COUNT; q++) {
      sums[q] = vec3(0.0); squares[q] = vec3(0.0); weights[q] = 0.0;
    }
    for (int y = -4; y <= 4; y++) {
      for (int x = -4; x <= 4; x++) {
        vec2 p = vec2(float(x), float(y)) / 4.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) continue;
        vec2 offset = radius * (tangent * p.x * stretch + normal * p.y / stretch);
        vec3 c = texture2D(source, vUv + offset * texel).rgb;
        float w[SECTOR_COUNT];
        float sumWeight = 0.0;
        vec2 local = p;
        for (int q = 0; q < SECTOR_COUNT; q++) {
          // Clamp BEFORE squaring: negative polynomial lobes must not contribute.
          float poly = max(0.0, local.x + 0.35 - 1.8 * local.y * local.y);
          w[q] = poly * poly;
          sumWeight += w[q];
          local = mat2(0.707107, -0.707107, 0.707107, 0.707107) * local;
        }
        float gaussian = exp(-3.0 * r2) / max(sumWeight, 0.000001);
        for (int q = 0; q < SECTOR_COUNT; q++) {
          float weight = w[q] * gaussian;
          sums[q] += c * weight;
          squares[q] += c * c * weight;
          weights[q] += weight;
        }
      }
    }
    vec3 result = vec3(0.0);
    float total = 0.0;
    float leastVariance = 1e10;
    vec3 selectedColor = vec3(0.0);
    for (int q = 0; q < SECTOR_COUNT; q++) {
      vec3 mean = sums[q] / max(weights[q], 0.000001);
      vec3 variance = max(squares[q] / max(weights[q], 0.000001) - mean * mean, vec3(0.0));
      float v = dot(variance, vec3(0.299, 0.587, 0.114));
      if (v < leastVariance) { leastVariance = v; selectedColor = mean; }
      float confidence = 1.0 / (1.0 + pow(v * 600.0, 4.0));
      result += mean * confidence;
      total += confidence;
    }
    gl_FragColor = vec4(selectSector ? selectedColor : result / max(total, 0.000001), 1.0);
  }
`;

const compositeShader = /* glsl */`
  uniform sampler2D source;
  uniform sampler2D filtered;
  uniform sampler2D normals;
  uniform sampler2D depths;
  uniform float strength;
  uniform vec2 outlineStep;
  uniform vec2 cameraRange;
  uniform bool perspective;
  uniform float outlineOpacity;
  uniform vec3 outlineColor;
  uniform float depthThreshold;
  uniform float normalThreshold;
  uniform float normalThicknessRatio;
  varying vec2 vUv;
  float viewDepth(vec2 uv) {
    float d = texture2D(depths, uv).r;
    float near = cameraRange.x, far = cameraRange.y;
    return perspective ? near * far / max(far - d * (far - near), 0.00001) : mix(near, far, d);
  }
  void main() {
    vec3 original = texture2D(source, vUv).rgb;
    vec3 color = strength > 0.0 ? mix(original, texture2D(filtered, vUv).rgb, strength) : original;
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
      color = mix(color, outlineColor, edge * outlineOpacity);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function material(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

/** Display-referred painterly passes, geometry outlines, then depth-tested model text. */
export class KuwaharaEffect {
  constructor(renderer, settings, outline = { thickness: 0 }) {
    this.renderer = renderer;
    this.settings = settings;
    this.outline = outline;
    this.size = new THREE.Vector2();
    this.source = null;
    this.filtered = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.tensorMaterial = material(tensorShader, { source: { value: null }, texel: { value: new THREE.Vector2() } });
    this.blurMaterial = material(blurShader, { source: { value: null }, stepSize: { value: new THREE.Vector2() } });
    this.filter = material(filterShader, {
      source: { value: null }, tensor: { value: null }, texel: { value: new THREE.Vector2() },
      radius: { value: 4 }, alpha: { value: 1 },
      selectSector: { value: true },
    });
    this.composite = material(compositeShader, {
      source: { value: null }, filtered: { value: null }, normals: { value: null }, depths: { value: null },
      strength: { value: 0 }, outlineStep: { value: new THREE.Vector2() }, cameraRange: { value: new THREE.Vector2() },
      perspective: { value: true }, outlineOpacity: { value: 0 }, outlineColor: { value: new THREE.Color() },
      depthThreshold: { value: 0.015 }, normalThreshold: { value: 0.35 },
      normalThicknessRatio: { value: 1 },
    });
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.filter);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  ensureTargets() {
    if (this.source) return;
    this.source = new THREE.FramebufferTexture(1, 1);
    this.source.minFilter = this.source.magFilter = THREE.LinearFilter;
    // Keep already output-converted RGB, including background / unlit materials.
    const type = this.renderer.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const target = () => new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
    this.filtered = target();
    this.tensor = target();
    this.tensorTemp = target();
    this.geometryTarget = new THREE.WebGLRenderTarget(1, 1, {
      // Interpolate the normal buffer for stable subpixel crease strokes.
      // The depth texture keeps its own nearest filtering for silhouettes.
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    this.tensorMaterial.uniforms.source.value = this.source;
    this.filter.uniforms.source.value = this.source;
    this.filter.uniforms.tensor.value = this.tensor.texture;
    this.composite.uniforms.source.value = this.source;
    this.composite.uniforms.filtered.value = this.filtered.texture;
    this.composite.uniforms.normals.value = this.geometryTarget.texture;
    this.composite.uniforms.depths.value = this.geometryTarget.depthTexture;
    this.resize();
  }

  resize() {
    if (!this.source) return;
    this.renderer.getDrawingBufferSize(this.size);
    const { x: width, y: height } = this.size;
    const scale = Math.min(this.settings.resolutionScale, this.settings.maxFilterSize / Math.max(width, height));
    const fw = Math.max(1, Math.round(width * scale)), fh = Math.max(1, Math.round(height * scale));
    if (this.source.image.width !== width || this.source.image.height !== height) {
      this.source.dispose();
      this.source.image.width = width;
      this.source.image.height = height;
      this.source.needsUpdate = true;
    }
    for (const target of [this.filtered, this.tensor, this.tensorTemp]) target.setSize(fw, fh);
    this.geometryTarget.setSize(width, height);
    // A disabled outline can still leave sampler uniforms active. Resize the
    // depth image now, before such a sampler initializes its immutable storage.
    const depth = this.geometryTarget.depthTexture;
    depth.image.width = width;
    depth.image.height = height;
    depth.needsUpdate = true;
    this.filter.uniforms.texel.value.set(1 / fw, 1 / fh);
    this.tensorMaterial.uniforms.texel.value.copy(this.filter.uniforms.texel.value);
  }

  pass(shader, target) {
    this.quad.material = shader;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const strength = this.settings.strengths[this.settings.preset] ?? 0;
    const thickness = Math.max(0, this.outline.thickness ?? 0);
    const post = strength > 0 || thickness > 0;
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
        if (strength > 0) {
          this.pass(this.tensorMaterial, this.tensor);
          this.blurMaterial.uniforms.source.value = this.tensor.texture;
          this.blurMaterial.uniforms.stepSize.value.set(1 / this.tensor.width, 0);
          this.pass(this.blurMaterial, this.tensorTemp);
          this.blurMaterial.uniforms.source.value = this.tensorTemp.texture;
          this.blurMaterial.uniforms.stepSize.value.set(0, 1 / this.tensor.height);
          this.pass(this.blurMaterial, this.tensor);
          this.filter.uniforms.radius.value = THREE.MathUtils.clamp(this.settings.radius ?? 4, 2, 6);
          this.filter.uniforms.alpha.value = this.settings.anisotropy ?? 1;
          this.filter.uniforms.selectSector.value = this.settings.sectorMode !== "blend";
          this.pass(this.filter, this.filtered);
        }
        const u = this.composite.uniforms;
        u.strength.value = strength;
        u.normals.value = thickness > 0 ? this.geometryTarget.texture : this.source;
        u.depths.value = thickness > 0 ? this.geometryTarget.depthTexture : this.source;
        u.outlineOpacity.value = thickness > 0 ? this.outline.opacity ?? 0.6 : 0;
        u.outlineStep.value.set(thickness * renderer.getPixelRatio() / this.size.x, thickness * renderer.getPixelRatio() / this.size.y);
        u.cameraRange.value.set(camera.near, camera.far);
        u.perspective.value = !!camera.isPerspectiveCamera;
        u.outlineColor.value.set(this.outline.color ?? "#584632").convertLinearToSRGB();
        u.depthThreshold.value = this.outline.depthThreshold ?? 0.015;
        u.normalThreshold.value = this.outline.normalThreshold ?? 0.35;
        u.normalThicknessRatio.value = THREE.MathUtils.clamp(this.outline.normalThicknessRatio ?? 1, 0, 1);
        renderer.autoClear = false; // Do not clear the main scene depth.
        this.pass(this.composite, previous.target);
      }
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
    for (const resource of [this.source, this.filtered, this.tensor, this.tensorTemp, this.geometryTarget,
      this.tensorMaterial, this.blurMaterial, this.filter, this.composite, this.normalMaterial, this.quad.geometry]) resource?.dispose();
  }
}
