#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PURPLE='\033[1;35m'
CYAN='\033[1;36m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
GRAY='\033[0;90m'
RESET='\033[0m'

echo ""
echo -e "${PURPLE}   ██████╗██╗  ██╗██╗      ██████╗ ██████╗ ██╗███╗   ██╗███████╗${RESET}"
echo -e "${PURPLE}  ██╔════╝██║  ██║██║     ██╔═══██╗██╔══██╗██║████╗  ██║██╔════╝${RESET}"
echo -e "${PURPLE}  ██║     ███████║██║     ██║   ██║██████╔╝██║██╔██╗ ██║█████╗  ${RESET}"
echo -e "${PURPLE}  ██║     ██╔══██║██║     ██║   ██║██╔══██╗██║██║╚██╗██║██╔══╝  ${RESET}"
echo -e "${PURPLE}  ╚██████╗██║  ██║███████╗╚██████╔╝██║  ██║██║██║ ╚████║███████╗${RESET}"
echo -e "${PURPLE}   ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝${RESET}"
echo -e "${YELLOW}              ♪  M U S I C   B O T   ( L I N U X )  ♪${RESET}"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo -e "  ${RED}[ERRO]${RESET} Node.js não encontrado no PATH! Instale Node.js >= 20."
  exit 1
fi

if [ ! -f ".env" ] && [ -z "${DISCORD_TOKEN:-}" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo -e "  ${YELLOW}[AVISO]${RESET} Arquivo .env criado a partir do .env.example!"
    echo -e "  ${GRAY}Preencha o DISCORD_TOKEN no .env ou exporte a variável antes de iniciar.${RESET}"
    exit 1
  fi
fi

if [ ! -d "node_modules" ]; then
  echo -e "  ${CYAN}[SETUP]${RESET} Instalando dependências..."
  npm install
fi

exec node --no-warnings index.js
