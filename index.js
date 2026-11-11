// Configura suporte a UTF-8 (emojis e acentos) no terminal Windows
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
}

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
  REST,
  Routes
} = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const ffmpegStatic = require('ffmpeg-static');
const vipManager = require('./src/vipManager');
const { createDashboardServer } = require('./src/dashboardServer');
const { createVoiceSessionManager } = require('./src/voiceSessionManager');
const {
  PREFIX,
  EMBED_COLOR,
  GOLD_COLOR,
  slashCommands,
  createCommandsModule
} = require('./comando');

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
    new SpotifyPlugin(),
    new YtDlpPlugin()
  ]
});

// Gerenciador de quem puxou o bot para a chamada de voz (dono da sessão/skip)
const voiceSession = createVoiceSessionManager({
  getBotVoiceChannel: (guild) => guild?.members?.me?.voice?.channel || distube.voices.get(guild?.id)?.channel,
  getActiveQueue: (guildId) => distube.getQueue(guildId),
  getBotUserId: () => client.user?.id || null
});

// Módulo central de comandos, embeds, bloqueios VIP e interações (comando.js)
const { createMusicRow, registerCommandListeners } = createCommandsModule({
  client,
  distube,
  vipManager,
  voiceSession,
  rootDir: __dirname
});

// Registra os listeners de comandos (! /), menções, fila e botões do player
registerCommandListeners();

// Cores ANSI para o terminal
const colors = {
  cyan: '\x1b[1;36m',
  white: '\x1b[1;37m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  magenta: '\x1b[1;35m',
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
  console.clear();
  const c = colors;
  console.log(c.cyan + '  ██████╗██╗  ██╗██╗      ██████╗ ██████╗ ██╗███╗   ██╗███████╗' + c.reset);
  console.log(c.cyan + ' ██╔════╝██║  ██║██║     ██╔═══██╗██╔══██╗██║████╗  ██║██╔════╝' + c.reset);
  console.log(c.cyan + ' ██║     ███████║██║     ██║   ██║██████╔╝██║██╔██╗ ██║█████╗  ' + c.reset);
  console.log(c.cyan + ' ██║     ██╔══██║██║     ██║   ██║██╔══██╗██║██║╚██╗██║██╔══╝  ' + c.reset);
  console.log(c.cyan + ' ╚██████╗██║  ██║███████╗╚██████╔╝██║  ██║██║██║ ╚████║███████╗' + c.reset);
  console.log(c.cyan + '  ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝' + c.reset);
  console.log(c.white + '                    ♪  M U S I C   B O T  ♪' + c.reset);
  console.log('');
  console.log(c.cyan + '  ╔══════════════════════════════════════════════════════════════╗' + c.reset);
  console.log(c.cyan + '  ║' + c.white + '                    PAINEL DE CONTROLE DO BOT                 ' + c.cyan + '║' + c.reset);
  console.log(c.cyan + '  ╠══════════════════════════════════════════════════════════════╣' + c.reset);
  console.log(renderBoxLine(c.yellow + '🤖 Bot:' + c.reset, c.white + client.user.tag + c.reset));
  console.log(renderBoxLine(c.yellow + '👑 Criador:' + c.reset, c.magenta + '.nolasco7' + c.reset));
  console.log(renderBoxLine(c.yellow + '🌍 Servidores:' + c.reset, c.green + `${client.guilds.cache.size} servidores conectados` + c.reset));
  console.log(renderBoxLine(c.yellow + '⚡ Ping:' + c.reset, c.white + `${client.ws.ping}ms` + c.reset));
  console.log(renderBoxLine(c.yellow + '🎶 Prefixo:' + c.reset, c.white + PREFIX + ' e /' + c.reset));
  console.log(renderBoxLine(c.yellow + '🌐 Painel Web:' + c.reset, c.cyan + 'http://localhost:3000' + c.reset));
  console.log(renderBoxLine(c.yellow + '🟢 Status:' + c.reset, c.green + 'Online & Pronto para tocar!' + c.reset));
  console.log(c.cyan + '  ╚══════════════════════════════════════════════════════════════╝' + c.reset);
  console.log('');
  console.log(c.gray + '  [REGISTRO DE ATIVIDADES EM TEMPO REAL]:' + c.reset);

  // Inicia o Painel Web Localhost
  try {
    const port = process.env.PORT || 3000;
    createDashboardServer(client, distube, port);
  } catch (err) {
    console.error('Erro ao iniciar o Painel Web:', err);
  }

  // Registra os Slash Commands globalmente para aparecerem no perfil do bot
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands }
    );
    console.log(`${c.gray}[SISTEMA]${c.reset} ${c.green}✓ Comandos de barra (/) sincronizados com sucesso no Discord!${c.reset}`);
  } catch (err) {
    console.error('Erro ao sincronizar comandos de barra:', err);
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

  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.green}▶ ${isSkipped ? 'PULADA & TOCANDO' : 'TOCANDO'}:${colors.reset} ${colors.white}${song.name}${colors.reset} ${colors.gray}(${song.formattedDuration})${colors.reset} ${colors.cyan}[Pedido por: ${requesterLabel}]${colors.reset} ${isVip ? colors.yellow + '[VIP 👑]' + colors.reset : ''}`);

  const title = isSkipped ? '⏭️ Faixa Pulada & Tocando Agora' : (isVip ? '👑 Tocando Agora • Servidor VIP' : '🎵 Tocando Agora');
  const requesterInfo = voiceSession.formatSongRequesterInfo(queue, song);
  const controllerId = voiceSession.resolveCallHostId(queue.id, song.user?.id);

  const embed = new EmbedBuilder()
    .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
    .setTitle(title)
    .setDescription(`**[${song.name}](${song.url})**\n\n**Duração:** ${song.formattedDuration} • ${requesterInfo}`);

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  const row = createMusicRow(controllerId, false);
  queue.textChannel?.send({ embeds: [embed], components: [row] }).catch(() => {});
});

// Quando uma música é adicionada à fila
distube.on('addSong', (queue, song) => {
  // Se for a primeira música da fila (ou seja, ela começa a tocar imediatamente),
  // NÃO envia "Adicionado à fila" porque o evento 'playSong' já cuida de exibir o card "Tocando Agora"!
  if (queue.songs.length <= 1) return;

  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.yellow}➕ NA FILA:${colors.reset} ${colors.white}${song.name}${colors.reset} ${colors.gray}(${song.formattedDuration})${colors.reset}`);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('🎵 Adicionado à Fila')
    .setDescription(
      `**[${song.name}](${song.url})**\n\n` +
      `👤 **Pedido por:** ${song.user}\n` +
      `⏳ **Duração:** \`${song.formattedDuration}\``
    );

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando uma playlist é adicionada
distube.on('addList', (queue, playlist) => {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📋 Playlist Adicionada à Fila')
    .setDescription(`**[${playlist.name}](${playlist.url})**`)
    .addFields(
      { name: '🔢 Quantidade de músicas', value: `${playlist.songs.length}`, inline: true },
      { name: '⏱️ Duração total', value: `\`${playlist.formattedDuration}\``, inline: true }
    );

  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando não houver mais músicas relacionadas para o autoplay
distube.on('noRelated', (queue) => {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription('⚠️ Não foi possível encontrar mais músicas semelhantes para o autoplay continuar.');
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando a fila termina
distube.on('finish', (queue) => {
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.magenta}✨ FIM:${colors.reset} A fila de músicas foi concluída.`);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription('✨ **A fila de músicas terminou!**');
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando o canal de voz fica vazio
distube.on('empty', (queue) => {
  voiceSession.clearVoiceSummoner(queue.id);
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.yellow}👋 DESCONECTADO:${colors.reset} Canal de voz vazio.`);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription('👋 **O canal de voz ficou vazio, saindo...**');
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

// Quando o bot se desconecta da chamada de voz
distube.on('disconnect', (queue) => {
  voiceSession.clearVoiceSummoner(queue.id);
});

// Depuração do FFmpeg (para monitorar alertas ou interrupções de stream)
distube.on('ffmpegDebug', (msg) => {
  if (/error|Error|403|failed|broken|exited/i.test(msg)) {
    console.error(`${colors.yellow}⚠️ [FFmpeg]:${colors.reset} ${msg}`);
  }
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
  console.error('Erro no DisTube:', error);
  if (queue?.textChannel) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(`⚠️ **Erro ao reproduzir o áudio:** ${error.message || error}`);
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
