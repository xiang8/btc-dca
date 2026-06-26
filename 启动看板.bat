@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo Starting PowerShell server (minimized)...
start "" /min powershell -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
exit
