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
const vipManager = require('./src/vipManager');
const { createDashboardServer } = require('./src/dashboardServer');

// Prefixo padrão dos comandos
const PREFIX = '!';

// Cores oficiais dos embeds
const EMBED_COLOR = 0x00D8E6; // Cyan Neon
const GOLD_COLOR = 0xFFD700;  // Dourado VIP

// Controle de aviso único para usuários que tentam comandos bloqueados sem VIP
// Notifica o usuário APENAS UMA VEZ; tentativas posteriores são ignoradas sem resposta
const warnedNonVipUsers = new Set();

function notifyNonVipOnce(userId, replyFn) {
  if (warnedNonVipUsers.has(userId)) {
    // Já foi avisado anteriormente: não responde mais nada sobre comprar VIP
    return false;
  }
  warnedNonVipUsers.add(userId);

  const embed = new EmbedBuilder()
    .setColor(GOLD_COLOR)
    .setTitle('🔒 Comando Exclusivo VIP!')
    .setDescription(
      'Os comandos **!skip**, **!volume** e **!autoplay** são exclusivos para servidores com plano **Chlorine VIP**!\n\n' +
      'Digite **!vip** ou use **/vip** para conhecer os planos e liberar para o seu servidor!'
    )
    .setFooter({
      text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7'
    });

  replyFn({ embeds: [embed] });
  return true;
}

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

// Função geradora do Embed do comando !vip
function createVipEmbed(guildId, guildName) {
  const isVip = vipManager.isGuildVip(guildId);
  const vipInfo = vipManager.getGuildVipInfo(guildId);
  const assetsDir = path.join(__dirname, 'assets');
  const files = [];

  let iconUrl = null;
  const iconePremiumPath = path.join(assetsDir, 'iconepremium.png');
  const goldImagePath = path.join(assetsDir, 'chlorine_gold.webp');

  if (fs.existsSync(iconePremiumPath)) {
    files.push(new AttachmentBuilder(iconePremiumPath, { name: 'iconepremium.png' }));
    iconUrl = 'attachment://iconepremium.png';
  } else if (fs.existsSync(goldImagePath)) {
    files.push(new AttachmentBuilder(goldImagePath, { name: 'chlorine_gold.webp' }));
    iconUrl = 'attachment://chlorine_gold.webp';
  }

  const supportUrl = process.env.SUPPORT_SERVER_URL || 'https://discord.gg/6MFj275a3S';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Entrar no Servidor Oficial')
      .setStyle(ButtonStyle.Link)
      .setURL(supportUrl)
      .setEmoji('👑')
  );

  if (isVip && vipInfo) {
    // Servidor POSSUI VIP Ativo
    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('👑 Chlorine Music™ VIP • Status do Servidor')
      .setDescription(
        `🎉 Parabéns! O servidor **${guildName}** possui o plano **Chlorine VIP Ativo**!\n` +
        `Aproveite recursos de áudio ilimitados e qualidade de som máxima sem nenhuma restrição.`
      )
      .addFields(
        {
          name: '🏷️ Plano Contratado',
          value: `> **${vipInfo.planName}**`,
          inline: true
        },
        {
          name: '⏱️ Tempo Restante',
          value: `> **${vipInfo.formattedRemaining}**`,
          inline: true
        },
        {
          name: '📅 Válido Até',
          value: `> **${vipInfo.formattedExpiresAt}**`,
          inline: true
        },
        {
          name: '✨ Recursos Desbloqueados',
          value: [
            '> 📻 **Autoplay Automático:** Músicas recomendadas sem parar!',
            '> 🔊 **Volume Avançado:** Ajuste o volume até 200% com áudio HD!',
            '> ⏭️ **Skip Liberado:** Pule faixas instantaneamente!',
            '> ⚡ **Prioridade de Conexão:** Menor latência e sem quedas de buffer.',
            '> 👑 **Embed Dourado Exclusivo:** Destaque no player do servidor.'
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({
        text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7',
        iconURL: iconUrl || undefined
      });

    if (iconUrl) {
      embed.setThumbnail(iconUrl);
    }

    return { embeds: [embed], files, components: [row] };
  }

  // Servidor NÃO possui VIP
  const embed = new EmbedBuilder()
    .setColor(GOLD_COLOR)
    .setTitle('👑 Chlorine Music™ VIP • Eleve sua Experiência Sonora')
    .setDescription(
      `O servidor **${guildName}** ainda não possui um plano **Chlorine VIP**.\n` +
      `Desbloqueie recursos de ponta, reprodução contínua e qualidade sonora de alta fidelidade para todos os membros!`
    )
    .addFields(
      {
        name: '✨ Comandos & Vantagens Exclusivas VIP',
        value: [
          '> 📻 **!autoplay / !ap** • Músicas automáticas infinitas recomendadas!',
          '> 🔊 **!volume / !vol** • Controle de volume amplificado HD de 1% a 200%!',
          '> ⏭️ **!skip / !s** • Pule músicas sem votação ou restrições!',
          '> ⚡ **Buffer Prioritário** • Áudio sem travamentos ou lentidão!',
          '> 👑 **Suporte VIP Exclusivo** • Atendimento prioritário no servidor oficial.'
        ].join('\n'),
        inline: false
      },
      {
        name: '💎 Planos Disponíveis & Valores',
        value: [
          '> 🥉 **Plano Bronze (7 Dias):** `R$ 4,90`',
          '> 🥈 **Plano Prata (15 Dias):** `R$ 8,90`',
          '> 🥇 **Plano Ouro (30 Dias / Mensal):** `R$ 14,90` *(Mais Popular ⭐)*',
          '> 💎 **Plano Platina (90 Dias / Trimestral):** `R$ 34,90`',
          '> 👑 **Plano Supremo (1 Ano / Anual):** `R$ 79,90` *(Melhor Custo-Benefício 🚀)*'
        ].join('\n'),
        inline: false
      },
      {
        name: '🛒 Como Contratar o seu VIP',
        value: (
          `Para adquirir o seu VIP, entre no nosso servidor oficial: **[discord.gg/6MFj275a3S](https://discord.gg/6MFj275a3S)**!\n` +
          `A ativação no seu servidor é imediata pela equipe oficial após a confirmação!`
        ),
        inline: false
      }
    )
    .setFooter({
      text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7',
      iconURL: iconUrl || undefined
    });

  if (iconUrl) {
    embed.setThumbnail(iconUrl);
  }

  return { embeds: [embed], files, components: [row] };
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

// Definição dos Slash Commands (Comandos de barra /) - Apenas os 3 comandos principais
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
    .setName('vip')
    .setDescription('Exibe o status VIP do servidor ou consulte os planos e vantagens exclusivas'),
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
      if (!vipManager.isGuildVip(interaction.guildId)) {
        if (warnedNonVipUsers.has(interaction.user.id)) {
          return interaction.reply({ content: '🔒 Comando exclusivo para servidores VIP.', ephemeral: true });
        }
        warnedNonVipUsers.add(interaction.user.id);
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('🔒 Comando Exclusivo VIP!')
          .setDescription(
            '⏭️ O comando de **Pular Músicas (/skip)** faz parte dos comandos exclusivos **Chlorine VIP**!\n\n' +
            'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!'
          )
          .setFooter({
            text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7'
          });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

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
      if (!vipManager.isGuildVip(interaction.guildId)) {
        if (warnedNonVipUsers.has(interaction.user.id)) {
          return interaction.reply({ content: '🔒 Modo Autoplay exclusivo para servidores VIP.', ephemeral: true });
        }
        warnedNonVipUsers.add(interaction.user.id);
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('🔒 Comando Exclusivo VIP!')
          .setDescription(
            '📻 O modo **Autoplay Automático** (músicas semelhantes infinitas) é um recurso exclusivo para servidores **Chlorine VIP**!\n\n' +
            'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!'
          )
          .setFooter({
            text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7'
          });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({ content: '❌ Nenhuma música está tocando no momento!', ephemeral: true });
      }

      const autoplay = queue.toggleAutoplay();
      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle(`📻 Autoplay ${autoplay ? 'Ativado' : 'Desativado'} (VIP 👑)`)
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

      const isVip = vipManager.isGuildVip(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
        .setTitle(`🎶 Fila de Reprodução (${queue.songs.length} música(s)) ${isVip ? '👑' : ''}`)
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

      const isVip = vipManager.isGuildVip(interaction.guildId);
      const song = queue.songs[0];
      const embed = new EmbedBuilder()
        .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
        .setTitle(isVip ? '👑 Tocando Agora • VIP' : '🎵 Tocando Agora')
        .setDescription(`**[${song.name}](${song.url})**\n\n**Duração:** \`${queue.formattedCurrentTime} / ${song.formattedDuration}\` • **Pedido por:** ${song.user}`);

      if (song.thumbnail) {
        embed.setThumbnail(song.thumbnail);
      }

      const row = createMusicRow(song.user.id, queue.paused);
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // /volume
    if (commandName === 'volume') {
      if (!vipManager.isGuildVip(interaction.guildId)) {
        if (warnedNonVipUsers.has(interaction.user.id)) {
          return interaction.reply({ content: '🔒 Controle de volume exclusivo para servidores VIP.', ephemeral: true });
        }
        warnedNonVipUsers.add(interaction.user.id);
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('🔒 Comando Exclusivo VIP!')
          .setDescription(
            '🔊 O controle de **Volume Personalizado** (1% a 200%) é um recurso exclusivo para servidores **Chlorine VIP**!\n\n' +
            'Digite `/vip` ou `!vip` para liberar o volume para o seu servidor!'
          )
          .setFooter({
            text: '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7'
          });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        const embed = new EmbedBuilder().setColor(GOLD_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const vol = interaction.options.getInteger('nivel');
      queue.setVolume(vol);
      const embed = new EmbedBuilder().setColor(GOLD_COLOR).setDescription(`🔊 Volume ajustado para **${vol}%** com sucesso! 👑`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /vip
    if (commandName === 'vip') {
      const response = createVipEmbed(interaction.guildId, interaction.guild.name);
      return interaction.reply(response);
    }

    // /setvip
    if (commandName === 'setvip') {
      if (!vipManager.isOwner(interaction.user.id)) {
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('⛔ Acesso Restrito ao Desenvolvedor')
          .setDescription(`Apenas o dono do bot (<@${vipManager.OWNER_ID}>) possui permissão para usar este comando e ativar planos VIP com código!`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const code = interaction.options.getString('codigo');
      const result = vipManager.activateVipWithKey(
        interaction.guildId,
        interaction.guild.name,
        code,
        interaction.user.id
      );

      if (!result.success) {
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('❌ Falha na Ativação')
          .setDescription(result.message);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const goldImagePath = path.join(__dirname, 'assets', 'chlorine_gold.webp');
      const files = [];
      let iconUrl = null;
      if (fs.existsSync(goldImagePath)) {
        files.push(new AttachmentBuilder(goldImagePath, { name: 'chlorine_gold.webp' }));
        iconUrl = 'attachment://chlorine_gold.webp';
      }

      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle('🎉 VIP ATIVADO COM SUCESSO!')
        .setDescription(`O servidor **${interaction.guild.name}** agora é **Chlorine VIP**! 👑`)
        .addFields(
          { name: '💎 Plano Ativado', value: `> **${result.guildVip.planName}**`, inline: true },
          { name: '⏱️ Duração', value: `> **${result.guildVip.durationDays} dias**`, inline: true },
          { name: '📅 Vencimento', value: `> **${result.guildVip.formattedExpiresAt}**`, inline: true },
          {
            name: '🔓 Comandos Liberados Imediatamente',
            value: [
              '> 📻 **/autoplay** • Músicas automáticas infinitas!',
              '> 🔊 **/volume <1-200>** • Controle de volume amplificado HD!',
              '> ⏭️ **/skip** • Pule músicas sem restrição!'
            ].join('\n'),
            inline: false
          }
        )
        .setFooter({
          text: `Código ${code} resgatado por ${interaction.user.tag}`,
          iconURL: iconUrl || undefined
        });

      if (iconUrl) {
        embed.setThumbnail(iconUrl);
      }

      return interaction.reply({ embeds: [embed], files });
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
          name: 'Chlorine Music™ • Central de Ajuda & Comandos',
          iconURL: iconUrl
        })
        .setThumbnail(iconUrl)
        .setDescription('Prefixo no servidor: `!` ou use os comandos de barra `/`')
        .addFields(
          {
            name: '🚀 Comandos de Barra Principais (/)',
            value: [
              '> ▶️ **/play <música>** • Tocar qualquer música ou link',
              '> 👑 **/vip** • Ver vantagens, planos e status VIP',
              '> ❓ **/help** • Exibir este painel de comandos e ajuda'
            ].join('\n'),
            inline: false
          },
          {
            name: '🎵 Controles do Player (Chat / Botões)',
            value: [
              '> ⏸️ **!pause** • Pausar música',
              '> ⏯️ **!resume** • Continuar música',
              '> ⏹️ **!stop** • Parar e limpar fila',
              '> 📜 **!queue** • Ver próximas da fila',
              '> 🔍 **!nowplaying** • Música tocando agora'
            ].join('\n'),
            inline: true
          },
          {
            name: '👑 Comandos Exclusivos VIP',
            value: [
              '> 👑 **/vip** / **!vip** • Painel VIP',
              '> 📻 **!autoplay** • Músicas recomendadas infinitas',
              '> 🔊 **!volume <1-200>** • Volume HD amplificado',
              '> ⏭️ **!skip** • Pular faixas sem restrição'
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
  // EXECUÇÃO DOS BOTÕES DO PLAYER & VIP
  // ============================================
  if (!interaction.isButton()) return;

  // Botão de Contato VIP (legado para mensagens antigas)
  if (interaction.customId === 'vip_contact_info') {
    return interaction.reply({
      content: `👑 Para contratar o seu plano VIP, entre no servidor oficial da Chlorine: **https://discord.gg/6MFj275a3S**!`,
      ephemeral: true
    });
  }

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
    if (!vipManager.isGuildVip(interaction.guildId)) {
      if (warnedNonVipUsers.has(interaction.user.id)) {
        // Já foi avisado: silencia sem reexibir mensagem sobre comprar VIP
        return interaction.deferUpdate().catch(() => {});
      }
      warnedNonVipUsers.add(interaction.user.id);
      return interaction.reply({
        content: '🔒 O comando de **Pular Músicas** é exclusivo para servidores com plano **Chlorine VIP**! Digite `!vip` ou `/vip` no chat para conhecer os planos e liberar.',
        ephemeral: true
      });
    }

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
    if (!vipManager.isGuildVip(message.guild.id)) {
      notifyNonVipOnce(message.author.id, (payload) => message.reply(payload));
      return;
    }

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
    if (!vipManager.isGuildVip(message.guild.id)) {
      notifyNonVipOnce(message.author.id, (payload) => message.reply(payload));
      return;
    }

    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(GOLD_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    const volume = parseInt(args[0], 10);
    if (isNaN(volume) || volume < 1 || volume > 200) {
      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle('🔊 Ajuste de Volume (VIP 👑)')
        .setDescription(
          `O volume atual é **${queue.volume}%**.\n\n` +
          `Para alterar, digite um valor entre **1** e **200**.\n` +
          `> Exemplo: \`!volume 120\` *(ou \`!vol 150\` / \`!v 80\`)*`
        );
      return message.reply({ embeds: [embed] });
    }

    queue.setVolume(volume);
    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setDescription(`🔊 Volume ajustado para **${volume}%** com sucesso! 👑`);
    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !autoplay (ou !ap, !auto)
  if (['autoplay', 'ap', 'auto'].includes(command)) {
    if (!vipManager.isGuildVip(message.guild.id)) {
      notifyNonVipOnce(message.author.id, (payload) => message.reply(payload));
      return;
    }

    const queue = distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setColor(GOLD_COLOR).setDescription('❌ Nenhuma música está tocando no momento!');
      return message.reply({ embeds: [embed] });
    }

    const autoplay = queue.toggleAutoplay();
    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle(`📻 Autoplay ${autoplay ? 'Ativado' : 'Desativado'} (VIP 👑)`)
      .setDescription(
        autoplay
          ? '✅ O bot continuará buscando e tocando músicas recomendadas automaticamente baseadas na música atual!'
          : '⏹️ O autoplay foi desligado. O bot irá parar quando a fila de músicas terminar.'
      );

    return message.reply({ embeds: [embed] });
  }

  // COMANDO: !vip (ou !premium)
  if (['vip', 'premium'].includes(command)) {
    const response = createVipEmbed(message.guild.id, message.guild.name);
    return message.reply(response);
  }

  // COMANDO SECRETO: !setvip ou !vipset (Somente o Dono: 767166234117931048)
  if (['setvip', 'vipset'].includes(command)) {
    if (!vipManager.isOwner(message.author.id)) {
      return; // Totalmente invisível e secreto para quem não for o dono
    }

    const code = args[0];
    if (!code) {
      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle('⚠️ Código VIP Não Informado')
        .setDescription(
          'Por favor, informe o código gerado no painel web do bot.\n\n' +
          '**Exemplo de uso:**\n`!setvip CHLORINE-VIP-30D-XXXX-YYYY`'
        );
      return message.reply({ embeds: [embed] });
    }

    const result = vipManager.activateVipWithKey(
      message.guild.id,
      message.guild.name,
      code,
      message.author.id
    );

    if (!result.success) {
      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle('❌ Falha na Ativação')
        .setDescription(result.message);
      return message.reply({ embeds: [embed] });
    }

    const goldImagePath = path.join(__dirname, 'assets', 'chlorine_gold.webp');
    const files = [];
    let iconUrl = null;
    if (fs.existsSync(goldImagePath)) {
      files.push(new AttachmentBuilder(goldImagePath, { name: 'chlorine_gold.webp' }));
      iconUrl = 'attachment://chlorine_gold.webp';
    }

    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🎉 VIP ATIVADO COM SUCESSO!')
      .setDescription(`O servidor **${message.guild.name}** agora é **Chlorine VIP**! 👑`)
      .addFields(
        { name: '💎 Plano Ativado', value: `> **${result.guildVip.planName}**`, inline: true },
        { name: '⏱️ Duração', value: `> **${result.guildVip.durationDays} dias**`, inline: true },
        { name: '📅 Vencimento', value: `> **${result.guildVip.formattedExpiresAt}**`, inline: true },
        {
          name: '🔓 Comandos Liberados Imediatamente',
          value: [
            '> 📻 **!autoplay** • Músicas automáticas infinitas!',
            '> 🔊 **!volume <1-200>** • Controle de volume amplificado HD!',
            '> ⏭️ **!skip** • Pule músicas sem restrição!'
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({
        text: `Código ${code} resgatado por ${message.author.tag}`,
        iconURL: iconUrl || undefined
      });

    if (iconUrl) {
      embed.setThumbnail(iconUrl);
    }

    return message.reply({ embeds: [embed], files });
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
        name: 'Chlorine Music™ • Central de Ajuda & Comandos',
        iconURL: iconUrl
      })
      .setThumbnail(iconUrl)
      .setDescription('Prefixo no servidor: `!` ou use os comandos de barra `/`')
      .addFields(
        {
          name: '🚀 Comandos de Barra Principais (/)',
          value: [
            '> ▶️ **/play <música>** • Tocar qualquer música ou link',
            '> 👑 **/vip** • Ver vantagens, planos e status VIP',
            '> ❓ **/help** • Exibir este painel de comandos e ajuda'
          ].join('\n'),
          inline: false
        },
        {
          name: '🎵 Controles do Player (Chat / Botões)',
          value: [
            '> ⏸️ **!pause** • Pausar música',
            '> ⏯️ **!resume** • Continuar música',
            '> ⏹️ **!stop** • Parar e limpar fila',
            '> 📜 **!queue** • Ver próximas da fila',
            '> 🔍 **!nowplaying** • Música tocando agora'
          ].join('\n'),
          inline: true
        },
        {
          name: '👑 Comandos Exclusivos VIP',
          value: [
            '> 👑 **/vip** / **!vip** • Painel VIP',
            '> 📻 **!autoplay** • Músicas recomendadas infinitas',
            '> 🔊 **!volume <1-200>** • Volume HD amplificado',
            '> ⏭️ **!skip** • Pular faixas sem restrição'
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

  const isVip = vipManager.isGuildVip(queue.id);
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.green}▶ ${isSkipped ? 'PULADA & TOCANDO' : 'TOCANDO'}:${colors.reset} ${colors.white}${song.name}${colors.reset} ${colors.gray}(${song.formattedDuration})${colors.reset} ${colors.cyan}[Pedido por: ${song.user?.tag || song.user?.username || 'Membro'}]${colors.reset} ${isVip ? colors.yellow + '[VIP 👑]' + colors.reset : ''}`);

  const title = isSkipped ? '⏭️ Faixa Pulada & Tocando Agora' : (isVip ? '👑 Tocando Agora • Servidor VIP' : '🎵 Tocando Agora');

  const embed = new EmbedBuilder()
    .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
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
