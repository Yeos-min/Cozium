# Cozium clean-up (Claude, 2026-10-11)
# Moves everything the site no longer uses into _archive\claude-cleanup-20261011\ (same relative paths).
# Nothing is deleted; _archive\ is git-ignored. Run it once in the project root you want to upload:
#
#   powershell -ExecutionPolicy Bypass -File tools\archive-unused.ps1            # move
#   powershell -ExecutionPolicy Bypass -File tools\archive-unused.ps1 -DryRun    # only list
#
# What goes (see docs/agent-timeline.md, 2026-10-11 clean-up entry):
#   - the old painted landing (landing-classic.html, js/landing/, css/landing.css, its tests)
#   - its pictures (assets/landing/box/, PNG originals and prompt files, desktop-v3 icons that were rolled back)
#   - the procedural room furniture and shelf frames the attic model replaced (cozy-room.js, shelf-frame.js, Bed.glb)
#   - prototypes the real pages now cover (docs/prototypes/, attic blockout, intro-video generator)
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$dest = Join-Path $Root "_archive\claude-cleanup-20261011"

$paths = @(
  "landing-classic.html",
  "css\landing.css",
  "js\landing",
  "js\landing-story\godrays.js",
  "js\three\cozy-room.js",
  "js\three\shelf-frame.js",
  "tests\shelf-frame.test.js",
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
  "assets\landing\box",
  "assets\landing\parts\desktop-v3",
  "assets\landing\parts\desktop-v2\cozium-box.svg",
  "assets\landing\parts\desktop-v2\cozium-box-front.svg",
  "assets\landing\parts\desktop-v2\validation-report.json",
  "assets\landing\parts\room-v3\closed-box-room-v3.png",
  "assets\landing\parts\room-v3\closed-box-room-v3.webp",
  "assets\landing\parts\room-v3\closed-box-room-v3.prompt.json",
  "assets\landing\parts\room-v3\prompts.json",
  "assets\landing\parts\room-v3\alpha-report.json",
  "models\Bed.glb",
  "tools\bed-preview.html",
  "tools\attic-icons",
  "tools\attic-blockout",
  "tools\intro-video",
  "tools\optimize-landing-assets.py",
  "tools\landing-assets-report.json",
  "docs\prototypes",
  "docs\screenshots\landing.png",
  "docs\design\landing-audit-20261006.jpg",
  "docs\design\landing-audit-20261006-1.jpg"
)
# loose files by pattern: PNG originals next to the WebP the pages use, image-generation prompts
$patterns = @(
  "assets\landing\parts\*.png",
  "assets\landing\parts\*.txt",
  "assets\landing\parts\*.json",
  "assets\landing\parts\room-v3\*.png"
)
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
  if (Test-Path -LiteralPath $target) { $target = "$target.$(Get-Date -Format yyyyMMddHHmmss)" } # never overwrite an earlier copy
  Move-Item -LiteralPath $source -Destination $target
  Write-Host "moved  $relative"
  $moved++
}
if ($DryRun) { Write-Host "$moved item(s) would move to $dest" } else { Write-Host "$moved item(s) moved to $dest" }
