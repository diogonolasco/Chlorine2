# 🎵 Bot de Música para Discord

Bot completo de música para Discord desenvolvido em **Node.js** utilizando a biblioteca **Discord.js v14** e **DisTube** com suporte a busca de músicas por nome no YouTube, links do YouTube, Spotify e SoundCloud.

---

## 🚀 Funcionalidades

- 🔍 **Busca inteligente por nome**: Digite `!play nome da música` e ele busca e toca automaticamente.
- 🔗 **Suporte a links**: Aceita links do YouTube (vídeos e playlists), links de faixas do Spotify, etc.
- 📜 **Fila de reprodução (Queue)**: Músicas enfileiradas automaticamente.
- ⏭️ **Comandos de controle**: Pular (`!skip`), Parar (`!stop`), Pausar (`!pause`), Despausar (`!resume`), Ajustar Volume (`!volume`).
- 🎨 **Embeds visuais**: Mensagens organizadas informando o que está tocando, duração e quem pediu.
- ⚡ **FFmpeg Integrado**: Utiliza `ffmpeg-static`, funcionando direto no Windows sem precisar instalar FFmpeg no sistema.

---

## 📋 Lista de Comandos

| Comando | Abreviações | Descrição |
| :--- | :--- | :--- |
| `!play <nome ou link>` | `!p` | Toca uma música pelo nome ou link |
| `!stop` | `!parar`, `!leave`, `!sair` | Para a música, esvazia a fila e sai da chamada |
| `!pause` | `!pausar` | Pausa a música atual |
| `!resume` | `!despausar`, `!continuar`, `!unpause` | Continua a música pausada |
| `!queue` | `!q`, `!fila` | Mostra as próximas músicas da fila |
| `!nowplaying` | `!np`, `!tocando` | Mostra detalhes da música tocando agora |
| `!vip` | `!premium` | Exibe os planos VIP ou status do VIP do servidor |
| `!setvip <código>` | `!vipset` | Ativa o VIP no servidor via código *(Apenas Dono)* |
| `!skip` *(VIP)* | `!s`, `!pular`, `!next` | Pula para a próxima música *(Exclusivo VIP)* |
| `!volume <1-200>` *(VIP)* | `!vol`, `!v` | Ajusta o volume de 1% a 200% *(Exclusivo VIP)* |
| `!autoplay` *(VIP)* | `!ap`, `!auto` | Liga/desliga reprodução contínua *(Exclusivo VIP)* |
| `!help` | `!ajuda`, `!comandos`, `!h` | Exibe o menu de ajuda completo |
| `@Chlorine Music™` | *(menção)* | Card de boas-vindas com dados e botão de convite |

---

## 🌐 Painel de Controle Web (Localhost)

Ao iniciar o bot, um painel moderno fica automaticamente disponível no seu navegador em:
👉 **`http://localhost:3000`**

- 🎛️ **Comandar o Bot pelo Site:** Dê play, pause, skip, ajuste o volume e veja a fila ao vivo.
- 👑 **Gerenciador de Códigos VIP:** Gere chaves aleatórias nos planos de 7 dias, 15 dias, 30 dias, 90 dias ou 1 ano.
- ⚡ **Ativação Direta:** Ative ou revogue VIP de servidores com 1 clique.
- 🌍 **Monitoramento:** Acompanhe todos os servidores conectados e o ping do bot.

---

## 🛠️ Passo a Passo para Configurar o Bot

### 1. Criar a Aplicação no Portal de Desenvolvedores do Discord
1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications).
2. Clique no botão azul **"New Application"** no canto superior direito.
3. Dê um nome para o seu bot (ex: `MusicBot`) e clique em **Create**.

### 2. Criar o Bot e Obter o Token
1. No menu lateral esquerdo, clique em **Bot**.
2. Clique em **Reset Token** (ou **Add Bot** caso seja a primeira vez) e confirme.
3. **Copie o Token gerado**. *(Guarde com segurança, nunca compartilhe esse token publicamente!)*
4. Role a página até a seção **Privileged Gateway Intents** e ATIVE as 3 opções (ou pelo menos a crucial):
   - ✅ **Presence Intent**
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent** *(OBRIGATÓRIO para o bot conseguir ler os comandos `!play`)*
5. Clique em **Save Changes** no rodapé.

### 3. Convidar o Bot para o seu Servidor
1. No menu lateral esquerdo, clique em **OAuth2** -> **URL Generator**.
2. Na seção **Scopes**, marque:
   - ✅ `bot`
3. Na seção **Bot Permissions** que aparecer logo abaixo, marque:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Attach Files`
   - ✅ `Read Message History`
   - ✅ `Connect`
   - ✅ `Speak`
   *(Ou se for um servidor próprio de testes, pode selecionar `Administrator`).*
4. No final da página, copie a **Generated URL**, cole no seu navegador e selecione o servidor do Discord para onde deseja adicionar o bot.

### 4. Configurar o Token no Projeto
1. Abra o arquivo `.env` localizado na pasta do projeto:
   ```env
   DISCORD_TOKEN=cole_seu_token_aqui
   ```
2. Salve o arquivo.

### 5. Iniciar o Bot
No terminal ou prompt de comando dentro da pasta do bot, execute:
```bash
npm start
```

Você verá a mensagem:
```
🤖 Bot online com sucesso como: SeuBot#0000
🎶 Digite !play <música> no Discord para tocar!
```

Agora, basta entrar em um canal de voz no seu servidor do Discord e digitar:
```
!play nome de qualquer musica
```
