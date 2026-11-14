# 🎵 Chlorine Music™

> **Bot de música em alta fidelidade para Discord com painel web interativo em tempo real, sistema VIP exclusivo e streaming sem anúncios do YouTube e Spotify.**

---

## 🌐 Painel Web Oficial
Acesse e gerencie suas músicas em tempo real de qualquer lugar pelo celular ou computador:  
👉 **[chlorine.shardweb.app](https://chlorine.shardweb.app)**

---

## ✨ Principais Funcionalidades

### 🎧 Streaming de Alta Fidelidade (YouTube & Spotify)
- **YouTube:** Suporte a vídeos, lives, pesquisas por texto e playlists via `@distube/youtube` e `@distube/yt-dlp`.
- **Spotify Avançado:** Integração direta com suporte a faixas isoladas, álbuns, artistas e playlists (editoriais ou de usuários), além de links curtos (`spotify.link`, `spoti.fi`), URIs e links internacionais (`/intl-pt/`).
- **Áudio Estável:** Processamento via `ffmpeg-static` com codecs Opus de baixa latência e estabilizador de rede de voz no Discord.

### 🌐 Painel Web Interativo em Tempo Real
- **Sincronização Bidirecional:** A fila e o estado da reprodução transmitem instantaneamente para o site a cada segundo.
- **Player Web Completo:** Controle total de Play, Pause, Skip, Faixa Anterior, Volume (1% a 200%), Barra de Progresso com Seek, Repetição e Autoplay.
- **Fila em Lista Compacta e Elegante:** Cada música conta com miniatura de capa (48x48px), posição numerada (`#1`, `#2`...), duração, autor e botões para pular diretamente, reordenar ou remover.
- **Login Discord OAuth2:** Identificação automática com permissões de Dono, Administrador e Membro.

### 👑 Sistema de Controle de Call (Dono da Call)
- Quem puxa o bot para o canal de voz (`/play` ou `!play`) torna-se o **comandante da call**.
- Protege a chamada contra pulos acidentais ou abusos: apenas quem puxou o bot (ou Administradores) pode pular músicas e acionar comandos críticos.

### 💜 Identidade Visual Neon & 34 Application Emojis Personalizados
- **Paleta Oficial:** Roxo Neon (`#9D4EDD`), Violeta Profundo e Dourado VIP (`#FFD700`).
- **34 Application Emojis:** Todos os botões, menus e embeds usam ícones neon exclusivos criados especialmente para o bot e registrados automaticamente no Discord.

### 💎 Sistema VIP Completo & Monetização
- Chaves VIP ativáveis por tempo (7 dias, 15 dias, 30 dias, 90 dias e 1 ano).
- Recursos VIP exclusivos: `!queue` interativo, `!autoplay` infinito, `!volume` amplificado até 200%, controles de pause/skip liberados e visual dourado no site e no chat.
- Avisos inteligentes no chat para não gerar spam quando membros sem VIP tentarem usar comandos exclusivos.

---

## 📋 Lista de Comandos

### 🚀 Comandos de Barra Principais (`/`)
| Comando | Descrição |
| :--- | :--- |
| `/play <música>` | Toca uma música, link ou playlist (YouTube / Spotify) na call atual |
| `/vip` | Exibe o status VIP do servidor, tempo restante ou planos disponíveis |
| `/help` | Central de comandos e ajuda resumida |

### 🎵 Comandos de Chat (`!`) — Livres para Todos
| Comando | Atalhos | Descrição |
| :--- | :--- | :--- |
| `!play <nome ou link>` | `!p` | Busca e toca a música ou adiciona à fila |
| `!stop` | `!parar`, `!leave`, `!sair` | Para a reprodução, limpa a fila e sai da call |
| `!nowplaying` | `!np`, `!tocando` | Mostra a faixa atual, tempo decorrido e controles |
| `!vip` | `!premium` | Mostra os planos VIP ou status do servidor |
| `!help` | `!ajuda`, `!comandos`, `!h` | Exibe a central de ajuda |
| `@Chlorine Music™` | *(menção)* | Card interativo com status, banner e link do painel web |

### 👑 Comandos Exclusivos VIP (`!`)
| Comando | Atalhos | Descrição |
| :--- | :--- | :--- |
| `!queue [nº]` | `!q`, `!fila` | Fila interativa: veja a lista e pule direto para qualquer faixa |
| `!pause` | `!pausar` | Pausa a reprodução atual |
| `!resume` | `!despausar`, `!continuar` | Retoma a música pausada |
| `!skip` | `!s`, `!pular`, `!next` | Pula a música atual *(comandante da call)* |
| `!volume <1-200>` | `!vol`, `!v` | Ajusta o volume amplificado com nitidez HD |
| `!autoplay` | `!ap`, `!auto` | Toca músicas recomendadas sem parar ao fim da fila |

---

## 💎 Planos Chlorine VIP

| Plano | Duração | Valor |
| :--- | :--- | :--- |
| 🥉 **Plano Bronze** | 7 Dias | `R$ 4,90` |
| 🥈 **Plano Prata** | 15 Dias | `R$ 8,90` |
| 🥇 **Plano Ouro** *(Mais Popular)* | 30 Dias (Mensal) | `R$ 14,90` |
| 💎 **Plano Platina** | 90 Dias (Trimestral) | `R$ 34,90` |
| 👑 **Plano Supremo** *(Melhor Custo-Benefício)* | 1 Ano (Anual) | `R$ 79,90` |

🔗 **Servidor Oficial & Suporte:** [discord.gg/6MFj275a3S](https://discord.gg/6MFj275a3S)

---

## ⚙️ Arquitetura Híbrida do Sistema

Para máxima estabilidade de áudio e segurança contra bloqueios:

```mermaid
flowchart LR
    A["💻 Bot Ativo (Windows / Local)<br>• DisTube & FFmpeg<br>• Conexão de Voz UDP<br>• IP Residencial (Sem bloqueios do YT)"] 
    <--> |"Sincronização em Tempo Real<br>POST /api/internal/sync-queue"| 
    B["☁️ Painel Web (ShardCloud / Nuvem 24/7)<br>• chlorine.shardweb.app<br>• Login Discord OAuth2<br>• Banco de VIPs e APIs"]
    B <--> C["📱 Membros & Donos<br>(Celular / Navegador)"]
```

- **ShardCloud (Nuvem 24/7):** Roda o painel web oficial, autentica usuários via Discord OAuth2 e disponibiliza a interface de controle online sem quedas.
- **Windows (PC do Dono):** Executa a conexão de voz UDP na call sem bloqueios de portas e realiza o streaming do áudio em ultra definição.
- **Sincronização Contínua:** Ambas as partes comunicam-se a cada segundo: o que toca na call aparece no site, e qualquer botão clicado no site comanda a call no Discord imediatamente.

---

## 🚀 Como Executar

### 1. Pré-requisitos
- [Node.js](https://nodejs.org/) v20 ou superior instalado.
- Token de Bot criado no [Discord Developer Portal](https://discord.com/developers/applications).

### 2. Configuração do `.env`
Copie o arquivo `.env.example` para `.env` e preencha as suas chaves:

```env
DISCORD_TOKEN=seu_bot_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui
DISCORD_CLIENT_SECRET=seu_client_secret_aqui
DASHBOARD_URL=https://chlorine.shardweb.app
PORT=3000
WEB_ONLY=false
```

### 3. Iniciar o Bot (Windows)
Basta dar dois cliques no executável:
```cmd
iniciar.bat
```
*(Ou execute `node index.js` no terminal).*

### 4. Modo Servidor Web Apenas (Nuvem / Linux)
Para rodar somente a API e o painel web no servidor de hospedagem:
```env
WEB_ONLY=true
PORT=80
```

---

## 📄 Licença & Créditos

Desenvolvido com dedicação por **.nolasco7**.  
Todos os direitos reservados © 2026 **Chlorine Music™**.
