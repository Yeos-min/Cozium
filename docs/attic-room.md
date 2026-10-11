# 게임 방 = 다락방 모델 (Claude, 2026-10-11)

사용자 요청(10-11): 실제 플레이 방을 `models/room.glb`(사용자 Blender 최종본, sha256 c0ff2b60767b)로 바꾸고, `models/box.glb`를 폴더 상자로 연결, 파일이 핀보드·책 더미·바닥에서 나오게, 그림은 랜딩과 같게. 원래 Codex 담당(`js/three`)이지만 이번에는 사용자가 Claude에게 맡겼다.

## 단위와 좌표

- 모델은 미터, 게임은 1 단위 = 0.5 m(눈높이 3.1 = 1.55 m). 방을 ×2로 불러온다(`ATTIC_SCALE`).
- 방 안쪽 반폭 8.7 × 5.8, 용마루 x = 0(z 방향), 처마 벽 x = ±8.7(높이 2.34), 박공벽 z = ±5.8. 침대·책상·수납장이 +x, 문은 −z 벽 가운데, 핀보드는 +z 벽 가운데.
- 숫자는 전부 `js/three/attic-room.js` 한 곳: 파일 바닥(`ATTIC_FLOOR`), 걷기 범위(`ATTIC_WALK`, 천장이 눈보다 25 cm 이상 높은 곳), 시작 자리, 더미 자리, 가구 발자국(`ATTIC_OBSTACLES`, 모델에서 잰 상자 ×2), 상자 줄 벽 구간(`ATTIC_SHELF_RUNS`)·간격(`ATTIC_STACK`), 핀보드, 책 더미, 상자 크기. **모델을 다시 내보내면 이 값을 같이 확인한다**(`tests/attic-room.test.js`가 겹침·천장을 잡는다).
- `scene-kit.js`의 `toWorld/toLogical`: 논리 (0, 0) = 파일 바닥 왼쪽 위(minX, minZ). 예전에는 1280×720 보드 가운데가 원점이었다. 1인칭에서 저장소 범위는 `atticFloorBounds(UNIT)`(1060 × 760).

## 바뀐 것

- **방**: `SceneKit#loadAttic`이 GLTFLoader로 받아 툰 재질로 바꿔 넣는다. 오기 전·실패하면 같은 크기의 빈 방(벽 넷 + 바닥)이 남는다(가구 발자국·선반은 같음). 예전 절차 가구(`cozy-room.js`)와 `Bed.glb`는 10-11 정리 때 뺐다(`_archive/claude-cleanup-20261011/`). 노트북 화면(`Laptop_screen`)에는 랜딩 바탕화면(`desktop-v2/wallpaper.svg`)을 띄운다. `app.html`이 `room.glb`를 미리 받는다(preload).
- **카드 크기**: 172 × 104 → 110 × 66(55 × 33 cm, `ATTIC_CARD`). 실제 크기 가구 옆에서 예전 카드가 바닥 타일처럼 보였다. 내려놓기는 바닥 전체.
- **처음 자리와 시작 자리 (10-11 19시 사용자: 상자 벽을 보게)**: 시작 자리는 침대와 책상 사이(x 3.4, z −0.8)에서 상자 벽(−x)을 본다(`ATTIC_SPAWN.yaw` 90°). 처음 깔리는 칸은 그 사이 바닥에 상자 벽과 나란한 6칸 × 4줄(`atticSlotArea`, x −3.7…−0.18, 정원 24). 카드는 위쪽이 상자 벽을 보게 90° 돌려 놓아 시작 자리에서 글씨가 바로 읽힌다(`ATTIC_FLOOR_LAYOUT.baseRotation`, floor-layout `config.floor.baseRotation`). 파일이 적으면 가운데 줄부터(`centerFirst`). 상자 앞 1.75 m는 비운다. 파일 바닥 z −4.1 → −5.1(문 쪽 선반이 없어져서). 손에 든 크기 0.95, 상자 안 0.8.
- **처음 자리** (`js/three/file-homes.js`): 이미지·txt·md → 핀보드(20칸, 세워서 꽂음), pdf·doc·docx·hwp·hwpx·rtf → 핀보드 아래 책 더미(4더미 × 6권, 표지 색은 이름으로), 나머지 → 바닥. 레이아웃 설정 `home`/`homeCapacity`(app.js)로 저장소가 `position.home`만 표시하고 바닥 칸을 쓰지 않는다. 정원이 차면 바닥. 칸은 장면이 정한다(`HomeSlots`, 같은 파일은 같은 칸). 집어서 내려놓으면(`setPositions`) home이 지워져 바닥 파일이 된다. 되돌리기는 원래 자리로.
- **생김새** (`file-form.js`): md도 메모지, 문서는 `book` 형태(비율 1.33, 두께 2.4배, 옆면 종이색). `tests/file-form.test.js`의 “pdf·docx는 카드” 검사를 바꿨다.
- **폴더 상자**: `MODEL_MANIFEST.box = box.glb`(맞춤 없이 ×2). 상자마다 재질을 복제해 몸통에 폴더 색, 테두리에 겨눔 빛. 앞면 UV가 아틀라스 조각이라 이름은 손잡이 구멍 아래 판(`makeBoxLabelTexture`, 번호 = 숫자 키). 겨눔 테두리 선·안쪽 빛은 모델이 들어와도 남는다(`feedback`). 높이 `TUNING.box.height` 1.08 → 0.98.
- **상자 자리 (10-11 19시 사용자 요청으로 바꿈)**: 침대 반대쪽 낮은 처마 벽(−x)을 따라 한 줄, **선반 틀 없이** 바닥에 두고 위에 한 단 더 쌓는다(`wallShelfSlots`에 `wall: "x"` 추가, `ATTIC_STACK` = 바닥 0, 단 사이 0.01, 옆 간격 0.08). 벽 가운데부터 양쪽으로 번갈아 채운다. 10칸 × 2단 = 20칸, 넘치면 기존 ‘수납 구역’ 페이지. 처마 1.17 m, 두 단 0.98 m로 벽 목재 띠(1.1 m) 아래. 위 칸이 배정됐는데 아래 칸이 비면(폴더가 빠졌을 때) 위 상자를 바닥으로 내려 뜨지 않게 한다(`board-3d.js`). `SceneKit#setFolderShelf`는 이제 칸만 기억한다(틀 안 세움). 파일 바닥 `minX` −7.8 → −7.0(상자 줄 앞을 비움). 그 전(문 양옆 박공벽 + 선반 틀, 18칸)은 `_archive/claude-attic-boxes-20261011/`.
- **그림**: `docs/render-effects.md`의 ‘다락방’ 절.

## 확인

- 리포 사본 `npm test`(새 `tests/attic-room.test.js`, `tests/file-homes.test.js`).
- 헤드리스 Chromium(SwiftShader)으로 샘플 시작 → 방 로드, 핀보드·책·바닥 배치, 손에 들기, 숫자 키로 넣기, Ctrl+Z로 핀보드 복귀, 바닥에 내려놓기, Tab 상자 배치 모드, `?quality=low`, 콘솔 오류 없음.
- **실제 GPU 프레임, 포인터 락 조작감, 실제 바탕화면 파일은 미확인.**

## 열린 것

- 카드 크기·시작 자리·선반 위치는 사용자 확인 전 제안값.
- 추가 공간(문 너머)은 모델이 없어 아직 없음(`claude/room-design.md`).
- 위에 상자를 얹으면 아래 상자 안 카드는 거의 안 보인다(위가 열린 상자를 그대로 쌓으므로). 앞면 이름표는 둘 다 보인다.
- 박공 천장은 충돌이 아니라 걷기 범위로만 막는다. 상자 배치 모드에서 처마 쪽 높은 자리는 지붕을 뚫을 수 있다.
