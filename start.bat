@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title AOI LAB - Combined Launcher

set "APP_PORT=5173"
set "APP_URL_BASE=/aoi-lab-combined/"
set "PORT_SCAN_MAX=5199"

echo ============================================================
echo    AOI LAB - Combined  Team Toolbox
echo ============================================================
echo    Integrated: 04 Repeatability / 05 Correlation (Coming Soon)
echo    Launcher: v2026.08.14-r2
echo.

rem ==================== 1. Check Node.js ====================
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Please install Node.js 22 or newer, then double-click this script again.
    echo         Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
echo [OK] Node.js %NODE_VERSION%

rem ==================== 2. Check npm ====================
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found. npm is installed together with Node.js.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('npm --version') do set "NPM_VERSION=%%v"
echo [OK] npm v%NPM_VERSION%
echo.

rem ==================== 3. Check dependencies ====================
if not exist "%~dp0node_modules\" (
    echo [DEPS] node_modules not found. Installing dependencies. First run may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Please check your network and retry.
        echo.
        pause
        exit /b 1
    )
) else (
    rem npm ls returns non-zero if a dependency is missing or mismatched
    call npm ls --depth=0 >nul 2>nul
    if errorlevel 1 (
        echo [DEPS] Missing or mismatched dependencies detected, reinstalling...
        call npm install
        if errorlevel 1 (
            echo.
            echo [ERROR] Dependency repair failed. Please check your network and retry.
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo [OK] Dependencies are complete.
    )
)
echo.

rem ==================== 4. Check port ====================
call :is_port_listening %APP_PORT%
if "%PORT_BUSY%"=="1" (
    echo [WARN] Port %APP_PORT% is in use.
    echo        To avoid opening an older AOI LAB instance, this launcher will NOT reuse it.
    echo        Looking for a free port for this extracted project...
    call :find_free_port %APP_PORT% %PORT_SCAN_MAX%
    if "!FOUND_PORT!"=="" (
        echo [ERROR] All ports from %APP_PORT% to %PORT_SCAN_MAX% are in use. Cannot start.
        echo         Please close the programs occupying these ports and retry.
        echo.
        pause
        exit /b 1
    )
    set "APP_PORT=!FOUND_PORT!"
    echo [OK] Switched to free port !APP_PORT!
) else (
    echo [OK] Port %APP_PORT% is free.
)
echo.

rem ==================== 5. Start server ====================
echo Starting dev server on port %APP_PORT%, please wait...
echo.
start /b "" cmd /c "npm run dev -- --host --port %APP_PORT% --strictPort"

rem Poll until the server responds (max 30 s)
set /a "TRIES=0"
:wait_ready
set /a "TRIES+=1"
if %TRIES% gtr 30 goto :wait_timeout
curl -s --max-time 2 -o nul "http://localhost:%APP_PORT%%APP_URL_BASE%" >nul 2>nul
if errorlevel 1 (
    ping -n 2 127.0.0.1 >nul
    goto :wait_ready
)
echo [OK] Server is ready. Opening browser...
start "" "http://localhost:%APP_PORT%%APP_URL_BASE%"
echo      URL: http://localhost:%APP_PORT%%APP_URL_BASE%
echo.
goto :keep_alive

:wait_timeout
echo.
echo [WARN] Timed out waiting for the server. If you see a red error above, please close
echo        this window, fix the problem and retry. Opening the browser anyway...
start "" "http://localhost:%APP_PORT%%APP_URL_BASE%"
echo      URL: http://localhost:%APP_PORT%%APP_URL_BASE%
echo.

echo ------------------------------------------------------------
echo  Server is running. Close this window to stop the server.
echo ------------------------------------------------------------
:keep_alive
ping -n 6 127.0.0.1 >nul
call :is_port_listening %APP_PORT%
if "%PORT_BUSY%"=="0" (
    echo.
    echo [INFO] Server has stopped. This window will close automatically...
    ping -n 4 127.0.0.1 >nul
    exit /b 0
)
goto :keep_alive

rem ==================== Subroutines ====================
rem is_port_listening <port> -> sets PORT_BUSY to 0 or 1
:is_port_listening
set "PORT_BUSY=0"
for /f "usebackq" %%p in (`powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %~1 -State Listen -ErrorAction SilentlyContinue) { '1' } else { '0' }"`) do set "PORT_BUSY=%%p"
exit /b

rem find_free_port <start> <end> -> sets FOUND_PORT, empty if none free
:find_free_port
set "FOUND_PORT="
for /f "usebackq" %%p in (`powershell -NoProfile -Command "$p=%~1; $end=%~2; while($p -le $end){ if(-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)){ $p; break }; $p++ }"`) do set "FOUND_PORT=%%p"
exit /b
