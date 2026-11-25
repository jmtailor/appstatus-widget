@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js가 필요합니다. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요. & pause & exit /b 1)
if not exist node_modules (echo 처음 한 번만 준비합니다. 몇 분 걸립니다... & call npm install)
start "" /b cmd /c "npm start"
