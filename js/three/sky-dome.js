// 천창 너머 하늘 (2026-10-25, 사용자: "가만히 쳐다보고 있는데 하늘에 별이 보였으면", "HDRI 없이", "낮엔 구름").
// 카메라를 따라다니는 큰 공 안쪽에 그리는 그림 하늘. 랜딩(landing-story/room-layer.js)과 게임(scene-kit.js)이 같이 쓴다.
// 낮(night 0): 위로 갈수록 짙어지는 하늘색 + 천천히 흐르는 뭉게구름. 밤(night 1): 남색 + 반짝이는 별.
// 깊이를 쓰지 않고 맨 먼저 그려서 방이 늘 앞에 온다. 외곽선·버텍스 흔들림은 건너뛴다(userData.noOutline / noSnap).
import * as THREE from "three";

const vert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // 먼 평면에 붙인다
  }`;

const frag = /* glsl */`
  uniform float night; uniform float time;
  uniform vec3 dayTop; uniform vec3 dayLow; uniform vec3 nightTop; uniform vec3 nightLow;
  uniform vec3 cloudLit; uniform vec3 cloudShade;
  varying vec3 vDir;
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  // 별: 방향을 격자로 나눠 칸마다 별 하나가 있을 수도 없을 수도
  float stars(vec3 d, float scale, float density, float size) {
    vec3 p = d * scale, c = floor(p), f = fract(p) - 0.5;
    float h = hash3(c);
    if (h < 1.0 - density) return 0.0;
    vec3 o = vec3(hash3(c + 1.7), hash3(c + 4.3), hash3(c + 9.1)) - 0.5;
    float r = length(f - o * 0.6);
    float tw = 0.65 + 0.35 * sin(time * (0.8 + h * 2.3) + h * 40.0); // 천천히 반짝
    return smoothstep(size, 0.0, r) * tw * (0.6 + 0.4 * hash3(c + 2.9));
  }
  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 day = mix(dayLow, dayTop, smoothstep(0.45, 1.0, up));
    // 구름: 하늘을 평면으로 펴서(지평선 쪽은 납작하게) 흐르는 잡음
    vec2 uv = d.xz / max(d.y + 0.25, 0.05) * 1.6 + vec2(time * 0.012, time * 0.004);
    float n = fbm(uv);
    float cover = smoothstep(0.52, 0.66, n) * smoothstep(-0.1, 0.25, d.y);
    float lit = smoothstep(0.52, 0.8, fbm(uv + vec2(0.18, 0.12)));
    vec3 cloud = mix(cloudShade, cloudLit, 1.0 - lit * 0.7);
    day = mix(day, cloud, cover * 0.92);
    vec3 nightSky = mix(nightLow, nightTop, smoothstep(0.45, 1.0, up));
    // 큰 별 조금 + 작은 별 많이. 천창으로 보이는 하늘 조각이 작아서 촘촘하게
    float s = 1.5 * stars(d, 26.0, 0.10, 0.10) + 1.2 * stars(d, 48.0, 0.20, 0.14) + 0.8 * stars(d, 96.0, 0.14, 0.18);
    nightSky += vec3(1.0, 0.96, 0.86) * s * smoothstep(0.0, 0.2, d.y);
    gl_FragColor = vec4(mix(day, nightSky, night), 1.0);
  }`;

export class SkyDome {
  constructor({ radius = 30, night = 0 } = {}) {
    this.uniforms = {
      night: { value: night }, time: { value: 0 },
      dayTop: { value: new THREE.Color("#8fbcd8") }, dayLow: { value: new THREE.Color("#d6e8ef") },
      nightTop: { value: new THREE.Color("#0b1028") }, nightLow: { value: new THREE.Color("#1d2440") },
      cloudLit: { value: new THREE.Color("#fbf6ea") }, cloudShade: { value: new THREE.Color("#c9d5dc") },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
    this.mesh.name = "sky-dome";
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
    this.mesh.userData.noSnap = true;
  }

  /** 0 = 낮, 1 = 밤. 사이 값은 해 질 녘 */
  set night(k) { this.uniforms.night.value = Math.min(1, Math.max(0, k)); }
  get night() { return this.uniforms.night.value; }

  update(camera, seconds) {
    this.mesh.position.copy(camera.position);
    this.uniforms.time.value = seconds;
  }
}
