# Cozium: make the GitHub clone (C) match this project folder (D), without what does not belong on GitHub.
# Claude, 2026-10-13. Replaces "delete everything in C, paste everything from D".
#
#   double-click tools\sync-to-c.bat          (asks for the C folder the first time, then remembers it)
#   powershell -ExecutionPolicy Bypass -File tools\sync-to-c.ps1 -DryRun    (only list what would change)
#
# What it does: robocopy /MIR from D to C. Files in C that are not in D are removed from C, so deletions reach
# GitHub too. C's .git folder is never touched. Afterwards commit and push in C as usual (git add -A).
# Never copied (and never removed from C if they happen to be there):
#   .git  _archive  Cozium  "Claude outputs"  output  .claude  .codex  .agents  node_modules
#   the files the 10-11 clean-up retired (same list as tools\archive-unused.ps1 and .gitignore)
#   tools\sync-target.txt (where this script remembers the C folder)
# Nothing is ever deleted in D.
param(
  [string]$Target = "",
  [switch]$DryRun,
  [switch]$Yes
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path.TrimEnd('\')
$Saved = Join-Path $PSScriptRoot "sync-target.txt"

if (-not $Target -and (Test-Path -LiteralPath $Saved)) { $Target = (Get-Content -LiteralPath $Saved -Raw).Trim() }
if (-not $Target -and (Test-Path -LiteralPath "C:\dev\Desktop Clean UP\.git")) { $Target = "C:\dev\Desktop Clean UP" } # the clone AGENTS.md names
if (-not $Target) { $Target = (Read-Host "GitHub clone folder on C (the one with the .git folder)").Trim('"', ' ') }
if (-not $Target) { Write-Host "No folder given. Nothing done."; exit 1 }
$Target = $Target.TrimEnd('\')

# safety: a real git clone, not this folder, not a drive root
if (-not (Test-Path -LiteralPath (Join-Path $Target ".git"))) { Write-Host "Not a git clone (no .git inside): $Target"; exit 1 }
$full = (Resolve-Path -LiteralPath $Target).Path.TrimEnd('\')
if ($full -ieq $Root) { Write-Host "Target is this folder itself. Nothing done."; exit 1 }
if ($full -match '^[A-Za-z]:$') { Write-Host "Target is a whole drive. Nothing done."; exit 1 }
Set-Content -LiteralPath $Saved -Value $full -Encoding ASCII

# folders skipped by name anywhere
$skipNames = @(".git", "node_modules")
# folders skipped at these exact places (relative to the project root)
$skipDirs = @(
  "_archive", "Cozium", "Claude outputs", "output", ".claude", ".codex", ".agents",
  "js\landing", "assets\landing\box", "assets\landing\parts\desktop-v3",
  "tools\attic-icons", "tools\attic-blockout", "tools\intro-video", "docs\prototypes",
  "assets\landing\parts\desktop-v2", "assets\landing\parts\room-v3"  # 10-18: the old import screen's art (the import screen is now the laptop desktop)
)
# files skipped at these exact places
$skipFiles = @(
  "tools\sync-target.txt", "js\ui\onboarding-room.js",
  "landing-classic.html", "css\landing.css", "js\landing-story\godrays.js",
  "js\three\cozy-room.js", "js\three\shelf-frame.js", "tests\shelf-frame.test.js",
  "models\Bed.glb", "tools\bed-preview.html", "tools\optimize-landing-assets.py", "tools\landing-assets-report.json",
  "docs\screenshots\landing.png",
  "assets\landing\room-3d\inside-floor.webp",
  "assets\landing\parts\desktop-v2\cozium-box.svg", "assets\landing\parts\desktop-v2\cozium-box-front.svg",
  "assets\landing\parts\desktop-v2\validation-report.json",
  "assets\landing\parts\room-v3\prompts.json", "assets\landing\parts\room-v3\alpha-report.json"
)
# files skipped by pattern in one folder (the old landing's tests, PNG originals, prompts)
$skipPatterns = @(
  @("tests\landing", "*.test.mjs", "preload.test.mjs"),
  @("assets\landing\parts", "*.png", ""), @("assets\landing\parts", "*.txt", ""), @("assets\landing\parts", "*.json", ""),
  @("assets\landing\parts\room-v3", "*.png", ""), @("assets\landing\parts\room-v3", "closed-box-room-v3.*", ""),
  @("docs\design", "landing-audit-*.jpg", "")
)

$xd = @() + $skipNames
foreach ($d in $skipDirs) { $xd += (Join-Path $Root $d); $xd += (Join-Path $full $d) }
$xf = @("*.exe")  # 10-20: CoziumHelper.exe goes to GitHub Releases, not into C / the repository
foreach ($f in $skipFiles) { $xf += (Join-Path $Root $f); $xf += (Join-Path $full $f) }
foreach ($p in $skipPatterns) {
  foreach ($base in @($Root, $full)) {
    $dir = Join-Path $base $p[0]
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    Get-ChildItem -LiteralPath $dir -File -Filter $p[1] | Where-Object { $_.Name -ne $p[2] } | ForEach-Object { $xf += $_.FullName }
  }
}

Write-Host ""
Write-Host "From : $Root"
Write-Host "To   : $full"
if ($DryRun) { Write-Host "Mode : dry run (nothing changes)" } else { Write-Host "Mode : copy, and remove from C what is no longer in D (C\.git is kept)" }
if (-not $DryRun -and -not $Yes) {
  $ok = Read-Host "Go? (y/n)"
  if ($ok -notmatch '^[yY]') { Write-Host "Nothing done."; exit 0 }
}

$rc = @($Root, $full, "/MIR", "/R:1", "/W:1", "/NP", "/NDL", "/NJH", "/FFT", "/XD") + $xd + @("/XF") + $xf
if ($DryRun) { $rc += "/L" }
& robocopy @rc
$code = $LASTEXITCODE
if ($code -ge 8) { Write-Host "robocopy failed (code $code). Check the lines above."; exit $code }

Write-Host ""
if (Get-Command git -ErrorAction SilentlyContinue) {
  Write-Host "git status in C (first 40 lines):"
  git -C $full status --short | Select-Object -First 40
}
if ($DryRun) { Write-Host "Dry run done. Run without -DryRun to copy." } else { Write-Host "Done. Now commit and push in C (git add -A)." }
exit 0
