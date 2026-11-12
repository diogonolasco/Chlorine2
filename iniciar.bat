@echo off
setlocal EnableExtensions
title Chlorine Music
cd /d "%~dp0"
chcp 65001 >nul
color 0D

where node >nul 2>nul
if errorlevel 1 (
  color 0C
  echo.
  echo   [ERRO] Node.js nao encontrado neste computador!
  echo   Instale o Node.js v24+ em https://nodejs.org/ e tente novamente.
  echo.
  pause
  exit /b 1
)

cls
node -e "const b='\x1b[1;95m',v='\x1b[35m',g='\x1b[1;93m',w='\x1b[1;97m',d='\x1b[90m',r='\x1b[0m';console.log('');console.log(b+'   \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557\u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557'+r);console.log(b+'  \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d'+r);console.log(v+'  \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  '+r);console.log(v+'  \u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551\u255a\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255d  '+r);console.log(b+'  \u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551 \u255a\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557'+r);console.log(b+'   \u255a\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d'+r);console.log(w+'                      \u266a  '+g+'M U S I C   B O T'+w+'  \u266a'+r);console.log('');console.log(b+'  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'+r);console.log(d+'   \u26a1 Conectando ao Discord e iniciando Chlorine Music...'+r);console.log('');"

if not exist "node_modules\" (
  node -e "console.log('\x1b[1;95m  Instalando dependencias iniciais...\x1b[0m')"
  call npm install --no-audit --no-fund --silent
  if errorlevel 1 (
    color 0C
    echo.
    echo   [ERRO] Falha ao instalar dependencias via npm.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  color 0C
  echo   [ERRO] Arquivo .env nao encontrado!
  echo   Copie .env.example para .env e configure seu DISCORD_TOKEN.
  echo.
  pause
  exit /b 1
)

node --no-warnings index.js
set "EXIT_CODE=%errorlevel%"

echo.
if not "%EXIT_CODE%"=="0" (
  node -e "console.log('\x1b[1;91m  \u2716 Bot encerrado com erro (codigo ' + process.argv[1] + '). Verifique os logs acima.\x1b[0m')" %EXIT_CODE%
) else (
  node -e "console.log('\x1b[1;95m  \u25a0 Chlorine Music encerrado.\x1b[0m')"
)
echo   Pressione qualquer tecla para fechar...
pause >nul
exit /b %EXIT_CODE%
