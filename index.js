require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const ffmpegStatic = require('ffmpeg-static');

// Prefixo padrão dos comandos
const PREFIX = '!';

// Cor padrão oficial para todos os embeds (Cyan Neon)
const EMBED_COLOR = 0x00D8E6;

// Função geradora dos botões do player (Sem o botão embaralhar, conforme solicitado)
function createMusicRow(requesterId, isPaused = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pause:${requesterId}`)
      .setLabel(isPaused ? 'Despausar' : 'Pausar')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`music_skip:${requesterId}`)
      .setLabel('Pular')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`music_stop:${requesterId}`)
      .setLabel('Parar')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
  );
}

// Inicializa o cliente do Discord com as permissões necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// Configuração do DisTube
const distube = new DisTube(client, {
  emitNewSongOnly: true,
  ffmpeg: {
    path: ffmpegStatic
  },
  plugins: [
    new YouTubePlugin(),
    new SpotifyPlugin(),
    new YtDlpPlugin()
  ]
});

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

// Definição dos Slash Commands (Comandos de barra /) para aparecerem no perfil do bot
const slashCommands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música pelo nome ou link (YouTube, Spotify, etc.)')
    .addStringOption(opt =>
      opt.setName('musica')
        .setDescription('Nome ou link da música')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pula imediatamente para a próxima música da fila'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Para a música, limpa a fila e sai da chamada de voz'),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa a música que está tocando no momento'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Retoma a reprodução da música pausada'),
  new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Liga ou desliga a reprodução automática de músicas semelhantes'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Exibe a lista com as próximas músicas na fila'),
  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Exibe detalhes e botões da música tocando agora'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume do áudio do bot')
    .addIntegerOption(opt =>
      opt.setName('nivel')
        .setDescription('Nível de volume de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Exibe o painel de comandos e ajuda')
].map(c => c.toJSON());

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
  console.log(renderBoxLine(c.yellow + '🟢 Status:' + c.reset, c.green + 'Online & Pronto para tocar!' + c.reset));
  console.log(c.cyan + '  ╚══════════════════════════════════════════════════════════════╝' + c.reset);
  console.log('');
  console.log(c.gray + '  [REGISTRO DE ATIVIDADES EM TEMPO REAL]:' + c.reset);

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

  client.user.setActivity({
    name: '!play ou /play | Música',
    type: ActivityType.Listening
  });
});

// Listener de interações (Slash Commands e Botões)
client.on('interactionCreate', async (interaction) => {
  // ============================================
  // EXECUÇÃO DOS COMANDOS DE BARRA (SLASH COMMANDS)
  // ============================================
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // /play
    if (commandName === 'play') {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: '❌ Você precisa entrar em um canal de voz primeiro!',
          ephemeral: true
        });
      }

      const query = interaction.options.getString('musica');
      await interaction.reply({ content: `🔍 Buscando **"${query}"**...`, ephemeral: true });

      try {
        await distube.play(voiceChannel, query, {
          textChannel: interaction.channel,
          member: interaction.member
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
      } catch (err) {
        interaction.editReply(`❌ Ocorreu um erro ao buscar a música: ${err.message || err}`).catch(() => {});
      }
      return;
    }

    // /skip
    if (commandName === 'skip') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (queue.songs[0]?.user?.id && queue.songs[0].user.id !== interaction.user.id) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`❌ Apenas quem pediu esta música (<@${queue.songs[0].user.id}>) pode pulá-la!`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      try {
        if (queue.songs.length <= 1 && !queue.autoplay) {
          await queue.stop();
          distube.voices.leave(interaction.guildId);
          const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ Fim da fila. A reprodução foi encerrada.');
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        queue._isSkipped = true;
        await queue.skip();
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏭️ **Música pulada com sucesso!**');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        queue._isSkipped = false;
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`❌ Não foi possível pular: ${err.message || err}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    // /stop
    if (commandName === 'stop') {
      const queue = distube.getQueue(interaction.guildId);
      if (queue) {
        await queue.stop().catch(() => {});
      }
      distube.voices.leave(interaction.guildId);
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ **Música parada e saí da chamada de voz com sucesso!** 👋');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /pause
    if (commandName === 'pause') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (queue.paused) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⚠️ A música já está pausada! Use `/resume` para continuar.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      queue.pause();
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏸️ **Música pausada.**');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /resume
    if (commandName === 'resume') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!queue.paused) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⚠️ A música já está tocando normalmente!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      queue.resume();
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('▶️ **Música despausada!**');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /autoplay
    if (commandName === 'autoplay') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({ content: '❌ Nenhuma música está tocando no momento!', ephemeral: true });
      }

      const autoplay = queue.toggleAutoplay();
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`📻 Autoplay ${autoplay ? 'Ativado' : 'Desativado'}`)
        .setDescription(
          autoplay
            ? '✅ O bot continuará buscando e tocando músicas recomendadas automaticamente baseadas na música atual!'
            : '⏹️ O autoplay foi desligado. O bot irá parar quando a fila de músicas terminar.'
        );

      return interaction.reply({ embeds: [embed] });
    }

    // /queue
    if (commandName === 'queue') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({ content: '❌ Nenhuma fila de músicas ativa no momento!', ephemeral: true });
      }

      const q = queue.songs
        .slice(0, 10)
        .map((song, i) => `${i === 0 ? '▶️ **Tocando agora:**' : `**${i}.**`} [${song.name}](${song.url}) - \`${song.formattedDuration}\``)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🎶 Fila de Reprodução (${queue.songs.length} música(s))`)
        .setDescription(q)
        .setFooter({ text: `Volume: ${queue.volume}% | Autoplay: ${queue.autoplay ? 'Ativado ✅' : 'Desativado ❌'}` });

      return interaction.reply({ embeds: [embed] });
    }

    // /nowplaying
    if (commandName === 'nowplaying') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({ content: '❌ Nenhuma música está tocando no momento!', ephemeral: true });
      }

      const song = queue.songs[0];
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🎵 Tocando Agora')
        .setDescription(`**[${song.name}](${song.url})**\n\n**Duração:** \`${queue.formattedCurrentTime} / ${song.formattedDuration}\` • **Pedido por:** ${song.user}`);

      if (song.thumbnail) {
        embed.setThumbnail(song.thumbnail);
      }

      const row = createMusicRow(song.user.id, queue.paused);
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // /volume
    if (commandName === 'volume') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const vol = interaction.options.getInteger('nivel');
      queue.setVolume(vol);
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`🔊 Volume ajustado para **${vol}%** com sucesso!`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /help
    if (commandName === 'help') {
      const assetsDir = path.join(__dirname, 'assets');
      const files = [];

      let logoAttachment = null;
      const logoPathPng = path.join(assetsDir, 'logo.png');
      const logoPathJpg = path.join(assetsDir, 'logo.jpg');
      if (fs.existsSync(logoPathPng)) {
        logoAttachment = new AttachmentBuilder(logoPathPng, { name: 'logo.png' });
        files.push(logoAttachment);
      } else if (fs.existsSync(logoPathJpg)) {
        logoAttachment = new AttachmentBuilder(logoPathJpg, { name: 'logo.jpg' });
        files.push(logoAttachment);
      }

      const avatarUrl = client.user.displayAvatarURL();
      const iconUrl = logoAttachment ? `attachment://${logoAttachment.name}` : avatarUrl;

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({
          name: 'Chlorine Music™ • Comandos',
          iconURL: iconUrl
        })
        .setThumbnail(iconUrl)
        .setDescription('Prefixo no servidor: `!` ou use os comandos de barra `/`')
        .addFields(
          {
            name: '🎵 Músicas & Fila',
            value: [
              '> ▶️ **!play** • `!p` • `/play`',
              '> ⏭️ **!skip** • `!s` • `/skip`',
              '> ⏹️ **!stop** • `!sair` • `/stop`',
              '> ⏸️ **!pause** • `/pause`',
              '> ⏯️ **!resume** • `/resume`'
            ].join('\n'),
            inline: true
          },
          {
            name: '🎛️ Controles & Sistema',
            value: [
              '> 📻 **!autoplay** • `/autoplay`',
              '> 📜 **!queue** • `!q` • `/queue`',
              '> 🔍 **!nowplaying** • `/nowplaying`',
              '> 🔊 **!volume** • `/volume`',
              '> ❓ **!help** • `/help`'
            ].join('\n'),
            inline: true
          }
        )
        .setFooter({
          text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7',
          iconURL: iconUrl
        });

      return interaction.reply({ embeds: [embed], files });
    }
    return;
  }

  // ============================================
  // EXECUÇÃO DOS BOTÕES DO PLAYER
  // ============================================
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('music_')) return;

  const [rawAction, requesterId] = interaction.customId.replace('music_', '').split(':');

  // Trava de segurança: apenas quem pediu a música pode usar os botões
  if (interaction.user.id !== requesterId) {
    return interaction.reply({
      content: `❌ Apenas quem pediu esta música (<@${requesterId}>) pode usar estes botões!`,
      ephemeral: true
    });
  }

  const queue = distube.getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({
      content: '❌ Nenhuma música está tocando no momento!',
      ephemeral: true
    });
  }

  // Ação: Pausar / Despausar
  if (rawAction === 'pause') {
    if (queue.paused) {
      queue.resume();
      const row = createMusicRow(requesterId, false);
      await interaction.update({ components: [row] }).catch(() => {});
    } else {
      queue.pause();
      const row = createMusicRow(requesterId, true);
      await interaction.update({ components: [row] }).catch(() => {});
    }
    return;
  }

  // Ação: Pular
  if (rawAction === 'skip') {
    await interaction.deferUpdate().catch(() => {});
    try {
      if (queue.songs.length <= 1 && !queue.autoplay) {
        await queue.stop();
      } else {
        queue._isSkipped = true;
        await queue.skip();
      }
    } catch (err) {
      queue._isSkipped = false;
      console.error('Erro ao pular via botão:', err);
    }
    return;
  }

  // Ação: Parar
  if (rawAction === 'stop') {
    await interaction.deferUpdate().catch(() => {});
    await queue.stop().catch(() => {});
    distube.voices.leave(interaction.guildId);
    return;
  }
});

// Listener de mensagens de texto
client.on('messageCreate', async (message) => {
  // Ignora mensagens de outros bots ou mensagens fora de servidores
  if (message.author.bot || !message.guild) return;

  // RESPOSTA QUANDO O BOT FOR MENCIONADO (@Chlorine Music™)
  if (message.mentions.has(client.user.id) && !message.mentions.everyone && !message.content.startsWith(PREFIX)) {
    const assetsDir = path.join(__dirname, 'assets');
    const files = [];

    // Banner (imagem larga)
    let bannerAttachment = null;
    const bannerPathPng = path.join(assetsDir, 'banner.png');
    const bannerPathJpg = path.join(assetsDir, 'banner.jpg');
    if (fs.existsSync(bannerPathPng)) {
      bannerAttachment = new AttachmentBuilder(bannerPathPng, { name: 'banner.png' });
      files.push(bannerAttachment);
    } else if (fs.existsSync(bannerPathJpg)) {
      bannerAttachment = new AttachmentBuilder(bannerPathJpg, { name: 'banner.jpg' });
      files.push(bannerAttachment);
    }

    // Logo (imagem quadrada / thumbnail)
    let logoAttachment = null;
    const logoPathPng = path.join(assetsDir, 'logo.png');
    const logoPathJpg = path.join(assetsDir, 'logo.jpg');
    if (fs.existsSync(logoPathPng)) {
      logoAttachment = new AttachmentBuilder(logoPathPng, { name: 'logo.png' });
      files.push(logoAttachment);
    } else if (fs.existsSync(logoPathJpg)) {
      logoAttachment = new AttachmentBuilder(logoPathJpg, { name: 'logo.jpg' });
      files.push(logoAttachment);
    }

    const avatarUrl = client.user.displayAvatarURL();
    const embed = new EmbedBuilder()
      .setColor(0x00D8E6)
      .setAuthor({
        name: 'Chlorine Music™',
        iconURL: logoAttachment ? `attachment://${logoAttachment.name}` : avatarUrl
      })
      .setTitle('👋 Olá! Eu sou o Chlorine Music™')
      .setDescription(
        'Estou aqui para transformar sua experiência musical no Discord com áudio de alta fidelidade.\n\n' +
        'Meu prefixo neste servidor é: `!`'
      )
      .addFields(
        { name: '👑 Criador', value: '`.nolasco7`', inline: true },
        { name: '🌍 Servidores', value: `\`${client.guilds.cache.size}\``, inline: true },
        { name: '📡 Streaming', value: '`SoundCloud\n& YouTube`', inline: true }
      )
      .setFooter({
        text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7'
      });

    if (logoAttachment) {
      embed.setThumbnail(`attachment://${logoAttachment.name}`);
    } else if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    if (bannerAttachment) {
      embed.setImage(`attachment://${bannerAttachment.name}`);
    }

    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Me adicione ao seu servidor')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl)
    );

    return message.reply({ embeds: [embed], components: [row], files });
  }

  // Ignora mensagens que não comecem com o prefixo
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  // COMANDO: !play (ou !p)
  if (command === 'play' || command === 'p') {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Você precisa entrar em um canal de voz primeiro!');
      return message.reply({ embeds: [embed] });
    }

    const query = args.join(' ');
    if (!query) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Por favor, digite o nome ou o link da música!\nExemplo: `!play bohemian rhapsody`');
      return message.reply({ embeds: [embed] });
    }

    const searchEmbed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`🔍 Buscando **"${query}"**...`);
    const searchMsg = await message.channel.send({ embeds: [searchEmbed] });

    try {
      await distube.play(voiceChannel, query, {
        textChannel: message.channel,
        member: message.member,
        message
      });
      // Deleta a mensagem temporária de busca
      setTimeout(() => searchMsg.delete().catch(() => {}), 2000);
    } catch (err) {
      console.error('Erro ao tentar reproduzir:', err);
      const errEmbed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`❌ Ocorreu um erro ao buscar a música: ${err.message || err}`);
      searchMsg.edit({ embeds: [errEmbed] });
    }
    return;
  }

  // COMANDO: !skip (ou !s, !pular, !next)
  if (['skip', 's', 'pular', 'next'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    // Trava: apenas quem pediu a música atual pode pulá-la
    if (queue.songs[0]?.user?.id && queue.songs[0].user.id !== message.author.id) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`❌ Apenas quem pediu esta música (<@${queue.songs[0].user.id}>) pode pulá-la!`);
      return message.reply({ embeds: [embed] });
    }

    try {
      if (queue.songs.length <= 1 && !queue.autoplay) {
        await queue.stop();
        distube.voices.leave(message);
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ Fim da fila. A reprodução foi encerrada.');
        return message.reply({ embeds: [embed] });
      }
      queue._isSkipped = true;
      await queue.skip();
      message.react('⏭️').catch(() => {});
    } catch (err) {
      queue._isSkipped = false;
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`❌ Não foi possível pular: ${err.message || err}`);
      return message.reply({ embeds: [embed] });
    }
    return;
  }

  // COMANDO: !stop (ou !parar, !leave, !sair)
  if (['stop', 'parar', 'leave', 'sair'].includes(command)) {
    const queue = distube.getQueue(message);
    const voice = distube.voices.get(message);

    if (!queue && !voice) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ O bot não está em nenhum canal de voz no momento!');
      return message.reply({ embeds: [embed] });
    }

    if (queue) {
      await queue.stop().catch(() => {});
    }
    distube.voices.leave(message);
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ **Música parada e saí da chamada com sucesso!** 👋');
    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !pause (ou !pausar)
  if (['pause', 'pausar'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    if (queue.paused) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⚠️ A música já está pausada! Use `!resume` para continuar.');
      return message.reply({ embeds: [embed] });
    }

    queue.pause();
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏸️ **Música pausada.** Use `!resume` para continuar.');
    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !resume (ou !despausar, !continuar, !unpause)
  if (['resume', 'despausar', 'continuar', 'unpause'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    if (!queue.paused) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⚠️ A música já está tocando normalmente!');
      return message.reply({ embeds: [embed] });
    }

    queue.resume();
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('▶️ **Música despausada!** Continuando a reprodução.');
    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !queue (ou !fila, !q)
  if (['queue', 'fila', 'q'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma fila de músicas ativa no momento!');
      return message.reply({ embeds: [embed] });
    }

    const q = queue.songs
      .slice(0, 10)
      .map((song, i) => `${i === 0 ? '▶️ **Tocando agora:**' : `**${i}.**`} [${song.name}](${song.url}) - \`${song.formattedDuration}\``)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`🎶 Fila de Reprodução (${queue.songs.length} música(s))`)
      .setDescription(q)
      .setFooter({ text: `Volume: ${queue.volume}% | Autoplay: ${queue.autoplay ? 'Ativado ✅' : 'Desativado ❌'}` });

    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !nowplaying (ou !np, !tocando)
  if (['nowplaying', 'np', 'tocando'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    const song = queue.songs[0];
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('🎵 Tocando Agora')
      .setDescription(`**[${song.name}](${song.url})**\n\n**Duração:** \`${queue.formattedCurrentTime} / ${song.formattedDuration}\` • **Pedido por:** ${song.user}`);

    if (song.thumbnail) {
      embed.setThumbnail(song.thumbnail);
    }

    const row = createMusicRow(song.user.id, queue.paused);
    return message.reply({ embeds: [embed], components: [row] });
  }

  // COMANDO: !volume (ou !vol, !v)
  if (['volume', 'vol', 'v'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    const volume = parseInt(args[0], 10);
    if (isNaN(volume) || volume < 1 || volume > 100) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🔊 Ajuste de Volume')
        .setDescription(
          `O volume atual é **${queue.volume}%**.\n\n` +
          `Para alterar, digite um valor entre **1** e **100**.\n` +
          `> Exemplo: \`!volume 50\` *(ou \`!vol 80\` / \`!v 30\`)*`
        );
      return message.reply({ embeds: [embed] });
    }

    queue.setVolume(volume);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(`🔊 Volume ajustado para **${volume}%** com sucesso!`);
    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !autoplay (ou !ap, !auto)
  if (['autoplay', 'ap', 'auto'].includes(command)) {
    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    const autoplay = queue.toggleAutoplay();
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`📻 Autoplay ${autoplay ? 'Ativado' : 'Desativado'}`)
      .setDescription(
        autoplay
          ? '✅ O bot continuará buscando e tocando músicas recomendadas automaticamente baseadas na música atual!'
          : '⏹️ O autoplay foi desligado. O bot irá parar quando a fila de músicas terminar.'
      );

    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !help (ou !ajuda, !comandos, !h)
  if (['help', 'ajuda', 'comandos', 'h'].includes(command)) {
    const assetsDir = path.join(__dirname, 'assets');
    const files = [];

    let logoAttachment = null;
    const logoPathPng = path.join(assetsDir, 'logo.png');
    const logoPathJpg = path.join(assetsDir, 'logo.jpg');
    if (fs.existsSync(logoPathPng)) {
      logoAttachment = new AttachmentBuilder(logoPathPng, { name: 'logo.png' });
      files.push(logoAttachment);
    } else if (fs.existsSync(logoPathJpg)) {
      logoAttachment = new AttachmentBuilder(logoPathJpg, { name: 'logo.jpg' });
      files.push(logoAttachment);
    }

    const avatarUrl = client.user.displayAvatarURL();
    const iconUrl = logoAttachment ? `attachment://${logoAttachment.name}` : avatarUrl;

    const embed = new EmbedBuilder()
      .setColor(0x00D8E6)
      .setAuthor({
        name: 'Chlorine Music™ • Comandos',
        iconURL: iconUrl
      })
      .setThumbnail(iconUrl)
      .setDescription('Prefixo no servidor: `!` • Use o comando principal ou as abreviações:')
      .addFields(
        {
          name: '🎵 Músicas & Fila',
          value: [
            '> ▶️ **!play** • `!p`',
            '> ⏭️ **!skip** • `!s` `!next` `!pular`',
            '> ⏹️ **!stop** • `!sair` `!parar` `!leave`',
            '> ⏸️ **!pause** • `!pausar`',
            '> ⏯️ **!resume** • `!continuar` `!unpause`'
          ].join('\n'),
          inline: true
        },
        {
          name: '🎛️ Controles & Sistema',
          value: [
            '> 📻 **!autoplay** • `!ap` `!auto`',
            '> 📜 **!queue** • `!q` `!fila`',
            '> 🔍 **!nowplaying** • `!np` `!tocando`',
            '> 🔊 **!volume** • `!vol` `!v`',
            '> ❓ **!help** • `!ajuda` `!h`'
          ].join('\n'),
          inline: true
        }
      )
      .setFooter({
        text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7',
        iconURL: iconUrl
      });

    return message.reply({ embeds: [embed], files });
  }
});

// ==========================================
// EVENTOS DO DISTUBE (Notificações no chat)
// ==========================================

// Quando uma música começa a tocar
distube.on('playSong', (queue, song) => {
  const isSkipped = !!queue._isSkipped;
  queue._isSkipped = false;

  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.green}▶ ${isSkipped ? 'PULADA & TOCANDO' : 'TOCANDO'}:${colors.reset} ${colors.white}${song.name}${colors.reset} ${colors.gray}(${song.formattedDuration})${colors.reset} ${colors.cyan}[Pedido por: ${song.user?.tag || song.user?.username || 'Membro'}]${colors.reset}`);

  const title = isSkipped ? '⏭️ Faixa Pulada & Tocando Agora' : '🎵 Tocando Agora';

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setDescription(`**[${song.name}](${song.url})**\n\n**Duração:** ${song.formattedDuration} • **Pedido por:** ${song.user}`);

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  const row = createMusicRow(song.user.id, false);
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
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.yellow}👋 DESCONECTADO:${colors.reset} Canal de voz vazio.`);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription('👋 **O canal de voz ficou vazio, saindo...**');
  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
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
