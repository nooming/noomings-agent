@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在本目录启动本地预览（http://localhost:5500）...
echo 浏览器打开后可从 index.html 进入试玩与图谱。
echo 按 Ctrl+C 可结束服务。
echo.
npx --yes serve -l 5500 .
pause
