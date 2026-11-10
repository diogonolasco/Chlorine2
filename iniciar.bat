@echo off
title Chlorine Music™
cd /d "%~dp0"
chcp 65001 >nul
node index.js
pause
