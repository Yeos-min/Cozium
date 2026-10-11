# 현재 게임 렌더링 · 2026-10-10

사용자 요청으로 게임은 1인칭만 사용한다. 사선·탑다운·정사영 카메라와 앱의 개발용 2D 진입을 제거했다. 기존 WASD·마우스 시점·집기·넣기·되돌리기와 방 색·가구 배치는 유지한다.

Kuwahara(수채화/유화)와 RenderPixelatedPass의 실행 코드, 설정 UI, GPU 버퍼 및 사용하지 않는 composer addon을 제거했다. 픽셀 전용 nearest 텍스처·flat shading 적용도 제거하고, 사진 축소는 일반 보간으로, 액자 그림은 384×512로 되돌렸다. 방의 체크 바닥·팔레트는 장면 디자인으로 유지하며 `room-style.js`, `TUNING.desk`에서 관리한다. 침대는 사용자가 만든 `models/Bed.glb`를 다시 사용한다(`TUNING.room.primitiveBed=false`). 기존 로더·크기 맞춤·배치를 유지하며, GLB 로드 실패 시에만 단순 침대를 표시한다.

아웃라인은 `js/three/outline-effect.js`로 분리했다. 기존 depth/normal 경계 셰이더와 화면 출력 색을 그대로 사용하며, 모델 글자는 원래 장면의 depth로 가림을 유지하면서 마지막에 선명하게 렌더링한다. 아웃라인 0·디더링 Off에서는 추가 GPU 대상 생성 없이 장면과 글자를 렌더링한다. 수채화 텐서·blur·색 합성이나 픽셀 composer는 생성하지 않는다.

## 조절

오른쪽 위 톱니바퀴 → **외곽선 굵기**에서 0~4px를 조절한다. 시작값은 1px이다. `js/three/tuning.js`의 `TUNING.outline`에 색·불투명도·depth/normal threshold가 있다. 기존 ‘가볍게’ 품질 단계는 아웃라인을 생략하고, ‘선명하게’로 돌아오면 선택한 굵기를 복원한다. resize 시 renderer·아웃라인의 색/normal/depth 버퍼·HTML 라벨 크기를 함께 갱신한다.

## Ordered dithering + PS1 vertex wobble

사용자 첨부에 나온 두 효과를 별도 설정으로 추가했다. 톱니바퀴에서 각각 Off로 끄거나 단계를 비교한다. 첨부의 선택값에 맞춰 시작값은 **Coarse / Wobble**이다.

- `TUNING.dithering`: Off / Fine / Medium / Coarse = 채널당 0(원본) / 16 / 8 / 4단계. 4×4 Bayer 임계 패턴을 화면 출력 색에 적용하며, 패턴 한 칸은 `cellSize=2` CSS px이다. 캔버스와 텍스처 해상도는 줄이지 않는다. 디더링 뒤에 아웃라인을 합성하고 모델 문자를 그려 외곽선 색과 파일명 가독성을 유지한다. HTML UI는 효과 대상 밖이다.
- `TUNING.vertexWobble`: Off / Subtle / Wobble / PS1 = 화면 정점 격자 0 / 1 / 3 / 6 CSS px. `vertex-snap.js`가 투영 후 `gl_Position.xy / w`를 격자에 맞춘 뒤 w를 다시 곱한다. 카메라 이동에 따라 정점이 다음 칸으로 넘어가는 PS1 스타일이며, 임의 시간 노이즈가 아니다. 월드 정점·충돌·레이캐스트·카메라 입력은 그대로다. 모델 문자와 아웃라인 normal/depth에도 같은 보정을 적용한다. 그림자 카메라는 원래 형상을 사용한다.

두 효과는 기존 ‘가볍게’ 품질에서도 선택한 단계를 유지하며 실제 renderer DPR에 맞춰 CSS 단위를 보정한다. 재질의 기존 `onBeforeCompile`과 shader cache key를 보존해 확장한다. Three.js r185 API는 [Material 문서](https://threejs.org/docs/pages/Material.html#onBeforeCompile)와 로컬 shader chunk를 확인했다. 낮은 격자 정밀도에서 선·파일 카드 모서리가 움직이는 것은 효과의 의도된 표현이다.

## 검증

`npm test`와 `tools/outline-check.html`로 회귀·아웃라인 굵기·색·모델 글자 가독성·가림·DPR·상태 복원을 검증한다. 실제 앱의 샘플 파일과 1인칭 입력·설정·resize 경로도 브라우저에서 확인한다. 원본 결과와 반영·백업 위치는 `output/first-person-20261010/` 및 작업 타임라인에 기록한다. 실제 파일 이동과 학교 PC 성능은 이 렌더링 변경의 검증 대상이 아니다.

신규 `tools/retro-check.html`은 실제 GPU에서 Bayer 반복·채널 단계·평균 색·Off 복귀, 정점 스냅의 화면 변화·작은/큰 카메라 이동·월드 형상 보존·기존 shader hook·DPR를 검사한다. 앱의 두 메뉴·기존 파일 조작과 캡처는 `output/retro-20261010/`에 기록한다.

## 다락방 · 2026-10-11 (Claude)

사용자가 랜딩에서 고른 그림을 게임에도 맞췄다. 자세한 방 연결은 `docs/attic-room.md`.

- 재질: `TUNING.render.material = "toon"` → `js/three/materials.js`의 `surfaceMaterial`(카드·상자·더미·선반)과 `toonFrom`(불러온 방·상자 모델)이 MeshToonMaterial 3단(그라데이션 90/170/255)을 만든다. `"pbr"`이면 예전 MeshStandardMaterial.
- 외곽선: 1px, `TUNING.outline.ink = "around"` — 선이 갈색 고정(#51351f) 대신 그 자리 색을 어둡게 한 색(5점 평균^1.35 × `inkDark` 0.34)이 된다. `outline-effect.js` 합성 셰이더에 `inkTint`·`inkDark` 유니폼으로 넣었다(랜딩 `outline-ink.js`가 문자열을 덧씌우던 것을 옮김). `ink: "fixed"`면 `color` 한 색(#26262a).
- 디더링 시작값 Coarse → **Fine**. 정점 흔들림은 Wobble 그대로.
- 빛: `TUNING.light`를 랜딩 마지막 방의 ‘오후 햇살’로(천창 쪽 해 #ffd9a0 3.8, 반구광 #fff3dc/#8a6844 1.7, 주변광 0.5, 하늘색 배경 #cfe5ef). 그림자는 PCF(`shadow.type`), 범위 13.
- 햇살 줄기: `js/three/godrays.js`(랜딩 것을 단위만 받게 고친 사본). 방 껍질에 위로 쏜 광선이 빠지는 곳을 천창으로 찾아 해 방향으로 늘인 가산 판 + 먼지. `TUNING.render.rays`, 품질 ‘가볍게’에서는 그리지 않는다.
