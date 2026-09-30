@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Python was not found.
  echo Install Python 3 from https://www.python.org and make sure
  echo "Add python.exe to PATH" is checked during setup.
  echo.
  pause
  exit /b 1
)

echo Starting Obsidian Local Web...
echo Close this window to stop the server.
echo.
python server.py

if errorlevel 1 (
  echo.
  echo [ERROR] The server stopped with an error. See the message above.
  pause
)
