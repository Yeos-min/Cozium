// Outline ink colour for the review (2026-10-11). The game's OutlineEffect draws every edge in one fixed colour
// (TUNING.outline.color, a brown). This adds a second mode without editing js/three: the line takes the colour around
// it, darkened, so a green blanket gets a deep green line and the cream wall a dark warm one.
// It patches the effect's composite shader string before it is first compiled. If the user keeps this mode, the same
// few lines move into js/three/outline-effect.js (Codex) and this file goes away.
export const INKS = {
  brown: { label: "갈색(지금 게임)", color: null, tint: 0 },
  gray: { label: "짙은 회색", color: "#26262a", tint: 0 },
  around: { label: "주변색", color: "#26262a", tint: 1 },
};

const LINE = "color = mix(color, outlineColor, edge * outlineOpacity);";

export function enableInk(effect) {
  const m = effect.composite;
  if (m.userData.ink || !m.fragmentShader.includes(LINE)) return !!m.userData.ink;
  m.uniforms.inkTint = { value: 0 };
  m.uniforms.inkDark = { value: .34 };
  m.fragmentShader = m.fragmentShader
    .replace("uniform vec3 outlineColor;", "uniform vec3 outlineColor;\n  uniform float inkTint;\n  uniform float inkDark;")
    .replace(LINE, `vec3 around = texture2D(source, vUv).rgb;
      around += texture2D(source, vUv + vec2(outlineStep.x, 0.0)).rgb + texture2D(source, vUv - vec2(outlineStep.x, 0.0)).rgb;
      around += texture2D(source, vUv + vec2(0.0, outlineStep.y)).rgb + texture2D(source, vUv - vec2(0.0, outlineStep.y)).rgb;
      around /= 5.0;
      // darker and a little richer than what is under it
      vec3 tinted = pow(clamp(around, 0.0, 1.0), vec3(1.35)) * inkDark;
      vec3 ink = mix(outlineColor, tinted, inkTint);
      color = mix(color, ink, edge * outlineOpacity);`);
  m.userData.ink = true;
  m.needsUpdate = true;
  return true;
}

export function setInk(effect, key, fallbackColor) {
  const ink = INKS[key] ?? INKS.brown;
  effect.outline.color = ink.color ?? fallbackColor;
  // 10-11 저녁: 주변색 선이 js/three/outline-effect.js에 들어갔다(outline.ink). 그 셰이더에는 아래 덧씌우기가
  // 찾는 줄이 없어서 enableInk는 아무것도 안 한다. 예전 셰이더에서는 그대로 덧씌운다.
  effect.outline.ink = ink.tint ? "around" : "fixed";
  if (enableInk(effect)) effect.composite.uniforms.inkTint.value = ink.tint;
}
