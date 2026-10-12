@echo off
rem Cozium: make the GitHub clone on C match this folder (see tools\sync-to-c.ps1). Double-click to run.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-to-c.ps1" %*
pause
