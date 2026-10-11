# 문서 안내

현재 진입 화면은 루트의 [Cozium 랜딩](../index.html)과 [파일 정리 앱](../app.html)이고, 사용자용 [이용 안내](../help.html)(파일과 개인정보 포함)가 있습니다. 이전 그림 랜딩(`landing-classic.html`)은 2026-10-11 3D 다락방 랜딩으로 바뀐 뒤 저장소에서 뺐습니다(D의 `_archive/claude-cleanup-20261011/`).

| 문서 | 내용 |
| --- | --- |
| [프로젝트 README](../README.md) | 소개, 실행, 파일 처리 모드, 조작, 테스트, GitHub Pages 배포 |
| [디자인 이야기](design.md) | 방과 상자 메타포, 현재 랜딩 흐름, 파일 가져오기 UI의 후속 방향 |
| [디자인 시스템](design-system.md) | 현재 토큰·구도·모션·자산, 사용자 확인과 재설계 대기 구분 |
| [랜딩 재설계 방향](landing-redesign.md) | 이전 랜딩 실측·진단, 방향 제안, **2026-10-07 결정(애니메틱 안으로 교체)** |
| [랜딩 애니메틱](prototypes/landing-animatic.html) · [수납장·상자 모델 사양](prototypes/cabinet-model-spec.md) | 현재 랜딩의 검토용 사본(장면 막대) · Blender glb 교체 규격 |
| [소개 영상](../tools/intro-video/README.md) | 30초 발표용 영상(1920×1080)의 장면표·합성 효과음·다시 렌더하는 법. 결과 MP4는 `output/intro-video/`(git 제외) |
| [에이전트 타임라인](agent-timeline.md) | GPT/Claude 담당 범위, KST 시작·종료 시각, 실제 검증과 인수인계 |
| [성능 기준](performance.md) | 입력 반응, 품질 단계, 자산·로딩 예산과 학교 PC 검증 절차 |
| [개발 이력](development-history.md) | 이전 README에 있던 구현 과정과 당시 검증 기록 |
| [Desktop Helper](../helper/README.md) | 로컬 실행, 연결 옵션, API, 파일 작업 범위와 테스트 |
| [3D 모델 규격](../models/README.md) | 정리 앱의 모델 교체 지점과 fallback |
| [방 파츠](../assets/landing/parts/room-v3/README.md) | 방 배경과 투명 전경의 구성·제작 기록 |
| [샘플 바탕화면 파츠](../assets/landing/parts/desktop-v2/README.md) | 아이콘과 manifest의 규격·생성 방식 |

## 화면 자료

- [랜딩 마지막 화면](screenshots/landing.png): 구현된 페이지의 실제 화면.
- [파일 가져오기 화면 시안](design/onboarding-concept.png): 생성한 디자인 참고 이미지. 현재 앱에 구현되지 않았습니다.

개발 이력의 날짜별 테스트 수와 검수 결과는 당시 상태를 기록합니다. 현재 실행 대상과 최신 검증 결과는 루트 README를 기준으로 확인하세요. 이전 시안·캡처·백업은 로컬 `_archive/`에 보관하며 GitHub 업로드 대상에서 제외합니다.
