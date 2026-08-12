@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo    AOI LAB - Combined

echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH.
    echo Please install Node.js 22 or newer, then reopen this window.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found in PATH.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

echo Starting dev server...
echo URL: http://localhost:5173/aoi-lab-combined/
echo.
start "" http://localhost:5173/aoi-lab-combined/
call npm run dev -- --host
pause
