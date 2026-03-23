@echo off
cd /d "%~dp0"
start "SilentCyber Server" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:3000
