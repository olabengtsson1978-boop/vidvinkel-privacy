@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo PHP-kollen behöver programmet Node.js för att fungera.
  echo Webbsidan där du kan ladda ner det öppnas nu. Välj "LTS", installera,
  echo och dubbelklicka sedan på den här filen igen.
  echo.
  start "" https://nodejs.org/
  pause
  exit /b
)
start "" http://localhost:3000
node server.js
pause
