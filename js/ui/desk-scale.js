/**
 * desk-scale.js — 노트북 바탕화면의 크기 배율 (2026-10-18, 사용자: 42인치 4K 모니터에서 바탕화면이 휑하다).
 *
 * 랜딩 노트북 안 바탕화면의 아이콘·작업표시줄·테두리는 1600 × 900 화면을 1로 잡고,
 * 그보다 큰 화면에서는 같은 비율로 커진다(최대 2.6배). 그래서 4K에서도 1600 × 900에서 보던 구도 그대로다.
 * 1600 × 900 이하에서는 1. **랜딩에만 쓴다** — 가져오기·결과 화면은 큰 화면이면 아이콘이 더 많이 들어가는 쪽이
 * 낫다(10-18 19시 사용자: 그 둘은 원래대로).
 */
export const DESK_BASE = { w: 1600, h: 900 };

export function deskScale(width = innerWidth, height = innerHeight) {
  return Math.min(2.6, Math.max(1, Math.min(width / DESK_BASE.w, height / DESK_BASE.h)));
}

