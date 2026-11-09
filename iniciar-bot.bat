@echo off
chcp 65001 >nul
title Chlorine Music™ • Console do Bot
color 0B
mode con: cols=80 lines=32
cd /d "%~dp0"
cls

echo ==============================================================================
echo                INICIALIZANDO CHLORINE MUSIC™ - DISCORD BOT
echo ==============================================================================
echo.
echo   [+] Carregando componentes do bot...
echo   [+] Conectando à API do Discord...
echo.

node index.js

if %errorlevel% neq 0 (
    echo.
    echo ==============================================================================
    echo   [!] O bot foi encerrado ou ocorreu algum erro inesperado.
    echo ==============================================================================
)
pause
