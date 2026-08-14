@echo off
cd /d "%~dp0"

rem Offline single-file launcher: no Node.js, no server, no network required.
rem Works on any Windows PC - just double-click this file (or offline\index.html).

if not exist "%~dp0offline\index.html" (
    echo [ERROR] offline\index.html not found.
    echo         Build it on the dev machine first with:
    echo             npm run build:offline
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo   AOI LAB - Combined  Offline Version
echo ============================================================
echo   Opening in your browser... Close the browser when done.
echo.
start "" "%~dp0offline\index.html"
