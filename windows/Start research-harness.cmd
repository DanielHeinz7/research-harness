@echo off
title research-harness
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
node "research-harness\bin\research-harness.js" serve --app
if errorlevel 1 pause
exit /b
:nonode
echo research-harness needs Node.js 22 or newer.
echo Install it from https://nodejs.org, then double-click this file again.
pause
