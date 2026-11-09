@echo off
rem Cozium clean-up (11-08): moves files the site no longer uses into _archive\claude-cleanup-20261108\ (nothing is deleted).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0archive-unused.ps1" %*
pause
