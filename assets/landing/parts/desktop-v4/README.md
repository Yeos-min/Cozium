# desktop-v4 — 노트북 안 바탕화면 (2026-10-13)

사용자가 GPT로 만든 그림을 Claude가 잘라 맞춘 것. 랜딩(`index.html`, `js/landing-story/story.js`)이 쓴다. desktop-v2(SVG)는 이전 판.

| 파일 | 크기 | 쓰는 곳 |
|---|---|---|
| `wallpaper.webp` | 1672 × 941 | 바탕화면 판 전체(`#desk`), 노트북 안 장면 바닥이 되기 전 벽지 |
| `taskbar.webp` | 3268 × 120 (판에서 1634 × 60, 2배) | 작업표시줄. 원본(2110 × 153)이 판 칸보다 두꺼워 양끝 모서리는 그대로, 가운데만 늘리고 앱 칸·트레이를 같은 배율로 다시 얹음 |
| `monitor-frame.svg` | 1672 × 941 | 화면 테두리(14 px). 9-slice(모서리 30 px)로 늘어나므로 변에 장식 없음. 색은 GPT 시안 테두리(#463529)에서 |
| `icons/*.webp` | 256 × 256, 투명 | 바탕화면 아이콘 7종(document·photo·video·audio·archive·folder-sage·folder-sand). 화면에선 68 px(×cover×DPR ≈ 최대 160 px) |
| `faces/*.webp` | 폭 512, 투명 | 바닥 물건(3D 카드) 윗면 5종. 물건 크기 비율(`OBJECT_SIZE`, 방 `FILE_SIZE`)을 이 그림 비율에 맞춤 |

갈아 끼울 때: 파일 이름과 비율을 그대로 두면 코드는 안 바꿔도 된다. 카드 앞면 비율이 바뀌면 `story.js` `OBJECT_SIZE`와 `room-layer.js` `FILE_SIZE`도 같이.
