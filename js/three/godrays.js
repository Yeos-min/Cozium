// Sun shafts through the skylight (2026-10-11, user request: god rays while the sun is up). Shared by the game
// (scene-kit.js, game units: pass step/y0/near/dustSize/drift) and the landing (landing-story/room-layer.js, metres: defaults).
// Not a screen-space blur: a soft volume. The skylight opening is found in the room mesh when it loads (rays cast up
// from a floor grid; the cells that see the sky are the opening), extruded along the sun to the floor, and drawn as
// additive sheets that fade at grazing angles and towards the floor, with slow streaks and dust in the light.
// Drawn after the styled frame against its depth, so furniture still cuts the beam; outline and dithering skip it.
import * as THREE from "three";

const beamVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const beamFrag = /* glsl */`
  uniform vec3 tint; uniform float strength; uniform float time;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float streaks(float u) {
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      float f = 7.0 + float(i) * 5.3;
      s += 0.5 + 0.5 * sin(u * f * 6.2831 + time * (0.05 + 0.03 * float(i)) + hash(float(i)) * 6.0);
    }
    return s / 4.0;
  }
  void main() {
    float facing = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);  // soft at the silhouette
    float along = smoothstep(0.0, 0.08, vUv.y) * mix(0.22, 1.0, pow(1.0 - vUv.y, 0.8)); // bright at the glass, thin at the floor
    float floorFade = smoothstep(1.0, 0.86, vUv.y);
    float rays = mix(0.55, 1.15, streaks(vUv.x));
    float a = strength * facing * along * floorFade * rays;
    gl_FragColor = vec4(tint * a, 1.0);
  }`;

const dustVert = /* glsl */`
  attribute float seed; uniform float time; uniform float size; uniform vec3 dir; uniform float drift;
  varying float vA;
  void main() {
    vec3 p = position;
    p += vec3(sin(time * .11 + seed * 9.0), cos(time * .07 + seed * 5.0) * .6, sin(time * .09 + seed * 3.0)) * drift;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = .35 + .65 * (0.5 + 0.5 * sin(time * (.6 + seed) + seed * 20.0));
    gl_PointSize = size * (0.6 + seed) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const dustFrag = /* glsl */`
  uniform vec3 tint; uniform float strength; varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(tint * strength * vA * smoothstep(0.25, 0.0, d), 1.0);
  }`;

// Opening(s) in the roof: corners in world space, ordered around the edge. null when the room has no skylight.
export function findSkylight(roomMesh, bounds, { step = .06, y0 = 1.2, near = .6 } = {}) {
  const ray = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3();
  const hits = [], miss = [];
  for (let x = bounds.min.x + step / 2; x < bounds.max.x; x += step) {
    for (let z = bounds.min.z + step / 2; z < bounds.max.z; z += step) {
      ray.set(o.set(x, y0, z), up); ray.far = 40;
      const h = ray.intersectObject(roomMesh, false)[0];
      if (h) hits.push(h.point.clone()); else miss.push(new THREE.Vector2(x, z));
    }
  }
  if (miss.length < 6) return null;
  // the biggest connected patch of sky cells
  const key = (v) => `${Math.round(v.x / step)},${Math.round(v.y / step)}`, cells = new Map(miss.map((v) => [key(v), v]));
  let best = [];
  const seen = new Set();
  for (const [k] of cells) {
    if (seen.has(k)) continue;
    const group = [], stack = [k]; seen.add(k);
    while (stack.length) {
      const c = stack.pop(); group.push(cells.get(c));
      const [i, j] = c.split(",").map(Number);
      for (const n of [`${i + 1},${j}`, `${i - 1},${j}`, `${i},${j + 1}`, `${i},${j - 1}`]) if (cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    if (group.length > best.length) best = group;
  }
  const minX = Math.min(...best.map((v) => v.x)) - step / 2, maxX = Math.max(...best.map((v) => v.x)) + step / 2;
  const minZ = Math.min(...best.map((v) => v.y)) - step / 2, maxZ = Math.max(...best.map((v) => v.y)) + step / 2;
  // roof height around the opening: a plane through the nearby roof hits (least squares y = a x + b z + c)
  const around = hits.filter((p) => p.x > minX - near && p.x < maxX + near && p.z > minZ - near && p.z < maxZ + near);
  if (around.length < 3) return null;
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, n = around.length, sxy = 0, szy = 0, sy = 0;
  for (const p of around) { sxx += p.x * p.x; sxz += p.x * p.z; szz += p.z * p.z; sx += p.x; sz += p.z; sxy += p.x * p.y; szy += p.z * p.y; sy += p.y; }
  const M = new THREE.Matrix3().set(sxx, sxz, sx, sxz, szz, sz, sx, sz, n).invert();
  const abc = new THREE.Vector3(sxy, szy, sy).applyMatrix3(M);
  const yAt = (x, z) => abc.x * x + abc.y * z + abc.z;
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]].map(([x, z]) => new THREE.Vector3(x, yAt(x, z), z));
}

export class GodRays {
  constructor(corners, lightDir, { tint = "#ffd9a0", strength = .3, dustSize = 16, drift = .05 } = {}) {
    this.scene = new THREE.Scene();
    this.uniforms = { tint: { value: new THREE.Color(tint) }, strength: { value: strength }, time: { value: 0 } };
    const d = lightDir.clone().normalize(); // travelling direction of the light (downwards)
    const bottom = corners.map((c) => c.clone().addScaledVector(d, -c.y / d.y));
    // four side sheets; u runs around the edge (for streaks), v from the glass (0) to the floor (1)
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], a2 = bottom[i], b2 = bottom[(i + 1) % 4], base = pos.length / 3;
      pos.push(...a.toArray(), ...b.toArray(), ...b2.toArray(), ...a2.toArray());
      uv.push(i / 4, 0, (i + 1) / 4, 0, (i + 1) / 4, 1, i / 4, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      vertexShader: beamVert, fragmentShader: beamFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    this.beam = new THREE.Mesh(g, mat); this.beam.frustumCulled = false;
    this.scene.add(this.beam);
    // dust: points spread through the volume
    const N = 140, dp = new Float32Array(N * 3), seeds = new Float32Array(N), r = mulberry(7);
    for (let i = 0; i < N; i++) {
      const s = r(), u = r(), w = r();
      const top = corners[0].clone().lerp(corners[1], u).lerp(corners[3].clone().lerp(corners[2], u), w);
      const p = top.addScaledVector(d, (-top.y / d.y) * (.08 + .85 * s));
      dp.set(p.toArray(), i * 3); seeds[i] = r();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    dg.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    this.dustSize = dustSize;
    this.dustUniforms = { tint: { value: new THREE.Color("#fff3da") }, strength: { value: .55 }, time: this.uniforms.time, size: { value: dustSize }, dir: { value: d }, drift: { value: drift } };
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      vertexShader: dustVert, fragmentShader: dustFrag, uniforms: this.dustUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.on = true;
  }

  // after the styled frame: same camera, keep its depth so the bed and the chair still stand in front of the light
  render(renderer, camera, seconds, pixelRatio) {
    if (!this.on) return;
    this.uniforms.time.value = seconds;
    this.dustUniforms.size.value = this.dustSize * pixelRatio;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, camera);
    renderer.autoClear = ac;
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
