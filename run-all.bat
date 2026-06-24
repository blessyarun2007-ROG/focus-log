@echo off
setlocal

cd /d "%~dp0"

echo Starting Focus Log...
echo.

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install

  if errorlevel 1 (
    echo.
    echo npm install failed. Please check the error above.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo.
  echo Missing .env file.
  echo Create .env and add:
  echo GROQ_API_KEY=your_groq_api_key_here
  echo.
  pause
  exit /b 1
)

echo Starting JSON Server on http://localhost:3000
start "Focus Log JSON Server" cmd /k "cd /d ""%~dp0"" && npm.cmd start"

echo Starting AI backend on http://localhost:3001
start "Focus Log AI Backend" cmd /k "cd /d ""%~dp0"" && npm.cmd run ai"

echo Opening frontend...
start "" "%~dp0index.html"

echo.
echo Everything is starting.
echo JSON Server: http://localhost:3000
echo AI Backend:  http://localhost:3001
echo Frontend:    %~dp0index.html
echo.
pause
