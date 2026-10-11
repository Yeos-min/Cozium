> 2026-10-10: 이 문서는 종료된 실험 기록입니다. 사용자 요청으로 해당 효과·비교 카메라를 제거했습니다. 현재 구현은 [게임 렌더링](render-effects.md)을 참조하세요.

# 공식 Three.js 픽셀 렌더링

`app.html`의 기존 게임 장면에 `EffectComposer → RenderPixelatedPass → OutputPass`를 연결했다. Three.js 본체와 addon 모두 **three@0.185.1 (r185)**다. 기존 import map의 `three/addons/`를 사용하고, 공식 npm 패키지의 addon 파일을 `vendor/three/addons/`에 수정 없이 보관해 CDN 없이 실행한다.

공식 참고: [r185 픽셀 데모 소스](https://github.com/mrdoob/three.js/blob/r185/examples/webgl_postprocessing_pixel.html), [RenderPixelatedPass 문서](https://threejs.org/docs/pages/RenderPixelatedPass.html).

## 값 조절

`js/three/tuning.js`의 `TUNING.pixelation`:

```js
pixelation: {
  enabled: true,
  pixelSize: 6,
  pixelSizeUnit: "css",
  normalEdgeStrength: 0.5,
  depthEdgeStrength: 0.6,
},
```

브라우저 콘솔에서는 다음처럼 바꾸면 다음 렌더 프레임에 반영된다. 새로고침하면 파일의 초기값으로 돌아간다.

```js
__tuning.pixelation.pixelSize = 8; // 1, 2, 4, 8 등 비교
__tuning.pixelation.normalEdgeStrength = 0; // 면 사이 강조 제거
__tuning.pixelation.depthEdgeStrength = 0;  // 깊이 경계 강조 제거
__tuning.pixelation.enabled = false;        // 기존 렌더 경로와 비교
```

현재 `pixelSizeUnit: "css"`는 화면 CSS px 단위다. 공식 API는 drawing buffer 픽셀 단위를 쓰므로 wrapper가 `pixelSize × renderer DPR`을 전달한다. 기존 화면 품질·버퍼 예산을 유지하며 DPR이 바뀌어도 화면상 블록 크기가 약 6px로 유지된다(내부 target 크기는 정수로 내림). `pixelSizeUnit`을 `"buffer"`로 바꾸면 최초 적용의 buffer 단위로 비교할 수 있다. API의 `setPixelSize()`로 변경하고, 두 edge 값은 pass 속성에 직접 넣어 0도 정상 반영한다(r185 생성자는 0을 기본값으로 바꾸기 때문).

## 기존 후처리와 UI

첫 화면은 픽셀 효과만 비교할 수 있게 기존 `TUNING.kuwahara.preset`을 `off`, `TUNING.outline.thickness`를 `0`으로 시작한다. 기존 필터 코드와 설정 UI는 보존했다. UI에서 다시 켜면 공식 composer의 최종 색 출력 이후 기존 Kuwahara/외곽선 후처리가 실행된다. 기존 필터는 출력 색 공간에서 계산하므로 `OutputPass` 뒤에 연결한다. Color Quantization과 Dithering은 추가하지 않았다.

최초 적용은 Scene·Camera·이동·GLB·조명·재질을 유지하는 범위였다. 이후 사용자 승인으로 [1인칭 픽셀 아트 스타일](pixel-art-style.md)을 적용해 조명·재질·질감·장식 형태를 변경했다. 1인칭 카메라·프리셋·WASD·시점 입력과 파일 조작은 유지한다. `resize()`는 기존 renderer 크기/DPR 갱신 후 composer도 함께 갱신하며 종료 시 pass와 composer 자원을 해제한다.

HTML/CSS UI와 CSS2D 라벨은 composer에 들어가지 않는다. 3D 모델에 붙은 글자 mesh는 장면과 같이 픽셀화한다. 기존 렌더 경로로 돌아가면 원래의 선명한 모델 글자 후처리가 실행된다. normal override가 보이지 않는 집기 판정 영역을 경계선으로 그리지 않도록 렌더 중에만 숨기고 원래 상태를 복원한다.

## 실행과 검증

```sh
npm run dev
```

게임 비교 주소: `/app.html?entry=sample&storage=memory&quality=high`.

`/tools/pixelated-check.html`은 실제 GPU 출력을 읽어 4×4 블록, 값 변경, edge=0, DPR=2 resize, 기존 후처리와의 병용, 상태 복원·dispose를 검증한다. 기존 `/tools/kuwahara-check.html` 검증도 유지한다. 실제 프로젝트의 검증 결과와 반영 시각은 `docs/agent-timeline.md`에 기록한다.
