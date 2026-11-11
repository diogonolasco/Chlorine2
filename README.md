# 🎵 Chlorine Music™

Bot completo de música para Discord desenvolvido em **Node.js**, **Discord.js v14** e **DisTube v5**, com áudio de alta fidelidade (**Opus nativo**), sistema de planos **VIP** com embeds dourados, controle exclusivo de call para **quem puxou o bot** (inclusive no Autoplay) e **Painel de Controle Web Localhost**.

---

## ✨ Funcionalidades Atuais

- 🔍 **Reprodução Multi-Plataforma:** Busca inteligente por nome e suporte a links/playlists via `@distube/youtube`, `@distube/spotify`, `@distube/yt-dlp` (e suporte opcional a `cookies.txt` para o YouTube).
- 🔊 **Áudio HD Estável:** Utiliza `@discordjs/opus` nativo (evitando engasgos e quedas prematuras em mixes longos), `ffmpeg-static` integrado e estabilizador de conexão de voz no Discord.
- 👑 **Controle Exclusivo de Call (Skip & Autoplay):**
  - Quem puxar o bot para o canal de voz primeiro (`/play` ou `!play`) torna-se o responsável pela chamada.
  - Mesmo que outros membros adicionem músicas à fila ou que o **Autoplay** esteja ativo tocando músicas recomendadas, **apenas quem puxou o bot para a call** pode pular faixas (`!skip` / botão `⏭️ Pular`) e controlar os botões do player.
- 🎮 **Player Interativo sem Poluição:** Card de *Tocando Agora* com capa, duração e botões (`⏸️ Pausar / ▶️ Despausar`, `⏭️ Pular`, `⏹️ Parar`).
- 🚀 **Slash Commands Enxutos (`/`):** Apenas os 3 comandos principais registrados globalmente (`/play`, `/vip`, `/help`) para manter o perfil do bot limpo, junto do prefixo `!` completo no chat.
- 💬 **Status Personalizado & Menção:** Status `!play ou /play | Música` e resposta automática com card e botão de convite ao mencionar `@Chlorine Music™`.
- 💎 **Sistema Chlorine VIP:**
  - Planos disponíveis diretamente em `/vip` ou `!vip`, com botão para o servidor oficial e embeds dourados para servidores VIP.
  - Aviso único para usuários sem VIP que tentam comandos bloqueados (evita spam no chat).
- 🌐 **Painel Web Localhost (`http://localhost:3000`):** Controle completo de músicas por servidor, fila ao vivo, geração/gerenciamento de chaves VIP e ativação direta com 1 clique.

---

## 📋 Comandos do Bot

### 🚀 Comandos de Barra Principais (`/`)

| Comando | Descrição |
| :--- | :--- |
| `/play <musica>` | Busca e toca uma música ou playlist no canal de voz atual |
| `/vip` | Exibe o status e tempo restante do VIP do servidor ou os planos disponíveis |
| `/help` | Mostra a central de comandos e ajuda |

### 🎵 Comandos de Chat (`!`) — Livres

| Comando | Abreviações | Descrição |
| :--- | :--- | :--- |
| `!play <nome ou link>` | `!p` | Toca uma música ou adiciona à fila |
| `!stop` | `!parar`, `!leave`, `!sair` | Para a música, limpa a fila e desconecta da chamada |
| `!nowplaying` | `!np`, `!tocando` | Exibe detalhes e controles da faixa atual |
| `!vip` | `!premium` | Mostra os planos VIP ou status VIP do servidor |
| `!help` | `!ajuda`, `!comandos`, `!h` | Exibe o painel de comandos |
| `@Chlorine Music™` | *(menção)* | Mostra informações do bot e botão para adicioná-lo |

### 👑 Comandos Exclusivos VIP (`!`)

| Comando | Abreviações | Descrição |
| :--- | :--- | :--- |
| `!queue [nº]` | `!q`, `!fila` | Lista a fila numerada com menu interativo ou pula direto para o número escolhido (removendo as anteriores) |
| `!pause` | `!pausar` | Pausa a reprodução atual |
| `!resume` | `!despausar`, `!continuar`, `!unpause` | Retoma a música pausada |
| `!skip` | `!s`, `!pular`, `!next` | Pula a faixa atual *(exclusivo para quem puxou o bot para a call)* |
| `!volume <1-200>` | `!vol`, `!v` | Ajusta o volume HD do player entre `1%` e `200%` |
| `!autoplay` | `!ap`, `!auto` | Ativa/desativa a reprodução contínua de músicas recomendadas |

---

## 💎 Planos VIP

| Plano | Duração | Valor |
| :--- | :--- | :--- |
| 🥉 **Plano Bronze** | 7 Dias | `R$ 4,90` |
| 🥈 **Plano Prata** | 15 Dias | `R$ 8,90` |
| 🥇 **Plano Ouro** *(Mais Popular)* | 30 Dias (Mensal) | `R$ 14,90` |
| 💎 **Plano Platina** | 90 Dias (Trimestral) | `R$ 34,90` |
| 👑 **Plano Supremo** *(Melhor Custo-Benefício)* | 1 Ano (Anual) | `R$ 79,90` |

🔗 **Servidor Oficial / Contratação VIP:** [discord.gg/6MFj275a3S](https://discord.gg/6MFj275a3S)

---

## 🌐 Painel de Controle Web (Localhost)

Ao iniciar o bot, o painel web abre localmente em:

👉 **`http://localhost:3000`**

* **🎛️ Player & Músicas (Owner):** Veja em qual call o bot está tocando (`🔊 Call`), troque de canal de voz ao vivo, avance na barra de progresso, controle `Play` *(na fila, próxima ou imediata)*, `Previous`, `Pause`, `Skip`, `Stop`, `Repeat`, `Autoplay`, `Shuffle`, volume (1–200%) e edite toda a fila ao vivo (arrastar/reordenar, pular direto, limpar ou remover faixas).
* **👑 Sistema VIP:** Gere chaves aleatórias por plano (7, 15, 30, 90 ou 365 dias), visualize chaves ativas/resgatadas e ative ou remova VIP de servidores diretamente.
* **🌍 Servidores:** Monitore servidores conectados, fila ativa e ping do bot em tempo real.

---

## 📁 Estrutura do Projeto

```text
discord-music-bot/
├── index.js                    # Núcleo do bot Discord, painéis, DisTube e conexão de voz
├── comandos.js                 # Todos os comandos (! /), botões, trava VIP e menu da fila
├── src/
│   ├── dashboardServer.js      # Servidor Express e API do painel web (localhost:3000)
│   ├── queueHelper.js          # Menu interativo numerado da fila e salto direto (!queue)
│   ├── vipManager.js           # Persistência e gestão de planos/chaves VIP
│   └── voiceSessionManager.js  # Controle do responsável da call e permissão de skip/autoplay
├── public/                     # Interface web (HTML, CSS e JS) do painel localhost
├── assets/                     # Imagens e ícones dos embeds e do painel
├── data/                       # Banco JSON local do sistema VIP (vip_database.json)
├── iniciar.bat                 # Atalho rápido no Windows com suporte UTF-8 (chcp 65001)
├── iniciar-bot.bat             # Launcher estilizado no Windows com verificação de saída
├── .env.example                # Modelo das variáveis de ambiente
└── package.json                # Dependências e scripts do projeto
```

---

## 🛠️ Instalação e Configuração

### 1. Pré-requisitos e Dependências
Certifique-se de ter o **Node.js** instalado e execute na pasta do projeto:

```bash
npm install
```

### 2. Discord Developer Portal
1. Crie uma aplicação em [Discord Developer Portal](https://discord.com/developers/applications) e adicione um **Bot**.
2. Em **Bot > Privileged Gateway Intents**, ative:
   * ✅ **Presence Intent**
   * ✅ **Server Members Intent**
   * ✅ **Message Content Intent** *(obrigatório para comandos `!` no chat)*
3. Em **OAuth2 > URL Generator**, marque os escopos `bot` e `applications.commands`, além das permissões de texto e voz (`Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Connect`, `Speak`).

### 3. Configurar Variáveis de Ambiente (`.env`)
Crie ou edite o arquivo `.env` na raiz do projeto (baseado em `.env.example`):

```env
DISCORD_TOKEN=seu_token_do_discord_aqui
SUPPORT_SERVER_URL=https://discord.gg/6MFj275a3S
PORT=3000
```

*(Opcional: caso utilize cookies do YouTube para evitar bloqueios de extração, adicione um arquivo `cookies.txt` na raiz do projeto.)*

### 4. Iniciar o Bot

* **No Windows (recomendado, já ativa UTF-8 para acentos e emojis):** dê duplo clique em **`iniciar.bat`** ou **`iniciar-bot.bat`**.
* **Via terminal:**
  ```bash
  npm start
  ```

---

<p align="center">© 2026 Chlorine Music™ • Desenvolvido por .nolasco7</p>
