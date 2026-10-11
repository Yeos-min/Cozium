# 실제 게임 성능 측정 · 2026-10-06

최신 원본: `D:\울산대\3학년 2학기\웹디자인2\Project\desktop-cleanup-prototype` 루트. Codex가 2026-10-06 19:47:34–20:11:19 KST에 조사·수정·검증했다. 학교 PC의 버벅임 해결을 확인한 기록은 아니다.

## 적용한 최소 게임 변경

- `js/three/scene-kit.js:603`의 집기 판정은 전체 scene 대신 카메라·집기 대상·그 조상/자손의 행렬만 갱신한다. helper는 `js/three/pick-matrices.js:2`. 움직이는 부모와 수동 local matrix도 갱신하도록 bundled Three r185의 세 번째 force 인자를 사용한다.
- `scene-kit.js:633`에서 `profile=1`일 때만 계측 모듈과 검사 도구를 동적으로 불러온다. 평소에는 계측 UI와 래퍼가 없다. `frame-profiler.js:20`이 CPU 단계/외부 pick/GPU/프레임 간격을 따로 기록한다.
- `tools/game-pick-benchmark.js`는 정적 판정 비교와 Memory 샘플 전용 합성 입력 검사를 제공한다. 실제 파일 처리 명령을 만들거나 호출하지 않는다. 시점 합성 직전에 빈손·모드·장면 생존 여부를 다시 검사한다.
- Board3D·KuwaharaEffect는 이번 작업 전 백업과 SHA256이 동일하다. 입력 감도·이동 속도·품질 예산·자동 품질 기준·파일 처리·랜딩 코드/스타일/자산은 이번에 바꾸지 않았다.

새 판정 최적화 자체의 시각적 손해는 없다. 기존 low는 질감/외곽선을 생략하고 픽셀·그림자 예산을 줄이며, 그 기존 타협은 유지한다.

## 로컬 측정

Codex 인앱 브라우저, 1280×720 CSS viewport, 샘플 45개(바닥 24 + 대기 21), seed=123, delay=0. UA는 Windows/Chrome 154를 보고했지만 일반 Chrome/Edge나 학교 PC 검증을 대신하지 않는다. 서버 5174의 scene-kit.js와 새 타임라인 HTTP 응답 SHA256이 D 원본과 일치했다.

각 행은 최종 계측 버전의 10초 유휴 장면 1회다. 추가 초기 반복값도 raw JSON으로 남겼다. CPU는 JS/WebGL 제출 시간이며 GPU 완료 시간이 아니다. GPU는 EXT_disjoint_timer_query_webgl2의 비차단 결과다. CPU·GPU는 겹치므로 더하지 않는다. 프레임 간격에는 화면 주기와 스케줄링이 포함된다.

| KST 종료 | 설정 | 표본 | buffer | 프레임 평균 / p95 ms | WebGL CPU 평균 ms | WebGL GPU 평균 / p95 ms | 렌더 제출 / draw calls |
| --- | --- | ---: | --- | --- | ---: | --- | --- |
| 19:59:24 | high · 질감 약/외곽선 1 | 1200 | 1600×900 | 8.342 / 8.800 | 2.969 | 5.267 / 6.426 | 8 / 811 |
| 20:03:07 | 기존 low | 1199 | 1280×720 | 8.342 / 8.800 | 2.330 | 4.462 / 5.854 | 2 / 551 |
| 20:03:34 | high · 질감 off/외곽선 0 | 1199 | 1600×900 | 8.342 / 8.500 | 2.368 | 4.290 / 5.794 | 2 / 551 |

세 실행 모두 숨김/잘못된 간격/250ms 초과 제외 0개, GPU disjoint 없음, pending 0개였다. high의 camera CPU는 평균 0.014ms, board는 0.041ms, CSS2D labels는 0.081ms였다. 잠금 없이 유휴 상태였으므로 프레임 안 pick=0은 정상 포인터락 판정 비용의 측정값이 아니다.

후처리를 끄면 이 환경의 렌더 제출과 GPU 작업이 줄었지만 RAF는 모두 약 8.34ms(약 120회/초)였다. **FPS 향상을 관찰하지 않았다.** low와 high-off의 작은 GPU 차이에는 실행 변동도 있어 우열로 해석하지 않는다. 학교 PC 병목을 이 수치로 확정하거나 예산을 추가로 낮추지 않았다.

## 조준 판정 비교

같은 실제 장면에서 화면 위치 200개를 사용했다. 결과 ID/거리 비교 후, 기존 전체 갱신과 대상 한정 갱신을 6회 번갈아 실행했다. 정적 장면의 warmed CPU 비교이며 게임 FPS나 물리 입력 지연이 아니다.

| 검사 | scene 오브젝트 / targets | 실제 hit rays / 불일치 | 기존 평균 ms/판정 | 대상 한정 평균 ms/판정 |
| --- | --- | --- | ---: | ---: |
| 적용 전 후보 비교, 19:54:47 | 401 / 29 | 88 / 0 | 0.03767 | 0.01083 |
| 이동·회전 후 재비교, 20:02:56 | 401 / 28 | 69 / 0 | 0.03475 | 0.01025 |

후자의 국소 CPU 차이는 약 70.5%다. 절대 차이는 약 0.025ms/판정이며 전체 게임이 70% 빨라졌다는 뜻이 아니다. 정적 비교에서는 기존 경로가 먼저 행렬을 갱신하므로, 새 행렬의 정확성은 별도 테스트와 이동 후 게임 집기 검증으로 확인했다.

## 입력·게임 흐름에서 관찰한 결과

- 인앱 브라우저의 포인터락 요청은 거부되어 재시도/빈손 우클릭 대체 UI가 표시됐다. 연결 가능한 브라우저 목록에 일반 Chrome/Edge는 없었다.
- 실제 자동화의 짧은 W/A/S/D 키 입력은 camera travel=0이었다. 이것을 이동 성공으로 보고하지 않는다.
- 별도 합성 KeyboardEvent를 기존 게임 핸들러에 200ms씩 유지했다. W: z=4.700→3.263, A: x=0→-1.448, S: z=3.245→4.630, D: x=-1.463→-0.021. 마지막 forward/strafe=0, sprint=false를 확인했다.
- 합성 우클릭 PointerEvent 검사에서는 yaw=0→-0.1745rad, pitch=-0.3316→-0.2618rad였다. 하드웨어 마우스·실제 포인터락 검증이 아니다.
- 커서의 실제 드래그로 5장을 훑어 선택→과제 상자 실제 클릭→진행 5/45, 선택 0을 확인했다. Ctrl+Z로 진행 0/45와 바닥 24개 복귀도 관찰했다.
- 합성 이동·회전 뒤 실제 커서로 파일 1개를 집어 상자에 넣었다. 10초 기록의 placed=0→1, selection=0, 외부 pick 4회(평균 0.200ms, 최대 0.300ms). n=4와 0.1ms 수준 타이머 분해능이라 대표 지연값으로 해석하지 않는다.
- `profile` 없는 기본 auto 게임에서도 5장 집기→상자 넣기, 계측 UI 없음, 진행 5/45를 다시 확인했다.
- 합성 검사 진행 중 Ctrl+A로 24개를 선택하자 시점 검사를 중단했고 선택 24/진행 0을 유지했다. 검사 도구가 선택을 내려놓는 경로는 차단했다.
- 브라우저 error 로그 0. 기존 THREE.Clock deprecation 경고는 남아 있다.

## 실행한 코드 검증

- 최종 D `npm test`: **274/274 통과**, 실패·skip·cancel 0. [전체 로그](../output/game-performance-20261006/npm-test.txt).
- 새 helper 테스트 5개: 렌더 전 부모 이동/회전/스케일·scene 변환, 카메라/부모와 inverse, Group 자손, manual matrix, 비대상 장식 갱신 제외. 실제 bundled Three에서 검사했다.
- profiler 테스트 7개: 평균/p95, 중첩 pick, 렌더 제출 합산, 제외 간격, GPU availability/disjoint, 종료 시점, 외부 이벤트 분리.
- 변경 JS 문법 검사 통과. 원본은 `_archive/game-performance-20261006-1954/`에 백업했다. C 원래 프로젝트 루트와 D 내부 Cozium 복제본은 수정하지 않았다.

조사 중 제한도 남긴다: 프로세스 목록 조회는 `액세스가 거부되었습니다`로 실패하여 HTTP 해시 확인으로 대체했다. 하위 에이전트의 최초 일반 node --test는 `spawn EPERM`으로 실패했고 --test-isolation=none 및 root의 승인된 전체 runner로 재검증했다. 첫 편집은 `start anchor missing`으로 쓰기 전에 중단한 뒤 줄바꿈을 맞춰 적용했다. 패널 버튼에 setChecked는 실패하여 실제 button click으로 수정했다.

## 학교 PC에서 같은 측정을 하는 방법

1. 최신 루트에서 `node tools/serve.mjs 5174` 실행. 이미 같은 루트의 서버가 있으면 재사용한다.
2. `app.html?entry=sample&storage=memory&seed=123&delay=0&quality=high&profile=1`을 Chrome/Edge에서 열고 장면 로딩 뒤 2초 정도 기다린다.
3. ‘10초 측정’을 누르고 직접 WASD·마우스 회전·파일 훑기·상자 넣기를 한다. 종료 뒤 ‘JSON 저장’. 같은 화면 크기/배치로 auto/low 및 high 질감 off/외곽선 0을 각각 반복한다.
4. auto에서는 시작/끝 품질과 각 표본의 quality가 바뀔 수 있으므로 전환된 구간을 구분한다. 기본 Memory의 의도적인 이동 대기는 delay=0 실행과 별도로 경험을 확인한다.
5. GPU status가 unsupported/disjoint이면 GPU ms는 미검증이다. DevTools Performance의 CPU/긴 프레임 기록과 함께 비교한다. 실제 input-to-photon은 이 도구가 측정하지 않는다.

학교 PC FPS·일반 Chrome/Edge 포인터락·물리 WASD 유지/마우스 응답·input-to-photon은 남아 있다. 실제 바탕화면 파일 이동 검사는 하지 않았다. 다음 최적화는 해당 환경에서 GPU/렌더 제출/판정·hover 갱신 중 무엇이 긴 프레임을 만드는지 확인한 뒤 결정한다.

## 원본 측정 산출물

[폴더](../output/game-performance-20261006/)에는 최종/초기 high·low·high-off JSON, 판정 비교 전/후 JSON, 실패한 WASD tap 검사, 합성 입력, 이동 후 집기, 입력 guard 검사, 테스트 로그와 화면을 보관했다. output은 .gitignore 대상이므로 PR/다른 컴퓨터 인수인계에는 별도 복사가 필요하다.

![계측을 끈 Memory 게임에서 5개 넣기 검증](../output/game-performance-20261006/game-final.png)