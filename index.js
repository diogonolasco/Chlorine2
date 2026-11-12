// Configura suporte a UTF-8 (emojis e acentos) no terminal Windows
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
}

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes
} = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const ffmpegStatic = require('ffmpeg-static');
const { createSpotifyPlugin } = require('./src/spotifyPlugin');
const vipManager = require('./src/vipManager');
const { createDashboardServer } = require('./src/dashboardServer');
const { createVoiceSessionManager } = require('./src/voiceSessionManager');
const { createPlayerEmojiManager } = require('./src/playerEmojis');
const {
  PREFIX,
  slashCommands,
  createCommandsModule
} = require('./comandos');

// Inicializa o cliente do Discord com as permissões necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// Suporte opcional a cookies do YouTube via cookies.txt (se existir)
const cookiesPath = path.join(__dirname, 'cookies.txt');
let ytCookies = undefined;
if (fs.existsSync(cookiesPath)) {
  try {
    const raw = fs.readFileSync(cookiesPath, 'utf8').trim();
    if (raw) ytCookies = raw;
  } catch {}
}

// Configuração do DisTube
const distube = new DisTube(client, {
  emitNewSongOnly: true,
  ffmpeg: {
    path: ffmpegStatic
  },
  plugins: [
    new YouTubePlugin(ytCookies ? { cookies: ytCookies } : {}),
    createSpotifyPlugin({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      topTracksCountry: process.env.SPOTIFY_COUNTRY || 'BR'
    }),
    new YtDlpPlugin()
  ]
});

// Gerenciador de quem puxou o bot para a chamada de voz (dono da sessão/skip)
const voiceSession = createVoiceSessionManager({
  getBotVoiceChannel: (guild) => guild?.members?.me?.voice?.channel || distube.voices.get(guild?.id)?.channel,
  getActiveQueue: (guildId) => distube.getQueue(guildId),
  getBotUserId: () => client.user?.id || null
});

// Gerenciador dos emojis personalizados dos botões do player (Application Emojis)
const playerEmojis = createPlayerEmojiManager({ rootDir: __dirname });

// Módulo central de comandos, embeds, bloqueios VIP e interações (comandos.js)
const {
  statusEmbed,
  buildPlayerCardPayload,
  buildAddedSongEmbed,
  buildAddedListEmbed,
  registerCommandListeners
} = createCommandsModule({
  client,
  distube,
  vipManager,
  voiceSession,
  playerEmojis,
  rootDir: __dirname
});

// Registra os listeners de comandos (! /), menções, fila e botões do player
registerCommandListeners();

// Cores ANSI para o terminal (Identidade Roxo Neon & Dourado VIP)
const colors = {
  purple: '\x1b[1;95m',
  violet: '\x1b[35m',
  cyan: '\x1b[1;36m',
  white: '\x1b[1;37m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  magenta: '\x1b[1;35m',
  red: '\x1b[1;91m',
  gray: '\x1b[90m',
  reset: '\x1b[0m'
};

function renderBoxLine(label, value, totalWidth = 56) {
  const cleanLabel = label.replace(/\x1b\[[0-9;]*m/g, '');
  const cleanVal = value.replace(/\x1b\[[0-9;]*m/g, '');
  const spaces = Math.max(0, totalWidth - cleanLabel.length - cleanVal.length);
  return `  ║  ${label} ${value}${' '.repeat(spaces)}║`;
}

// Quando o bot estiver online
client.once('clientReady', async () => {
  const dashboardPort = process.env.PORT || 3000;
  console.clear();
  const c = colors;
  console.log(c.purple + '  ██████╗██╗  ██╗██╗      ██████╗ ██████╗ ██╗███╗   ██╗███████╗' + c.reset);
  console.log(c.purple + ' ██╔════╝██║  ██║██║     ██╔═══██╗██╔══██╗██║████╗  ██║██╔════╝' + c.reset);
  console.log(c.violet + ' ██║     ███████║██║     ██║   ██║██████╔╝██║██╔██╗ ██║█████╗  ' + c.reset);
  console.log(c.violet + ' ██║     ██╔══██║██║     ██║   ██║██╔══██╗██║██║╚██╗██║██╔══╝  ' + c.reset);
  console.log(c.purple + ' ╚██████╗██║  ██║███████╗╚██████╔╝██║  ██║██║██║ ╚████║███████╗' + c.reset);
  console.log(c.purple + '  ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝' + c.reset);
  console.log(c.white + '                    ♪  ' + c.yellow + 'M U S I C   B O T' + c.white + '  ♪' + c.reset);
  console.log('');
  console.log(c.purple + '  ╔══════════════════════════════════════════════════════════════╗' + c.reset);
  console.log(c.purple + '  ║' + c.white + '                    PAINEL DE CONTROLE DO BOT                 ' + c.purple + '║' + c.reset);
  console.log(c.purple + '  ╠══════════════════════════════════════════════════════════════╣' + c.reset);
  console.log(renderBoxLine(c.yellow + '🤖 Bot:' + c.reset, c.white + client.user.tag + c.reset));
  console.log(renderBoxLine(c.yellow + '👑 Criador:' + c.reset, c.purple + '.nolasco7' + c.reset));
  console.log(renderBoxLine(c.yellow + '🌍 Servidores:' + c.reset, c.green + `${client.guilds.cache.size} servidores conectados` + c.reset));
  console.log(renderBoxLine(c.yellow + '⚡ Ping:' + c.reset, c.white + `${client.ws.ping}ms` + c.reset));
  console.log(renderBoxLine(c.yellow + '🎶 Prefixo:' + c.reset, c.white + PREFIX + ' e /' + c.reset));
  console.log(renderBoxLine(c.yellow + '🌐 Painel Web:' + c.reset, c.purple + `http://localhost:${dashboardPort}` + c.reset));
  console.log(renderBoxLine(c.yellow + '🟢 Status:' + c.reset, c.green + 'Online & Pronto para tocar!' + c.reset));
  console.log(c.purple + '  ╚══════════════════════════════════════════════════════════════╝' + c.reset);
  console.log('');

  // Inicia o Painel Web Localhost
  try {
    createDashboardServer(client, distube, dashboardPort, { quiet: true });
  } catch (err) {
    console.error(`${c.red}[ERRO]${c.reset} Falha ao iniciar Painel Web:`, err?.message || err);
  }

  // Registra os Slash Commands globalmente para aparecerem no perfil do bot
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands }
    );
  } catch (err) {
    console.error(`${c.red}[ERRO]${c.reset} Falha ao sincronizar comandos de barra:`, err?.message || err);
  }

  // Sincroniza os emojis personalizados dos botões do player no aplicativo Discord
  try {
    await playerEmojis.syncWithApplication(client.application);
  } catch (err) {
    console.error(`${c.yellow}[AVISO]${c.reset} Falha ao sincronizar emojis:`, err?.message || err);
  }

  client.user.setPresence({
    activities: [{
      name: '!play ou /play | Música',
      type: ActivityType.Custom,
      state: '!play ou /play | Música'
    }],
    status: 'online'
  });
});

// ==========================================
// EVENTOS DO DISTUBE (Notificações no chat)
// ==========================================

// Quando uma música começa a tocar
distube.on('playSong', (queue, song) => {
  const isSkipped = !!queue._isSkipped;
  queue._isSkipped = false;

  const isVip = vipManager.isGuildVip(queue.id);
  const time = new Date().toLocaleTimeString('pt-BR');
  const isBotQueued = song.user?.id === client.user?.id;
  const requesterLabel = isBotQueued
    ? (queue.autoplay ? 'Autoplay Automático' : 'Painel Web')
    : (song.user?.tag || song.user?.username || 'Membro');
  const voiceChannelName =
    queue.voiceChannel?.name || distube.voices.get(queue.id)?.channel?.name || null;
  const callTag = voiceChannelName ? ` [🔊 ${voiceChannelName}]` : '';

  console.log(`  ${colors.gray}[${time}]${colors.reset} ${colors.purple}▶ ${isSkipped ? 'PULADA & TOCANDO' : 'TOCANDO'}:${colors.reset} ${colors.white}${song.name}${colors.reset} ${colors.gray}(${song.formattedDuration})${colors.reset} ${colors.purple}[${requesterLabel}]${colors.reset}${colors.gray}${callTag}${colors.reset} ${isVip ? colors.yellow + '[VIP 👑]' + colors.reset : ''}`);

  const payload = buildPlayerCardPayload(queue.id, queue, {
    isSkipped,
    showLiveProgress: false
  });
  queue.textChannel?.send(payload).catch(() => {});
});

// Quando uma música é adicionada à fila
distube.on('addSong', (queue, song) => {
  // Se for a primeira música da fila (ela já dispara 'playSong' com o card principal), não duplica notificação
  if (queue.songs.length <= 1) return;

  queue.textChannel?.send({ embeds: [buildAddedSongEmbed(queue, song)] }).catch(() => {});
});

// Quando uma playlist é adicionada
distube.on('addList', (queue, playlist) => {
  queue.textChannel?.send({ embeds: [buildAddedListEmbed(queue, playlist)] }).catch(() => {});
});

// Quando não houver mais músicas relacionadas para o autoplay
distube.on('noRelated', (queue) => {
  const embed = statusEmbed({
    type: 'error',
    description: '⚠️ Não foi possível encontrar mais músicas semelhantes para o Autoplay continuar.'
  });
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando a fila termina
distube.on('finish', (queue) => {
  const embed = statusEmbed({
    type: 'info',
    description: '✨ **A fila de músicas terminou!** Use `!play` ou `/play` para continuar ouvindo.'
  });
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando o canal de voz fica vazio
distube.on('empty', (queue) => {
  voiceSession.clearVoiceSummoner(queue.id);
  const embed = statusEmbed({
    type: 'info',
    description: '👋 **O canal de voz ficou vazio, saindo da call...**'
  });
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando o bot se desconecta da chamada de voz
distube.on('disconnect', (queue) => {
  voiceSession.clearVoiceSummoner(queue.id);
});

// Estabilizador de conexão de voz + limpeza de responsável quando o bot sair da call
client.on('voiceStateUpdate', (oldState, newState) => {
  if (newState.id === client.user.id) {
    if (!newState.channelId) {
      voiceSession.clearVoiceSummoner(newState.guild.id);
      return;
    }
    const queue = distube.getQueue(newState.guild.id);
    if (queue?.voice?.connection && typeof queue.voice.connection.configureNetworking === 'function') {
      try {
        queue.voice.connection.configureNetworking();
      } catch {}
    }
  }
});

// Tratamento de erros do DisTube
distube.on('error', (error, queue) => {
  console.error(`  ${colors.red}[ERRO]${colors.reset} DisTube: ${error?.message || error}`);
  if (queue?.textChannel) {
    const errText = String(error?.message || error || 'Erro desconhecido').slice(0, 260);
    const embed = statusEmbed({
      type: 'error',
      description: `⚠️ **Erro ao reproduzir o áudio:** \`${errText}\``
    });
    queue.textChannel.send({ embeds: [embed] }).catch(() => {});
  }
});

// Inicia o bot com o Token do arquivo .env
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'SEU_TOKEN_AQUI') {
  console.error('❌ ERRO: O token do bot não foi configurado no arquivo .env!');
  console.error('Abra o arquivo .env e cole o seu DISCORD_TOKEN para poder rodar o bot.');
  process.exit(1);
}

client.login(token);
