// Cozium 3D landing (Claude, 2026-10-11): the user's attic (models/room.glb) as the landing's first and last scene.
// Reviewed as a prototype page first (moved to _archive/ on 10-11; ?lab opens the same render panel here). The story, the beats and the laptop-inside scenes are the 10-07 landing's;
// only the painted room plates were replaced by this layer.
//
// Render style goes through the game's own effect code (js/three/outline-effect.js + vertex-snap.js, Codex), in the same
// order as SceneKit#renderWebGL: vertexSnap.prepare(scene) → outlineEffect.render(scene, camera). Changing the style
// later is a settings change that the landing and the game share, not a second implementation.
import * as THREE from "three";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";
import { OutlineEffect } from "../three/outline-effect.js";
import { VertexSnapEffect } from "../three/vertex-snap.js";
import { TUNING, directionFromAngles } from "../three/tuning.js";
import { RenderQuality, detectDeviceTier, renderPixelRatio } from "../three/render-quality.js";
import { GodRays, findSkylight } from "../three/godrays.js";
import { toonGradient } from "../three/materials.js";
import { setInk } from "./outline-ink.js";
import { TEXT_LAYER } from "../three/text-overlay.js";
export { TEXT_LAYER };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const inOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DEG = Math.PI / 180;

// Landing camera candidates (metres, room.glb space: floor y = 0, ridge along z, desk on the +x eave wall).
// shift = lens shift down as a fraction of the frame height (Blender Shift Y), so the walls stay upright like the
// painting while the floor gets the lower half. All three are proposals; the review panel switches between them.
export const CAMERAS = {
  A: { label: "원화 구도", p: [-3.05, 1.5, -1.05], yaw: -93, hfov: 60, shift: .2 },
  B: { label: "책상 가까이", p: [-1.35, 1.48, .35], yaw: -89, hfov: 58, shift: .18 },
  C: { label: "넓게", p: [-3.15, 1.55, 2.4], yaw: -72, hfov: 70, shift: .2 },
};
const END_HFOV = 38;      // lens at the end of the walk-in, when the screen fills the frame
const SCREEN = "Laptop_screen";

// Light setups to compare. "game" is TUNING.light as the game uses it today.
export const LIGHTS = {
  sun: "오후 햇살", game: "게임 조명", soft: "흐린 낮", lamp: "저녁 스탠드",
};
export const MATERIALS = {
  pbr: "모델 그대로", toon: "툰 3단", matte: "무광", unlit: "언릿",
};

// metres: w, d, thickness. A little larger than life (×1.4), like the game's chunky cards, so the mess reads from the door.
const FILE_SIZE = Object.fromEntries(Object.entries({
  document: [.30, .218, .005], photo: [.16, .128, .003], video: [.22, .16, .016], audio: [.13, .13, .012], archive: [.30, .218, .035],
}).map(([k, v]) => [k, v.map((x, i) => i === 2 ? Math.max(.012, x * 1.4) : x * 1.4)])); // ≥ 1.2 cm: thinner ones fought the floor under wobble
const EDGE = { document: "#e9dfc7", photo: "#f3efe4", video: "#4a524c", audio: "#d8bf73", archive: "#a98258" };
const KINDS = ["document", "document", "photo", "photo", "photo", "video", "audio", "archive", "document"];

export class RoomLayer {
  constructor(canvas, { faceCanvas }) {
    this.canvas = canvas;
    this.faceCanvas = faceCanvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // The room doesn't move: shadows are drawn only when the light or the room changes (needsUpdate), not every frame.
    this.renderer.shadowMap.autoUpdate = false;
    // Device-dependent quality, the same controller as the game (render-quality.js): a start tier from the GPU, then
    // the measured frame time lowers the resolution and, if that isn't enough, the tier. ?render=high|low pins it
    // (not ?quality=: on index.html that one forwards to the app, js/entry-route.js).
    this.quality = new RenderQuality(new URLSearchParams(location.search).get("render"), { tier: detectDeviceTier(this.renderer.getContext()) });
    this.onQuality = null;
    this._last = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, .04, 60);
    this.camera.rotation.order = "YXZ";
    this.outline = new OutlineEffect(this.renderer, { ...TUNING.outline }, { ...TUNING.dithering, levels: { ...TUNING.dithering.levels } });
    this.snap = new VertexSnapEffect(this.renderer, { ...TUNING.vertexWobble, cellSizes: { ...TUNING.vertexWobble.cellSizes } });
    this.snap.patchMaterial(this.outline.normalMaterial);
    // The user's pick (10-11): camera C, toon, 1px outline in the surrounding colour, fine dither, wobble.
    // The messy room is at night (desk lamp), the tidied room in the afternoon sun: the clean-up took the night.
    this.style = { cam: "C", light: "lamp", lightEnd: "sun", mat: "toon", outline: 1, ink: "around", dither: "fine", wobble: "wobble", tone: "none", rays: true };
    this.size = { w: 1, h: 1 };
    this.ready = false;
    this.state = "messy";
    this.meshes = [];
    this.lights = {};
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
  }

  async load(roomUrl, boxUrl) {
    const loader = new GLTFLoader();
    // A .glb as base64 text (the claude.ai review copy: that host serves no .glb and blocks data: buffers)
    const get = async (url) => {
      if (!url.endsWith(".b64.txt")) return loader.loadAsync(url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const bin = atob((await res.text()).trim()), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // embedded textures as <img src="blob:…"> instead of fetch(blob:) → ImageBitmap: the host allows blob: images
      // but not blob: fetches. GLTFLoader picks its texture loader when the parser is built, synchronously here.
      const cib = globalThis.createImageBitmap;
      try { globalThis.createImageBitmap = undefined; return loader.parseAsync(bytes.buffer, ""); }
      finally { globalThis.createImageBitmap = cib; }
    };
    const [room, box] = await Promise.all([get(roomUrl), boxUrl ? get(boxUrl) : null]);
    this.room = room.scene;
    this.scene.add(this.room);
    this.room.updateMatrixWorld(true);
    this.room.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if ([].concat(o.material).some((m) => m.name === SCREEN)) this.screenMesh = o;
    });
    this.#readScreen();
    this.#buildLights();
    this.#buildRays();
    this.#buildFiles();
    if (box) this.#buildBoxes(box.scene); // the tidied room shows a clear floor now; boxes only on request (10-11)
    this.room.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
    for (const g of [this.files, this.boxes].filter(Boolean)) g.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
    for (const o of this.meshes) o.userData.orig = o.material;
    this.ready = true;
    this.setStyle(this.style);
    this.#applyQuality(); // the start tier's shadow sizes and effects
  }

  // Each light setup is a different shader program; switching to the tidied room's light would compile it mid-walk.
  // Warm both rooms' programs once, right after the first frame is up.
  warm() {
    if (!this.ready) return;
    const keep = this.state;
    for (const st of ["tidy", "messy"]) {
      this.state = st; this.#applyLight();
      this.files.visible = st === "messy";
      try { this.renderer.compile(this.scene, this.camera); } catch { /* compile is an optimisation */ }
    }
    this.state = keep; this.#applyLight(); this.files.visible = keep === "messy";
  }

  // The screen plate's corners from its own vertices and UVs (glTF: u right, v down → TL is uv 0,0).
  #readScreen() {
    const m = this.screenMesh, pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
    const c = {};
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const key = (uv.getX(i) > .5 ? "R" : "L") + (uv.getY(i) > .5 ? "B" : "T");
      c[key] = v;
    }
    this.corners = [c.LT, c.RT, c.RB, c.LB]; // TL, TR, BR, BL
    this.screenCenter = new THREE.Vector3();
    for (const v of this.corners) this.screenCenter.addScaledVector(v, .25);
    this.screenRight = c.RT.clone().sub(c.LT);
    this.screenUp = c.LT.clone().sub(c.LB);
    this.screenW = this.screenRight.length(); this.screenH = this.screenUp.length();
    this.screenRight.normalize(); this.screenUp.normalize();
    this.screenNormal = new THREE.Vector3().crossVectors(this.screenRight, this.screenUp).normalize(); // towards the viewer
    // the screen material glows a little in the dark preset; keep a handle
    this.screenMat = [].concat(m.material).find((mm) => mm.name === SCREEN);
  }

  #buildLights() {
    const L = this.lights, add = (k, ...objs) => { L[k] = new THREE.Group(); L[k].add(...objs); this.scene.add(L[k]); };
    const shadowed = (light, size = 2048, ext = 6.5) => {
      light.castShadow = true; light.shadow.mapSize.set(size, size);
      Object.assign(light.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: .5, far: 40 });
      light.shadow.bias = -.0004; light.shadow.normalBias = .02; light.shadow.camera.updateProjectionMatrix();
      return light;
    };
    // afternoon sun through the skylight on the +x slope; the roof shades everything else
    {
      const sun = shadowed(new THREE.DirectionalLight("#ffd9a0", 3.8)); sun.position.set(9.5, 11, -3.2); sun.target.position.set(0, 0, .4);
      add("sun", new THREE.HemisphereLight("#fff3dc", "#8a6844", 1.7), new THREE.AmbientLight("#f6e2c6", .5), sun, sun.target);
      L.sun.userData = { bg: "#cfe5ef", exposure: 1 };
    }
    // the game's light rig (TUNING.light), directions only; the room is in metres, the game in half metres
    {
      const T = TUNING.light, key = shadowed(new THREE.DirectionalLight(T.key.color, T.key.intensity));
      const kd = directionFromAngles(T.key.elevation, T.key.azimuth); key.position.set(kd.x * 12, kd.y * 12, kd.z * 12);
      const fill = new THREE.DirectionalLight(T.fill.color, T.fill.intensity);
      const fd = directionFromAngles(T.fill.elevation, T.fill.azimuth); fill.position.set(fd.x * 10, fd.y * 10, fd.z * 10);
      add("game", new THREE.HemisphereLight(T.hemi.sky, T.hemi.ground, T.hemi.intensity), new THREE.AmbientLight(T.ambient.color, T.ambient.intensity), key, key.target, fill);
      L.game.userData = { bg: TUNING.desk?.background ?? "#cfe5ef", exposure: T.exposure ?? 1 };
    }
    // overcast: no hard shadows, an even sky
    {
      const d = new THREE.DirectionalLight("#fff6ea", .7); d.position.set(4, 9, 2);
      add("soft", new THREE.HemisphereLight("#fbf6ee", "#8a7558", 2.1), new THREE.AmbientLight("#ffffff", .45), d);
      L.soft.userData = { bg: "#e6eef0", exposure: 1 };
    }
    // evening: the mushroom lamp on the cabinet and the laptop screen
    {
      const lantern = this.room.getObjectByName("Lantern"), lp = new THREE.Vector3(3.64, .98, 2.44);
      if (lantern) new THREE.Box3().setFromObject(lantern).getCenter(lp);
      const lamp = new THREE.PointLight("#ffbe6a", 6, 7, 1.6); lamp.position.copy(lp).add(new THREE.Vector3(-.05, .05, 0));
      lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -.002;
      const glow = new THREE.PointLight("#bfd4ff", 1.2, 3, 2); glow.position.copy(this.screenCenter).addScaledVector(this.screenNormal, .35);
      add("lamp", new THREE.HemisphereLight("#3a4a78", "#24180f", .55), new THREE.AmbientLight("#28304f", .5), lamp, glow);
      L.lamp.userData = { bg: "#1d2440", exposure: 1.15, screenGlow: true };
    }
  }

  // God rays for the afternoon sun, through whatever opening the roof has (found again whenever the model changes).
  #buildRays() {
    let shell = null, vol = 0;
    this.room.traverse((o) => {
      if (!o.isMesh || ![].concat(o.material).some((m) => m.name === "Room")) return;
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), v = sz.x * sz.y * sz.z;
      if (v > vol) { vol = v; shell = o; }
    });
    if (!shell) return;
    const bounds = new THREE.Box3().setFromObject(shell).expandByScalar(-.15);
    bounds.min.y = .3;
    const corners = findSkylight(shell, bounds);
    const sun = this.lights.sun.children.find((c) => c.isDirectionalLight);
    if (!corners || !sun) { console.info("landing: no skylight found, no god rays"); return; }
    this.skylight = corners;
    this.rays = new GodRays(corners, sun.target.position.clone().sub(sun.position));
  }

  // The messy room: the same kinds of things as the desktop inside the laptop, in a few piles on the open floor,
  // some strays, and a little stack on the desk. Seeded, so every visit is the same mess.
  #buildFiles() {
    const R = rng(20261011);
    this.files = new THREE.Group(); this.scene.add(this.files);
    const faces = {}, geo = {}, mats = {};
    const face = (k) => faces[k] ??= (() => { const t = new THREE.CanvasTexture(this.faceCanvas(k)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const matsFor = (k) => mats[k] ??= (() => {
      // pulled forward in depth a little: thin things on the floor must not trade depth with it under vertex wobble
      const lift = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
      const side = new THREE.MeshStandardMaterial({ color: EDGE[k], roughness: .9, ...lift });
      const top = new THREE.MeshStandardMaterial({ map: face(k), roughness: .85, ...lift });
      const bottom = new THREE.MeshStandardMaterial({ color: "#efe6d2", roughness: .9, ...lift });
      return [side, side, top, bottom, side, side];
    })();
    const thing = (k) => { const [w, d, t] = FILE_SIZE[k]; geo[k] ??= new THREE.BoxGeometry(w, t, d); const m = new THREE.Mesh(geo[k], matsFor(k)); m.userData.t = t; return m; };
    const pile = (cx, cz, n, spread, y0 = 0, kinds = KINDS) => {
      let y = y0;
      for (let i = 0; i < n; i++) {
        const k = kinds[Math.floor(R() * kinds.length)], m = thing(k), t = m.userData.t;
        const r = spread * Math.sqrt(R()) * (1 - i / n * .55), a = R() * Math.PI * 2;
        m.position.set(cx + Math.cos(a) * r, y + t / 2, cz + Math.sin(a) * r);
        m.rotation.set((R() - .5) * .06, R() * Math.PI * 2, (R() - .5) * .06);
        y += t * (.65 + R() * .5);
        this.files.add(m);
      }
    };
    const stray = (x0, x1, z0, z1, n) => {
      for (let i = 0; i < n; i++) {
        const k = KINDS[Math.floor(R() * KINDS.length)], m = thing(k);
        m.position.set(lerp(x0, x1, R()), m.userData.t / 2 + .001 * i, lerp(z0, z1, R()));
        m.rotation.y = R() * Math.PI * 2;
        this.files.add(m);
      }
    };
    // a big pile in the foreground (the painting's paper heap), a second one by the rug, a small one by the shelf
    pile(-.15, 1.2, 30, .62);   // the big heap, front right from the door
    pile(-1.0, -1.15, 17, .45); // front left
    pile(1.05, .55, 13, .36);   // in front of the chair
    pile(1.55, -1.25, 9, .3);   // on the rug
    pile(-2.0, .9, 7, .28);
    stray(-2.3, 1.9, -2.1, 2.4, 22);
    // on the desk, next to the laptop (desk top y ≈ .73)
    pile(3.42, 1.3, 6, .05, .735, ["document", "document", "photo"]);
  }

  #buildBoxes(src) {
    this.boxes = new THREE.Group(); this.scene.add(this.boxes);
    const tones = ["#b7c9a2", "#f3dcb4", "#b7c9a2", "#f3dcb4"]; // sage / sand like the desktop folders
    for (let i = 0; i < 4; i++) {
      const b = src.clone(true);
      b.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        o.material = [].concat(o.material).map((m) => { const c = m.clone(); if (m.name === "box_body") c.color.set(tones[i]); return c; });
        if (o.material.length === 1) o.material = o.material[0];
      });
      // front (+Z) turned to the room (−x); one neat row from the door-side wall, just left of the rug
      // (the final model put a plant in the bed–desk gap, 10-11; two high was nearly as tall as the bed)
      b.rotation.y = -Math.PI / 2;
      b.position.set(1.15, 0, -2.55 + i * .56);
      this.boxes.add(b);
    }
    this.boxes.visible = false;
  }

  setState(state) {
    if (state === this.state || !this.ready) return;
    this.state = state;
    this.files.visible = state === "messy";
    if (this.boxes) this.boxes.visible = state === "tidy";
    this.#applyLight(); // the light changes with the room; the switch happens while the screen fills the frame
  }

  // first room → style.light, last room → style.lightEnd
  get activeLight() { return this.state === "tidy" ? this.style.lightEnd ?? this.style.light : this.style.light; }

  #applyLight() {
    const s = this.style, key = this.lights[this.activeLight] ? this.activeLight : "sun";
    for (const [k, g] of Object.entries(this.lights)) g.visible = k === key;
    const L = this.lights[key].userData;
    this.scene.background = new THREE.Color(L.bg);
    this.renderer.toneMapping = { none: THREE.NoToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping }[s.tone] ?? THREE.NoToneMapping;
    this.renderer.toneMappingExposure = L.exposure;
    this.renderer.shadowMap.type = key === "game" ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.rays) this.rays.on = key === "sun" && s.rays !== false && this.quality.profile.rays;
    const sm = [].concat(this.screenMesh.material).find((mm) => mm.name === SCREEN);
    if (sm?.emissive) sm.emissive.set(L.screenGlow ? "#1b2440" : "#000000");
  }

  setStyle(patch) {
    Object.assign(this.style, patch);
    if (!this.ready) return;
    const s = this.style;
    setInk(this.outline, s.ink, TUNING.outline.color);
    this.snap.settings.preset = s.wobble;
    this.#applyEffects();
    this.#applyMaterials(s.mat);
    this.#applyLight();
  }

  // Outline and dithering as styled, unless the device is on the light tier (then off: one geometry pass fewer).
  #applyEffects() {
    const on = this.quality.profile.effects;
    this.outline.outline.thickness = on ? +this.style.outline : 0;
    this.outline.dithering.preset = on ? this.style.dither : "off";
  }

  // A tier or resolution change: pixel ratio, shadow map sizes (the lamp's cube shadow goes on the light tier), rays.
  #applyQuality() {
    const p = this.quality.profile;
    this.resize(this.size.w, this.size.h);
    for (const group of Object.values(this.lights)) group.traverse((light) => {
      if (!light.isLight || !light.shadow) return;
      // only lights built with a shadow (#buildLights); the screen glow must never get one (it streaked the wall, 10-11)
      light.userData.castsShadow ??= light.castShadow;
      if (!light.userData.castsShadow) return;
      if (light.isPointLight) light.castShadow = p.effects;
      const size = light.isPointLight ? p.shadowSize / 2 : p.shadowSize;
      if (light.castShadow && light.shadow.mapSize.x !== size) {
        light.shadow.map?.dispose(); light.shadow.map = null;
        light.shadow.mapSize.set(size, size);
      }
    });
    if (this.ready) { this.#applyEffects(); this.#applyLight(); }
    this.canvas.dataset.quality = `${this.quality.active}:${this.quality.scale}`;
    this.onQuality?.(this.quality);
  }

  #applyMaterials(kind) {
    this._matCache ??= new Map();
    const gradient = toonGradient(); // the game's 3-step ramp (materials.js)
    const convert = (m) => {
      if (kind === "pbr") return m;
      const key = m.uuid + kind;
      if (this._matCache.has(key)) return this._matCache.get(key);
      const base = { name: m.name, map: m.map ?? null, color: m.color?.clone() ?? new THREE.Color("#fff"), transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits };
      const out = kind === "toon" ? new THREE.MeshToonMaterial({ ...base, gradientMap: gradient })
        : kind === "matte" ? new THREE.MeshLambertMaterial(base)
          : new THREE.MeshBasicMaterial(base);
      this._matCache.set(key, out);
      return out;
    };
    for (const o of this.meshes) {
      const orig = o.userData.orig;
      o.material = Array.isArray(orig) ? orig.map(convert) : convert(orig);
    }
  }

  resize(w, h) {
    this.size = { w, h };
    const pr = renderPixelRatio(w, h, devicePixelRatio || 1, this.quality.profile, this.quality.scale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.outline.resize();
  }

  // ── camera ──
  startPose(key = this.style.cam) {
    const c = CAMERAS[key];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.yaw * DEG, 0, "YXZ"));
    return { pos: new THREE.Vector3(...c.p), q, hfov: c.hfov, shift: c.shift };
  }

  // Looking straight at the screen, close enough that its width spans the 16:9 cover plate. Lenses are defined on
  // that plate (like the painting, which was cover-fitted), so a tall phone sees the middle of the same picture.
  endPose() {
    const tanH = Math.tan(END_HFOV * DEG / 2);
    const d = this.screenW / (2 * tanH);
    const pos = this.screenCenter.clone().addScaledVector(this.screenNormal, d);
    const m = new THREE.Matrix4().lookAt(pos, this.screenCenter, this.screenUp);
    return { pos, q: new THREE.Quaternion().setFromRotationMatrix(m), hfov: END_HFOV, shift: 0, d };
  }

  // t = 0 standing in the room, 1 in front of the screen. The distance to the screen closes at a constant zoom rate
  // (as the 2D zoom did), the head turns to the screen early, the lens shift and the wide lens give way to the end lens.
  poseAt(t) {
    const S = this.startPose(), E = this.endPose();
    const e = inOut(clamp(t));
    const dS = S.pos.distanceTo(this.screenCenter), dE = E.d;
    const dir = S.pos.clone().sub(this.screenCenter).normalize().lerp(this.screenNormal, inOut(smooth(0, .85, t))).normalize();
    const dist = Math.exp(lerp(Math.log(dS), Math.log(dE), e));
    const pos = this.screenCenter.clone().addScaledVector(dir, dist);
    const q = S.q.clone().slerp(E.q, inOut(smooth(0, .7, t)));
    return { pos, q, hfov: lerp(S.hfov, E.hfov, smooth(0, .8, t)), shift: lerp(S.shift, 0, smooth(0, .7, t)) };
  }

  #applyPose(P, plateW, plateH) {
    const cam = this.camera, { w, h } = this.size;
    const f = (plateW / 2) / Math.tan(P.hfov * DEG / 2); // focal length in CSS px
    cam.aspect = w / h;
    cam.fov = 2 * Math.atan(h / 2 / f) / DEG;
    cam.position.copy(P.pos); cam.quaternion.copy(P.q);
    if (P.shift) cam.setViewOffset(w, h, 0, P.shift * plateH, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  // Screen corners (TL, TR, BR, BL) in canvas CSS px. With vertex wobble on, snapped to the same grid as the shader,
  // so the DOM desktop stays glued to the wobbling screen.
  screenQuad() {
    const { w, h } = this.size, cell = this.snap.settings.cellSizes[this.snap.settings.preset] ?? 0;
    return this.corners.map((c) => {
      const v = this._v.copy(c).project(this.camera);
      let x = (v.x + 1) / 2, y = (1 - v.y) / 2;
      if (cell > 0) { const gx = w / cell, gy = h / cell; x = Math.floor(x * gx + .5) / gx; y = Math.floor(y * gy + .5) / gy; }
      return [x * w, y * h];
    });
  }

  render(t, plateW, plateH) {
    if (!this.ready) return null;
    const now = performance.now();
    if (this._last && this.quality.observe((now - this._last) / 1000, !document.hidden)) this.#applyQuality();
    this._last = now;
    this.#applyPose(this.poseAt(t), plateW, plateH);
    this.snap.prepare(this.scene);
    this.outline.render(this.scene, this.camera);
    this.rays?.render(this.renderer, this.camera, performance.now() / 1000, this.renderer.getPixelRatio());
    return this.screenQuad();
  }
}

// Same two-step render for the inside-the-laptop scene, so a style can be tried on the whole landing at once.
export class StyledPass {
  constructor(renderer, style) {
    this.outline = new OutlineEffect(renderer, { ...TUNING.outline }, { ...TUNING.dithering, levels: { ...TUNING.dithering.levels } });
    this.snap = new VertexSnapEffect(renderer, { ...TUNING.vertexWobble, cellSizes: { ...TUNING.vertexWobble.cellSizes } });
    this.snap.patchMaterial(this.outline.normalMaterial);
    this.on = false;
    this.set(style);
  }
  set(s) {
    this.style = s;
    const fx = this.effects !== false; // off on the light device tier, like the room
    this.outline.outline.thickness = fx ? +s.outline : 0; this.outline.dithering.preset = fx ? s.dither : "off"; this.snap.settings.preset = s.wobble;
    setInk(this.outline, s.ink, TUNING.outline.color);
    this.on = !!s.inside;
  }
  setEffects(on) { this.effects = on; if (this.style) this.set(this.style); }
  resize() { this.outline.resize(); }
  render(renderer, scene, camera) {
    if (!this.on) { camera.layers.enable(TEXT_LAYER); renderer.render(scene, camera); camera.layers.disable(TEXT_LAYER); return; }
    this.snap.prepare(scene);
    this.outline.render(scene, camera);
  }
}
