# 🎵 Chlorine Music™

Bot completo de música para Discord desenvolvido em **Node.js**, **Discord.js v14** e **DisTube v5**, com reprodução avançada no **YouTube e Spotify**, identidade visual em **Roxo Neon & Dourado VIP**, botões do player com **Application Emojis personalizados**, controle exclusivo de call para **quem puxou o bot** e **Painel de Controle Web Localhost**.

---

## ✨ Funcionalidades Atuais

- 🔍 **Reprodução Multi-Plataforma & Spotify Completo:**
  - Busca por nome e suporte a vídeos, lives e playlists via `@distube/youtube` e `@distube/yt-dlp` *(com suporte opcional a `cookies.txt`)*.
  - Integração aprimorada ao **Spotify** ([`src/spotifyPlugin.js`](src/spotifyPlugin.js)) com suporte à API oficial (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`), links regionais (`/intl-pt/`), URLs legadas (`/user/.../playlist/...`), URIs (`spotify:playlist:...`), links entre `<>` e links encurtados (`spotify.link`, `spoti.fi`, `spotify.app.link`), incluindo playlists de usuários, playlists editoriais, álbuns, artistas e faixas isoladas.
- 🔊 **Áudio Estável & Call Visível:** Integração com `ffmpeg-static` e codecs Opus (`@discord-player/opus`, `@discordjs/opus` opcional e `opusscript`), estabilizador de rede no `voiceStateUpdate` e exibição do canal de voz ativo (`🔊`) no card de *Tocando Agora*.
- 🎨 **Identidade Visual Padronizada:**
  - **Roxo Neon (`#8018D8`):** Embeds padrão do bot, ajuda, despedida e cartões normais.
  - **Dourado VIP (`#FFD700`):** Embeds exclusivos de servidores VIP e central `/vip` com ícone [`assets/iconepremium.png`](assets/iconepremium.png).
  - **Vermelho Erro (`#EF4444`):** Mensagens de erro e alertas de falha.
  - **Despedida Limpa (`!stop` / `!leave`):** Ao sair da call, envia diretamente no canal de comandos (sem mencionar o usuário) um embed roxo com agradecimento, link para o servidor de suporte e o banner [`assets/banner.png`](assets/banner.png).
- 🎛️ **Botões Personalizados & Emojis Neon Roxos (16 Application Emojis):**
  - Card de *Tocando Agora* com capa, duração, call conectada e 3 botões escuros com ícones neon roxos próprios do bot (**Pausar / Despausar**, **Pular** e **Parar**).
  - Conjunto completo com **16 ícones PNG** em [`assets/emojis/`](assets/emojis) (`play`, `pause`, `skip`, `stop`, `playing`, `headset`, `note`, `vip`, `gem`, `bolt`, `help`, `queue`, `volume`, `autoplay`, `clock`, `user`), aplicados nos botões do player, no menu da fila e em embeds (`/help`, `/vip`, *Tocando Agora* e *Adicionado à Fila / Playlist*).
  - Todos os ícones são sincronizados automaticamente como *Application Emojis* no aplicativo Discord em cada inicialização via [`src/playerEmojis.js`](src/playerEmojis.js) (com cache local em [`data/player_emojis.json`](data/player_emojis.json) e fallback Unicode automático).
- 👑 **Controle Exclusivo de Call (Skip, Botões & Autoplay):**
  - Quem puxar o bot para o canal de voz primeiro (`/play` ou `!play`) torna-se o responsável pela chamada.
  - Mesmo que outros membros adicionem faixas ou o **Autoplay** esteja ativo tocando músicas recomendadas, **apenas quem puxou o bot para a call** pode usar os botões do player ou pular faixas (`!skip` / salto no `!queue`).
- 🚀 **Slash Commands Enxutos (`/`) & Código Modular:** Apenas os 3 comandos principais registrados globalmente (`/play`, `/vip`, `/help`) para manter o perfil do bot limpo, com todos os comandos de chat (`!`), travas e interações centralizados em [`comandos.js`](comandos.js).
- 💬 **Status Personalizado & Menção:** Presença `!play ou /play | Música` e cartão de apresentação automático com banner e botão de convite ao mencionar `@Chlorine Music™`.
- 💎 **Sistema Chlorine VIP:**
  - Comandos `!queue`, `!pause`, `!resume`, `!skip`, `!volume` e `!autoplay` — além dos botões **Pausar / Despausar** e **Pular**, menu interativo da fila e resposta numérica — exclusivos para servidores VIP.
  - Aviso único por usuário sem VIP ao tentar um recurso bloqueado (evitando spam no chat).
- 🌐 **Painel Web Localhost do Dono (`http://localhost:3000`):** Interface responsiva com identidade [`/assets/iconepremium.png`](assets/iconepremium.png), exibição ao vivo da call conectada, troca de canal de voz, controle completo do player, normalização de links Spotify, edição total da fila em tempo real e gestão de chaves/servidores VIP.

---

## 📋 Comandos do Bot

### 🚀 Comandos de Barra Principais (`/`)

| Comando | Descrição |
| :--- | :--- |
| `/play <musica>` | Busca e toca uma música, playlist ou link (YouTube, Spotify, etc.) na call atual |
| `/vip` | Exibe o status e tempo restante do VIP do servidor ou os planos disponíveis |
| `/help` | Mostra o painel resumido de comandos e ajuda |

### 🎵 Comandos de Chat (`!`) — Livres

| Comando | Abreviações | Descrição |
| :--- | :--- | :--- |
| `!play <nome ou link>` | `!p` | Toca uma música, link ou playlist e adiciona à fila |
| `!stop` | `!parar`, `!leave`, `!sair` | Para a reprodução, limpa a fila, sai da call e envia o card de despedida no canal de comandos |
| `!nowplaying` | `!np`, `!tocando` | Exibe detalhes ao vivo, barra de progresso e controles da faixa atual |
| `!vip` | `!premium` | Mostra os planos VIP ou o status VIP ativo do servidor |
| `!help` | `!ajuda`, `!comandos`, `!h` | Exibe a central de comandos do bot |
| `@Chlorine Music™` | *(menção)* | Mostra informações do bot, banner e botão para adicioná-lo |

### 👑 Comandos Exclusivos VIP (`!`)

| Comando | Abreviações | Descrição |
| :--- | :--- | :--- |
| `!queue [nº]` | `!q`, `!fila` | Lista a fila numerada e permite pular direto para a faixa escolhida (via `!queue <nº>`, menu suspenso ou respondendo com o número no chat), removendo as faixas puladas |
| `!pause` | `!pausar` | Pausa a reprodução atual |
| `!resume` | `!despausar`, `!continuar`, `!unpause` | Retoma a música pausada |
| `!skip` | `!s`, `!pular`, `!next` | Pula a faixa atual *(exclusivo para quem puxou o bot para a call)* |
| `!volume <1-200>` | `!vol`, `!v` | Ajusta o volume HD do player entre `1%` e `200%` |
| `!autoplay` | `!ap`, `!auto` | Ativa/desativa a reprodução contínua de músicas recomendadas |

> 🔒 **Regras de Bloqueio:** Os botões **Pausar / Despausar** e **Pular** do player seguem as travas VIP (e a trava do responsável pela call para pular faixas e acionar os botões). Usuários em servidores sem VIP recebem apenas **1 aviso** por sessão para evitar poluição no chat.

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

Ao iniciar o bot, o painel web do dono fica disponível localmente em:

👉 **`http://localhost:3000`** *(ou na porta definida em `PORT` no `.env`)*

* **🎛️ Player & Voz ao Vivo (Owner):**
  * Exibe em tempo real a call conectada (`🔊`) no cabeçalho do servidor e no card *Tocando Agora*.
  * Permite trocar o bot de canal de voz ao vivo (`Mover Bot p/ Call`).
  * Barra de progresso clicável (seek), controles `Previous`, `Pause / Resume`, `Skip`, `Stop`, `Repeat` (desativado/faixa/fila), `Autoplay`, `Shuffle` e volume (`1%` a `200%`).
  * Tocar músicas pelo painel (inclusive links do Spotify e YouTube) escolhendo entre **`Adicionar à fila`**, **`Próxima (#1)`** ou **`Tocar imediatamente`**.
* **📜 Gestão Completa da Fila:** Reordene faixas arrastando e soltando ou pelos botões subir/descer, coloque como próxima (`#1`), pule direto para qualquer posição, remova itens individuais ou limpe a fila inteira.
* **👑 Sistema VIP:** Gere chaves aleatórias por plano (`7d`, `15d`, `30d`, `90d` ou `365d`), visualize chaves ativas/resgatadas e ative ou remova VIP de servidores diretamente.
* **🌍 Servidores:** Monitore servidores conectados, fila ativa, call atual e ping do bot em tempo real.

---

## 📁 Estrutura do Projeto

```text
discord-music-bot/
├── index.js                      # Núcleo do bot Discord, painéis, DisTube, presença e conexão de voz
├── comandos.js                   # Comandos (! /), menções, travas VIP/canal, moderação e botões
├── src/
│   ├── dashboardServer.js        # Servidor Express e API REST do painel web (localhost:3000 ou PORT)
│   ├── embedHelper.js            # Paleta oficial (#8018D8, #FFD700, #EF4444) e builders de embeds
│   ├── linuxCompat.js            # Compatibilidade Linux/containers (yt-dlp standalone ELF, FFmpeg fallback e +x)
│   ├── playerEmojis.js           # Sincronização e cache dos 16 Application Emojis (botões e embeds)
│   ├── queueHelper.js            # Menu interativo numerado da fila e salto direto (!queue)
│   ├── spotifyPlugin.js          # Suporte completo a links, URIs e playlists do Spotify
│   ├── vipManager.js             # Persistência e gestão de planos/chaves VIP
│   └── voiceSessionManager.js    # Controle do responsável da call e permissão de skip/autoplay
├── public/                       # Interface web (index.html, app.js e style.css) do painel localhost
├── assets/
│   ├── banner.png                # Banner oficial usado no /help, na despedida e na menção
│   ├── iconepremium.png          # Ícone VIP usado nos embeds VIP e no painel web
│   └── emojis/                   # 16 ícones PNG neon roxos (128×128) dos botões e embeds
├── data/
│   ├── player_emojis.json        # Cache local dos IDs dos Application Emojis sincronizados
│   └── vip_database.json         # Banco JSON local de chaves e servidores VIP
├── .shardcloud                   # Configuração pronta para deploy automático na ShardCloud (Linux / Node)
├── iniciar.bat                   # Launcher Windows em Roxo Neon com UTF-8, checagens e inicialização limpa
├── iniciar.sh                    # Launcher Linux (Ubuntu/Debian/VPS) com checagens e inicialização limpa
├── .gitattributes                # Garante quebra de linha LF em arquivos Linux (.sh e .shardcloud)
├── .env.example                  # Modelo completo das variáveis de ambiente
├── .gitignore                    # Regras de arquivos ignorados (node_modules, .env, logs)
└── package.json                  # Dependências, engines Node >= 20 e scripts do projeto
```

---

## 🛠️ Instalação e Configuração

### 1. Pré-requisitos e Dependências
Certifique-se de ter o **Node.js** instalado (testado em Node.js v24) e execute na pasta do projeto (o FFmpeg e os codecs Opus já vêm inclusos via dependências):

```bash
npm install
```

### 2. Discord Developer Portal
1. Crie uma aplicação em [Discord Developer Portal](https://discord.com/developers/applications) e adicione um **Bot**.
2. Em **Bot > Privileged Gateway Intents**, ative:
   * ✅ **Presence Intent**
   * ✅ **Server Members Intent**
   * ✅ **Message Content Intent** *(obrigatório para comandos `!` no chat)*
3. Em **OAuth2 > URL Generator**, marque os escopos `bot` e `applications.commands`, além das permissões de texto e voz (`Send Messages`, `Manage Messages`, `Embed Links`, `Attach Files`, `Use External Emojis`, `Read Message History`, `Connect`, `Speak`).

> 💡 **Application Emojis automáticos:** Na primeira inicialização online, o bot envia automaticamente os 16 ícones de `assets/emojis/` para a aba *Emojis* da sua aplicação no Discord e salva os IDs em `data/player_emojis.json`. Para substituir algum ícone no futuro, troque o PNG correspondente em `assets/emojis/` e remova a entrada antiga do JSON (e do Developer Portal) antes de reiniciar.

### 3. Configurar Variáveis de Ambiente (`.env`)
Crie ou edite o arquivo `.env` na raiz do projeto (baseado em [`.env.example`](.env.example)):

```env
DISCORD_TOKEN=seu_token_do_discord_aqui
SUPPORT_SERVER_URL=https://discord.gg/6MFj275a3S
PORT=3000

# Credenciais opcionais da API do Spotify (Spotify Developer Dashboard)
SPOTIFY_CLIENT_ID=seu_client_id_do_spotify_aqui
SPOTIFY_CLIENT_SECRET=seu_client_secret_do_spotify_aqui
SPOTIFY_COUNTRY=BR
```

> *(Opcional: caso utilize cookies do YouTube para evitar bloqueios de extração, adicione um arquivo `cookies.txt` na raiz do projeto.)*

### 4. Iniciar o Bot

* **No Windows:** dê duplo clique em **[`iniciar.bat`](iniciar.bat)**.
* **No Linux (Ubuntu / Debian / VPS):**
  ```bash
  chmod +x iniciar.sh
  ./iniciar.sh
  ```
* **Via terminal (Windows ou Linux):**
  ```bash
  npm start
  ```

---

## ☁️ Deploy na ShardCloud (Linux)

O projeto já inclui suporte completo para containers Linux e o arquivo [`.shardcloud`](.shardcloud) pré-configurado na raiz (`MAIN=index.js`, `MEMORY=512`, `LANGUAGE=node`, `VERSION=recommended`).

### O que o bot ajusta automaticamente no Linux
* **Binário standalone do `yt-dlp`:** em containers Node.js sem `python3`, configura o `yt-dlp_linux` / `yt-dlp_linux_aarch64` nativo automaticamente com permissão de execução (`chmod 0755`).
* **FFmpeg inteligente:** usa o `ffmpeg-static` com ajuste automático de permissão (`+x`) e faz fallback transparente para o `ffmpeg` global do container Linux (como o pré-instalado na ShardCloud).
* **Codecs e Criptografia:** utiliza `@snazzah/davey` (E2EE DAVE com pré-builds Linux) + fallback puro JS (`opusscript`) caso não haja compilador C++ no container para `@discordjs/opus`.
* **Logs & Shutdown seguro:** evita `console.clear()` em terminais sem TTY, protege erros de bind de porta no Painel Web e encerra filas de voz graciosamente ao receber `SIGINT`/`SIGTERM`.

### Passo a passo para subir na ShardCloud
1. **Via GitHub (recomendado)** ou **via `.zip`**:
   * Se enviar por `.zip`, **não inclua** `node_modules/` nem `.env` (a ShardCloud instala as dependências do Linux automaticamente e os arquivos seguem com line ending `LF`).
   * Certifique-se de que `.shardcloud` esteja na raiz do envio.
2. No painel da **ShardCloud**, acesse **Variáveis de Ambiente (Env)** da aplicação e configure:
   * `DISCORD_TOKEN` *(obrigatório — token do seu bot no Discord Developer Portal)*
   * `SUPPORT_SERVER_URL`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_COUNTRY` *(opcionais)*
   * > ⚠️ **Segurança do Painel Web:** evite expor `SUBDOMAIN` publicamente na ShardCloud caso não deseje que visitantes externos acessem o Painel de Controle sem autenticação.
3. Inicie a aplicação pela dashboard da ShardCloud (recomendado **512 MB de RAM** ou superior).

---

<p align="center">© 2026 Chlorine Music™ • Desenvolvido por .nolasco7</p>
