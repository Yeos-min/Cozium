// 랜딩 외곽선 색 설정. INKS의 이름(갈색 / 짙은 회색 / 주변색)을 OutlineEffect 설정으로 바꿔 준다(setInk).
// 주변색 선(선 아래 색을 어둡게 해서 쓰는 방식)은 js/three/outline-effect.js에 들어 있다(outline.ink = "around").
export const INKS = {
  brown: { label: "갈색", color: null, tint: 0 },
  gray: { label: "짙은 회색", color: "#26262a", tint: 0 },
  around: { label: "주변색", color: "#26262a", tint: 1 },
};

export function setInk(effect, key, fallbackColor) {
  const ink = INKS[key] ?? INKS.brown;
  effect.outline.color = ink.color ?? fallbackColor;
  effect.outline.ink = ink.tint ? "around" : "fixed"; // 셰이더 쪽은 js/three/outline-effect.js(inkTint)
}
