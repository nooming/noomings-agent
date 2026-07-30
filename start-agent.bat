@echo off
setlocal
cd /d "%~dp0"

set PORT=3001

echo.
echo ===== Agent =====
echo Dir: %CD%
echo Port: %PORT%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: node not found. Install Node.js 18+
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Running npm install...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
  )
)

echo [1/3] Stopping old process on port %PORT%...
call npm run agent:stop

echo [2/3] Starting server in new window...
start "Agent Server" cmd /k npm start

echo [3/3] Opening browser...
timeout /t 3 /nobreak >nul
start "" "http://localhost:%PORT%/"

echo.
echo Platform: http://localhost:%PORT%/
echo Teacher:  http://localhost:%PORT%/teacher.html
echo Close the "Agent Server" window to stop.
echo.
pause
