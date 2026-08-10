@echo off
cd /d "%~dp0"

set "NODE_DIR=C:\Users\IPC\.workbuddy\binaries\node\versions\22.22.2"
set "PATH=%NODE_DIR%;%PATH%"

echo ============================================
echo    AOI LAB
echo ============================================
echo.

if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\" (
    echo Installing dependencies...
    call "%NODE_DIR%\npm.cmd" install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo.
)

echo Starting dev server...
echo URL: http://localhost:5173
echo.
start http://localhost:5173
"%NODE_DIR%\node.exe" "%~dp0node_modules\vite\bin\vite.js" --host
pause
