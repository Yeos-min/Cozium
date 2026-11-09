# Cozium 정리 (Claude, 2026-11-08) — 사이트가 더 이상 쓰지 않는 파일을 _archive\claude-cleanup-20261108\ 로 옮긴다.
# 지우지 않는다. _archive\는 git에 안 올라간다. 잘못 옮겼으면 그 폴더에서 같은 자리로 되돌리면 된다.
#
#   tools\cleanup.bat 더블클릭                                              (옮기기)
#   powershell -ExecutionPolicy Bypass -File tools\archive-unused.ps1 -DryRun   (목록만 보기)
#
# 무엇을 옮기나 — 사이트 페이지(index·app·help)를 실제로 다 돌려 보고 한 번도 안 불리는 것만(docs/agent-timeline.md 11-08):
#   - 옛 그림 랜딩(10-07): landing-classic.html, js\landing\, css\landing.css, 그 테스트, 상자·덩굴·만화 그림 원본
#   - 쓰다 바뀐 그림: desktop-v2·v3 아이콘, room-v3 방 그림, 세이지 폴더 아이콘, 방 안 옛 바닥
#   - 폐기한 기능 코드: 폭죽(confetti), 상자 버튼(cta-box), ?lab 렌더 테스트 패널과 그 포스터, 옛 방 가구·선반 틀, 옛 침대 모델
#   - 그 시절 도구·시안: attic-blockout, attic-icons, intro-video, 시안 페이지(docs\prototypes) 등
# 10-11 정리 목록(같은 이름의 옛 스크립트)은 이 목록에 다 들어 있다.
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$dest = Join-Path $Root "_archive\claude-cleanup-20261108"

# 폴더째 옮기는 것
$dirs = @(
  "js\landing",
  "assets\landing\box",
  "assets\landing\parts\desktop-v2",
  "assets\landing\parts\desktop-v3",
  "assets\landing\parts\room-v3",
  "tools\attic-blockout",
  "tools\attic-icons",
  "tools\intro-video",
  "docs\prototypes"
)
# 파일 하나씩
$files = @(
  "assets\landing\fonts",
  "assets\landing\parts\Box_down-v2.png",
  "assets\landing\parts\Box_down.png",
  "assets\landing\parts\Box_left-v1.png",
  "assets\landing\parts\Box_right-v1.png",
  "assets\landing\parts\Box_up-v2.png",
  "assets\landing\parts\Box_up.png",
  "assets\landing\parts\Comic_leaves-v1.png",
  "assets\landing\parts\Comic_leaves-v2.png",
  "assets\landing\parts\Comic_room-v1.png",
  "assets\landing\parts\Comic_tidy-v1.png",
  "assets\landing\parts\Tape.png",
  "assets\landing\parts\Vine_left-v1.png",
  "assets\landing\parts\Vine_right-v1.png",
  "assets\landing\parts\box-inner-v1-prompts.txt",
  "assets\landing\parts\box-v2-prompts.txt",
  "assets\landing\parts\comic-v1-prompts.json",
  "assets\landing\parts\desktop-v4\icons\folder-sage.webp",
  "assets\landing\parts\vine-v1-prompts.txt",
  "assets\landing\room-3d\inside-floor.webp",
  "assets\landing\room-3d\poster-A.webp",
  "assets\landing\room-3d\poster-B.webp",
  "assets\landing\room-3d\poster-C.webp",
  "css\landing.css",
  "docs\design\landing-audit-20261006-1.jpg",
  "docs\design\landing-audit-20261006.jpg",
  "docs\screenshots\landing.png",
  "js\landing-story\cta-box.js",
  "js\landing-story\godrays.js",
  "js\landing-story\render-lab.js",
  "js\three\cozy-room.js",
  "js\three\shelf-frame.js",
  "js\ui\confetti.js",
  "js\ui\onboarding-room.js",
  "landing-classic.html",
  "models\Bed.glb",
  "tests\landing\canvas-resolution.test.mjs",
  "tests\landing\desktop-box-state.test.mjs",
  "tests\landing\desktop-controller.test.mjs",
  "tests\landing\desktop-interaction.test.mjs",
  "tests\landing\desktop-physics.test.mjs",
  "tests\landing\desktop-transition.test.mjs",
  "tests\landing\flap-geometry.test.mjs",
  "tests\landing\performance-lifecycle.test.mjs",
  "tests\landing\return-scene.test.mjs",
  "tests\landing\scene-transition.test.mjs",
  "tests\landing\tape-geometry.test.mjs",
  "tests\landing\tape-input.test.mjs",
  "tests\shelf-frame.test.js",
  "tools\bed-preview.html",
  "tools\landing-assets-report.json",
  "tools\make-clean-desktop.mjs",
  "tools\optimize-landing-assets.py",
  "tools\watercolor-study.md",
  # 11-10: README 옛 스크린샷(밤 랜딩은 11-03에 아침 다락방으로 바뀜 → landing-morning.webp)
  "docs\screenshots\landing-night.webp"
)
# 같은 폴더의 원본 그림·프롬프트(사이트는 webp만 씀)
$patterns = @("assets\landing\parts\*.png", "assets\landing\parts\*.txt", "assets\landing\parts\*.json")
$paths = @() + $dirs + $files
foreach ($pattern in $patterns) {
  Get-ChildItem -Path (Join-Path $Root $pattern) -File -ErrorAction SilentlyContinue | ForEach-Object {
    $paths += $_.FullName.Substring($Root.TrimEnd('\').Length + 1)
  }
}

$moved = 0
foreach ($relative in ($paths | Select-Object -Unique)) {
  $source = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $source)) { continue }
  $target = Join-Path $dest $relative
  if ($DryRun) { Write-Host "would move  $relative"; $moved++; continue }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  if (Test-Path -LiteralPath $target) { $target = "$target.$(Get-Date -Format yyyyMMddHHmmss)" } # 먼저 옮긴 것을 덮어쓰지 않는다
  Move-Item -LiteralPath $source -Destination $target
  Write-Host "moved  $relative"
  $moved++
}
Write-Host ""
if ($DryRun) { Write-Host "$moved item(s) would move to $dest" } else { Write-Host "$moved item(s) moved to $dest"; Write-Host "이제 tools\sync-to-c.bat 으로 C에 올리면 C(GitHub)에서도 빠집니다." }
