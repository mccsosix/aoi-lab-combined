@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul || goto :missing_runtime
where npm >nul 2>nul || goto :missing_runtime
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>nul || goto :outdated_runtime

if not exist "node_modules" (
  echo [AOI LAB] 首次启动，正在安装依赖，请保持网络连接...
  call npm install
  if errorlevel 1 goto :install_failed
)

echo [AOI LAB] 正在启动源码开发服务器...
echo [AOI LAB] 浏览器打开后，请保留此窗口；按 Ctrl+C 可停止服务。
call npm run dev:open
if errorlevel 1 goto :start_failed
exit /b 0

:missing_runtime
echo.
echo [AOI LAB] 未找到 Node.js 或 npm。
echo 请先安装 Node.js 22.13 或更高版本，然后重新双击本文件。
pause
exit /b 1

:outdated_runtime
echo.
echo [AOI LAB] Node.js 版本过低。
echo 请升级到 Node.js 22.13 或更高版本，然后重新双击本文件。
pause
exit /b 1

:install_failed
echo.
echo [AOI LAB] 依赖安装失败，请检查网络和 npm 设置后重试。
pause
exit /b 1

:start_failed
echo.
echo [AOI LAB] 开发服务器启动失败，请检查上方错误信息。
pause
exit /b 1
