# Cozium 방 파츠

모든 방 파츠는 1672×941 캔버스와 왼쪽 위 원점을 공유합니다. 투명 여백을 자르거나 각 파츠를 중앙 정렬하지 않습니다.

| 파일 | 역할 |
| --- | --- |
| room-background.png | 벽·바닥·창·책상 등을 포함한 불투명 배경 |
| foreground-left.png | 가까운 식물·수납장·책의 투명 전경 |
| foreground-files-right.png | 오른쪽 사진·문서·파일 더미의 투명 전경 |
| foreground-door-right.png | 오른쪽 문틀과 손잡이의 투명 전경 |
| closed-box-room-v3.png | 방의 시점에 맞춘 닫힌 상자 스프라이트 |

`manifest.json`은 합성 순서, 깊이, 접지 좌표를 기록합니다. 상자 그림자는 [room-box.js](../../../../js/landing/room-box.js)에서 별도로 그립니다. 실행 화면은 [랜딩](../../../../index.html)입니다.

이미지 생성·편집으로 배경을 복원하고 전경을 투명 추출했습니다. 제작 프롬프트는 `prompts.json`, 현재 상자 프롬프트는 `closed-box-room-v3.prompt.json`, 이미지 규격·알파 기록은 `alpha-report.json`에 있습니다. 원화·이전 상자 시안·검수 캡처는 로컬 `_archive/`에 보존했습니다.
