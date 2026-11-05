@echo off
rem ---------------------------------------------------------------------------
rem  WildGuard AI launcher
rem    start.bat        development: backend + Vite dashboard (http://localhost:3000)
rem    start.bat prod   build the dashboard once and serve everything from the
rem                     backend (http://localhost:5000)
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python 3 was not found. Install it from https://www.python.org/downloads/
  pause & exit /b 1
)

%PY% -c "import ultralytics, flask, cv2, clip" >nul 2>nul
if errorlevel 1 (
  echo Installing backend requirements...
  %PY% -m pip install -r requirements\backend.txt || pause & exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org/
  pause & exit /b 1
)
if not exist frontend\node_modules (
  echo Installing dashboard dependencies...
  pushd frontend
  call npm install || (popd & pause & exit /b 1)
  popd
)

if /i "%~1"=="prod" goto prod

start "WildGuard backend" cmd /k %PY% backend\server.py
start "WildGuard dashboard" cmd /k "cd frontend && npm run dev"
call :wait_for_backend
start "" http://localhost:3000
goto :eof

:prod
pushd frontend
call npm run build || (popd & pause & exit /b 1)
popd
start "WildGuard backend" cmd /k %PY% backend\server.py
call :wait_for_backend
start "" http://localhost:5000
goto :eof

:wait_for_backend
echo Waiting for the AI engine to load (first start can take ~30 s)...
powershell -NoProfile -Command "for($i=0;$i -lt 180;$i++){try{Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5000/api/health -TimeoutSec 2 | Out-Null; exit 0}catch{Start-Sleep 1}}; exit 1"
if errorlevel 1 echo Backend did not answer yet - check the "WildGuard backend" window.
exit /b 0
