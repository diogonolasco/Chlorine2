const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { buildQueueMessagePayload, jumpToQueuePosition } = require('./src/queueHelper');
const { normalizePlayQuery } = require('./src/spotifyPlugin');
const { createPlayerEmojiManager } = require('./src/playerEmojis');
const {
  EMBED_COLOR,
  GOLD_COLOR,
  FOOTER_TEXT,
  DEFAULT_SUPPORT_URL,
  truncateText,
  sanitizeLinkLabel,
  createProgressBar,
  createVolumeBar,
  createStatusEmbed,
  createPlayerEmbed,
  createAddedSongEmbed,
  createAddedListEmbed
} = require('./src/embedHelper');

// Prefixo padrão dos comandos de texto
const PREFIX = '!';

// Definição dos Slash Commands registrados globalmente (apenas /play, /vip e /help)
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
].map(cmd => cmd.toJSON());

/**
 * Localiza o primeiro arquivo de imagem existente dentro da pasta assets/.
 * @param {string} assetsDir Caminho absoluto da pasta de assets
 * @param {string[]} candidates Nomes de arquivos candidatos em ordem de prioridade
 * @returns {{ attachment: AttachmentBuilder|null, url: string|null, name: string|null }}
 */
function resolveAsset(assetsDir, candidates) {
  for (const filename of candidates) {
    const filePath = path.join(assetsDir, filename);
    if (fs.existsSync(filePath)) {
      return {
        attachment: new AttachmentBuilder(filePath, { name: filename }),
        url: `attachment://${filename}`,
        name: filename
      };
    }
  }
  return { attachment: null, url: null, name: null };
}

/**
 * Cria o módulo completo de comandos, embeds, travas VIP, controle de call e botões do bot.
 * @param {object} deps Dependências injetadas do núcleo do bot
 */
function createCommandsModule({
  client,
  distube,
  vipManager,
  voiceSession,
  playerEmojis = null,
  rootDir = __dirname,
  clearBatchDelayMs = 850,
  clearAutoDeleteMs = 5000
}) {
  if (!client || !distube || !vipManager || !voiceSession) {
    throw new Error('createCommandsModule requer client, distube, vipManager e voiceSession.');
  }

  const MAX_CLEAR_MESSAGES = 500;
  const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60 * 1000;
  const assetsDir = path.join(rootDir, 'assets');
  const emojiManager = playerEmojis || createPlayerEmojiManager({ rootDir });

  // Controle de aviso único para usuários que tentam comandos bloqueados sem VIP
  // Notifica o usuário APENAS UMA VEZ sobre comprar VIP; tentativas posteriores não repetem o anúncio
  const warnedNonVipUsers = new Set();

  // Trava por canal para impedir comandos simultâneos enquanto !clear estiver executando
  const activeClearChannels = new Set();

  function getBotAvatarUrl() {
    return client.user?.displayAvatarURL?.() || null;
  }

  function statusEmbed(opts) {
    return createStatusEmbed({
      botAvatarUrl: getBotAvatarUrl(),
      formatEmoji: formatPlayerEmoji,
      ...opts
    });
  }

  function createVipLockedEmbed(description) {
    return statusEmbed({
      type: 'vip',
      title: '🔒 Comando Exclusivo VIP!',
      description,
      footerText: FOOTER_TEXT
    });
  }

  function notifyNonVipOnce(userId, replyFn, description) {
    if (warnedNonVipUsers.has(userId)) {
      return false;
    }
    warnedNonVipUsers.add(userId);
    const defaultDescription =
      'Os comandos **!skip**, **!pause**, **!resume**, **!queue**, **!volume** e **!autoplay** são exclusivos para servidores **Chlorine VIP**!\n\n' +
      'Use **`/vip`** ou **`!vip`** para conhecer os planos e liberar no seu servidor.';
    replyFn({ embeds: [createVipLockedEmbed(description || defaultDescription)] });
    return true;
  }

  /**
   * Gera a linha de botões interativos do player vinculada ao responsável da call.
   * @param {string|null} controllerId ID do dono da sessão de voz
   * @param {boolean} isPaused Se a música atual está pausada
   */
  function createMusicRow(controllerId, isPaused = false) {
    const hostTag = controllerId && controllerId !== client.user?.id ? controllerId : 'open';
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`music_pause:${hostTag}`)
        .setLabel(isPaused ? 'Despausar' : 'Pausar')
        .setEmoji(emojiManager.getEmoji(isPaused ? 'play' : 'pause'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`music_skip:${hostTag}`)
        .setLabel('Pular')
        .setEmoji(emojiManager.getEmoji('skip'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`music_stop:${hostTag}`)
        .setLabel('Parar')
        .setEmoji(emojiManager.getEmoji('stop'))
        .setStyle(ButtonStyle.Secondary)
    );
  }

  /**
   * Monta o card de Player ("Tocando Agora") para uso compartilhado entre o evento playSong e !nowplaying.
   */
  function buildPlayerCardPayload(guildId, queue, { isSkipped = false, showLiveProgress = false } = {}) {
    const isVip = vipManager.isGuildVip(guildId);
    const song = queue.songs[0];
    const voiceChannelName =
      queue.voiceChannel?.name || distube.voices.get(guildId)?.channel?.name || null;
    const controllerId = voiceSession.resolveCallHostId(guildId, song?.user?.id);

    const embed = createPlayerEmbed({
      queue,
      song,
      isVip,
      isSkipped,
      botUserId: client.user?.id || null,
      botAvatarUrl: getBotAvatarUrl(),
      callHostId: controllerId,
      voiceChannelName,
      showLiveProgress,
      formatEmoji: formatPlayerEmoji
    });

    const row = createMusicRow(controllerId, Boolean(queue.paused));
    return { embeds: [embed], components: [row] };
  }

  /**
   * Monta o embed completo do comando !vip / /vip conforme o status VIP do servidor.
   */
  function createVipEmbed(guildId, guildName) {
    const isVip = vipManager.isGuildVip(guildId);
    const vipInfo = vipManager.getGuildVipInfo(guildId);
    const iconAsset = resolveAsset(assetsDir, ['iconepremium.png', 'chlorine_gold.webp']);
    const files = iconAsset.attachment ? [iconAsset.attachment] : [];
    const botAvatarUrl = getBotAvatarUrl();
    const authorIcon = botAvatarUrl || iconAsset.url || undefined;

    const supportUrl = process.env.SUPPORT_SERVER_URL || DEFAULT_SUPPORT_URL;
    const websiteUrl = (process.env.DASHBOARD_URL || 'https://chlorine.shardweb.app').replace(/\/auth\/callback\/?$/, '').replace(/\/$/, '');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Acessar Painel Web')
        .setStyle(ButtonStyle.Link)
        .setURL(websiteUrl)
        .setEmoji(emojiManager.getEmoji('web')),
      new ButtonBuilder()
        .setLabel('Entrar no Servidor Oficial')
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl)
        .setEmoji(emojiManager.getEmoji('vip'))
    );

    const autoplayEmoji = formatPlayerEmoji('autoplay');
    const volumeEmoji = formatPlayerEmoji('volume');
    const queueEmoji = formatPlayerEmoji('queue');
    const pauseEmoji = formatPlayerEmoji('pause');
    const skipEmoji = formatPlayerEmoji('skip');
    const vipEmoji = formatPlayerEmoji('vip');

    if (isVip && vipInfo) {
      const embed = statusEmbed({
        type: 'vip',
        title: '👑 Chlorine Music™ VIP • Status do Servidor',
        description:
          `✨ Parabéns! **${guildName}** possui acesso **Chlorine VIP Ativo**.\n` +
          `> 🌐 **Painel Web Oficial:** [chlorine.shardweb.app](${websiteUrl})\n` +
          '> Todos os membros da call aproveitam recursos desbloqueados com áudio HD prioritário!',
        thumbnail: iconAsset.url || authorIcon,
        fields: [
          { name: '🏷️ Plano Contratado', value: `> **${vipInfo.planName}**`, inline: true },
          { name: '⏱️ Tempo Restante', value: `> \`${vipInfo.formattedRemaining}\``, inline: true },
          { name: '📅 Válido Até', value: `> \`${vipInfo.formattedExpiresAt}\``, inline: true },
          {
            name: '✨ Vantagens Desbloqueadas no Servidor',
            value: [
              `> ${autoplayEmoji} **Autoplay Infinito** — Músicas recomendadas sem parar`,
              `> ${volumeEmoji} **Volume HD (1%–200%)** — Ajuste amplificado com nitidez`,
              `> ${queueEmoji} **Fila Interativa (!queue)** — Menu e salto direto para qualquer faixa`,
              `> ${pauseEmoji} **Pause & Resume** — Pause e retome via comando ou botão`,
              `> ${skipEmoji} **Skip Liberado** — Pule faixas sem espera para quem comanda a call`,
              `> ${vipEmoji} **Visual Dourado VIP** — Cards e destaques exclusivos no servidor`
            ].join('\n'),
            inline: false
          },
          {
            name: '🌐 Controle Pelo Site',
            value: `> Gerencie suas músicas e status em tempo real: **[chlorine.shardweb.app](${websiteUrl})**`,
            inline: false
          }
        ],
        footerText: FOOTER_TEXT
      });
      embed.setFooter({ text: FOOTER_TEXT, iconURL: iconAsset.url || botAvatarUrl || undefined });
      return { embeds: [embed], files, components: [row] };
    }

    const embed = statusEmbed({
      type: 'vip',
      title: '👑 Chlorine Music™ VIP • Eleve sua Experiência Sonora',
      description:
        `O servidor **${guildName}** ainda está no plano gratuito.\n` +
        `> 🌐 **Acesse o site oficial:** [chlorine.shardweb.app](${websiteUrl})\n` +
        '> Desbloqueie controle total da fila, volume amplificado até `200%`, Autoplay contínuo e prioridade de áudio HD!',
      thumbnail: iconAsset.url || authorIcon,
      fields: [
        {
          name: '✨ Recursos Exclusivos Desbloqueados',
          value: [
            `> ${autoplayEmoji} **!autoplay / !ap** — Recomendações automáticas sem fim`,
            `> ${volumeEmoji} **!volume <1-200>** — Volume HD amplificado até \`200%\``,
            `> ${queueEmoji} **!queue [nº]** — Fila completa com menu e salto instantâneo`,
            `> ${pauseEmoji} **!pause & !resume** — Controle total de pausa e retomada`,
            `> ${skipEmoji} **!skip / !s** — Pule faixas instantaneamente na call`,
            `> ${vipEmoji} **Prioridade de Áudio** — Menor latência e embeds dourados VIP`
          ].join('\n'),
          inline: false
        },
        {
          name: '💎 Planos Disponíveis',
          value: [
            '> 🥉 **Bronze (7 Dias):** `R$ 4,90`',
            '> 🥈 **Prata (15 Dias):** `R$ 8,90`',
            '> 🥇 **Ouro (30 Dias):** `R$ 14,90` • ⭐ *Mais Popular*',
            '> 💎 **Platina (90 Dias):** `R$ 34,90`',
            '> 👑 **Supremo (1 Ano):** `R$ 79,90` • 🚀 *Melhor Custo-Benefício*'
          ].join('\n'),
          inline: false
        },
        {
          name: '🌐 Painel Web & Ativação Online',
          value:
            `> Acesse o painel pelo navegador: **[chlorine.shardweb.app](${websiteUrl})**\n` +
            `> Entre no servidor oficial: **[discord.gg/6MFj275a3S](${supportUrl})**\n` +
            '> A ativação no servidor escolhido é imediata após a confirmação!',
          inline: false
        }
      ],
      footerText: FOOTER_TEXT
    });
    embed.setFooter({ text: FOOTER_TEXT, iconURL: iconAsset.url || botAvatarUrl || undefined });
    return { embeds: [embed], files, components: [row] };
  }

  /**
   * Formata o emoji personalizado do player para textos/embeds (<:nome:id>) com fallback Unicode.
   */
  function formatPlayerEmoji(key) {
    if (typeof emojiManager.formatEmoji === 'function') {
      return emojiManager.formatEmoji(key);
    }
    const emoji = emojiManager.getEmoji(key);
    if (emoji && typeof emoji === 'object' && emoji.id && emoji.name) {
      return `<:${emoji.name}:${emoji.id}>`;
    }
    return typeof emoji === 'string' ? emoji : '🎵';
  }

  /**
   * Monta o painel principal de ajuda (/help e !help).
   */
  function createHelpPayload() {
    const bannerAsset = resolveAsset(assetsDir, ['banner.png', 'banner.jpg']);
    const files = bannerAsset.attachment ? [bannerAsset.attachment] : [];

    const playEmoji = formatPlayerEmoji('play');
    const pauseEmoji = formatPlayerEmoji('pause');
    const skipEmoji = formatPlayerEmoji('skip');
    const stopEmoji = formatPlayerEmoji('stop');
    const playingEmoji = formatPlayerEmoji('playing');
    const headsetEmoji = formatPlayerEmoji('headset');
    const noteEmoji = formatPlayerEmoji('note');
    const vipEmoji = formatPlayerEmoji('vip');
    const gemEmoji = formatPlayerEmoji('gem');
    const boltEmoji = formatPlayerEmoji('bolt');
    const helpEmoji = formatPlayerEmoji('help');
    const queueEmoji = formatPlayerEmoji('queue');
    const volumeEmoji = formatPlayerEmoji('volume');
    const autoplayEmoji = formatPlayerEmoji('autoplay');

    const embed = statusEmbed({
      type: 'info',
      authorName: 'CHLORINE MUSIC™ • CENTRAL DE COMANDOS',
      title: 'Comandos & Controles',
      description:
        `${headsetEmoji} Streaming em alta definição pelo **YouTube** e **Spotify**.\n` +
        '> Prefixo **`!`** no chat ou barra **`/`** • Quem puxa o bot para a call comanda o skip.',
      fields: [
        {
          name: `${boltEmoji} Comandos Principais (/)`,
          value: [
            `> ${playEmoji} \`/play <música>\` — Tocar música ou playlist`,
            `> ${vipEmoji} \`/vip\` — Status e planos **Chlorine VIP**`,
            `> ${helpEmoji} \`/help\` — Exibir esta central de ajuda`
          ].join('\n'),
          inline: false
        },
        {
          name: `${noteEmoji} Comandos Livres (!)`,
          value: [
            `> ${playEmoji} \`!play\` \`!p\` — Tocar ou adicionar à fila`,
            `> ${stopEmoji} \`!stop\` \`!leave\` — Parar e sair da call`,
            `> ${playingEmoji} \`!nowplaying\` \`!np\` — Faixa atual e controles`,
            `> ${gemEmoji} \`!vip\` \`!premium\` — Planos e status VIP`
          ].join('\n'),
          inline: false
        },
        {
          name: `${vipEmoji} Comandos Exclusivos VIP (!)`,
          value: [
            `> ${queueEmoji} \`!queue [nº]\` \`!q\` — Fila e salto por número`,
            `> ${pauseEmoji} \`!pause\` • ${playEmoji} \`!resume\` — Pausar ou retomar`,
            `> ${skipEmoji} \`!skip\` \`!s\` — Pular *(dono da call)*`,
            `> ${volumeEmoji} \`!volume <1-200>\` \`!v\` — Volume HD amplificado`,
            `> ${autoplayEmoji} \`!autoplay\` \`!ap\` — Músicas recomendadas sem fim`
          ].join('\n'),
          inline: false
        }
      ],
      footerText: 'Chlorine Music™ • Todos os comandos em um só lugar'
    });

    if (bannerAsset.url) {
      embed.setImage(bannerAsset.url);
    }

    return { embeds: [embed], files };
  }

  /**
   * Monta o cartão de apresentação quando o bot é mencionado (@Chlorine Music™).
   */
  function createMentionPayload() {
    const bannerAsset = resolveAsset(assetsDir, ['banner.png', 'banner.jpg']);
    const logoAsset = resolveAsset(assetsDir, ['logo.png', 'logo.jpg']);
    const files = [bannerAsset.attachment, logoAsset.attachment].filter(Boolean);
    const iconUrl = logoAsset.url || getBotAvatarUrl() || undefined;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    const websiteUrl = (process.env.DASHBOARD_URL || 'https://chlorine.shardweb.app').replace(/\/auth\/callback\/?$/, '').replace(/\/$/, '');
    const supportUrl = process.env.SUPPORT_SERVER_URL || DEFAULT_SUPPORT_URL;

    const embed = statusEmbed({
      type: 'info',
      title: '👋 Olá! Eu sou o Chlorine Music™',
      description:
        'Experiência musical em alta fidelidade para o seu servidor Discord.\n' +
        'Use **`/play`** ou **`!play <música>`** em uma call, ou digite **`/help`**.\n\n' +
        `🌐 **Painel Web Oficial:** [chlorine.shardweb.app](${websiteUrl})`,
      thumbnail: iconUrl,
      fields: [
        { name: '👑 Criador', value: '`.nolasco7`', inline: true },
        { name: '🌍 Servidores', value: `\`${client.guilds.cache.size}\``, inline: true },
        { name: '📡 Streaming', value: '`YouTube & Spotify`', inline: true },
        { name: '🌐 Painel Web', value: `> Acesse o painel online: **[chlorine.shardweb.app](${websiteUrl})**`, inline: false }
      ],
      footerText: FOOTER_TEXT
    });
    embed.setFooter({ text: FOOTER_TEXT, iconURL: iconUrl });

    if (bannerAsset.url) {
      embed.setImage(bannerAsset.url);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Acessar Painel Web')
        .setEmoji(emojiManager.getEmoji('web'))
        .setStyle(ButtonStyle.Link)
        .setURL(websiteUrl),
      new ButtonBuilder()
        .setLabel('Me Adicionar')
        .setEmoji(emojiManager.getEmoji('add'))
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl),
      new ButtonBuilder()
        .setLabel('Servidor Oficial')
        .setEmoji(emojiManager.getEmoji('chat'))
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl)
    );

    return { embeds: [embed], components: [row], files };
  }

  /**
   * Monta o card "Tocando Agora" do comando /nowplaying e !nowplaying.
   */
  function createNowPlayingPayload(guildId, queue) {
    return buildPlayerCardPayload(guildId, queue, {
      isSkipped: false,
      showLiveProgress: true
    });
  }

  /**
   * Gera a resposta de ativação de código VIP (usada pelo comando secreto do dono).
   */
  function createSetVipActivationPayload({ guildId, guildName, code, userId, userTag, commandPrefixLabel }) {
    const result = vipManager.activateVipWithKey(guildId, guildName, code, userId);

    if (!result.success) {
      return {
        embeds: [
          statusEmbed({
            type: 'error',
            authorName: 'CHLORINE VIP • ATIVAÇÃO',
            title: '❌ Falha na Ativação VIP',
            description: `> ${result.message}`,
            footerText: FOOTER_TEXT
          })
        ]
      };
    }

    const goldAsset = resolveAsset(assetsDir, ['iconepremium.png', 'chlorine_gold.webp']);
    const files = goldAsset.attachment ? [goldAsset.attachment] : [];

    const embed = statusEmbed({
      type: 'vip',
      authorName: 'CHLORINE VIP • ASSINATURA CONFIRMADA',
      title: '🎉 VIP ATIVADO COM SUCESSO!',
      description:
        `✨ O servidor **${guildName}** acaba de receber o selo **Chlorine VIP**! 👑\n` +
        '> Todos os comandos e recursos premium já estão desbloqueados.',
      thumbnail: goldAsset.url || getBotAvatarUrl(),
      fields: [
        { name: '💎 Plano Ativado', value: `> **${result.guildVip.planName}**`, inline: true },
        { name: '⏱️ Duração', value: `> **${result.guildVip.durationDays} dias**`, inline: true },
        { name: '📅 Vencimento', value: `> \`${result.guildVip.formattedExpiresAt}\``, inline: true },
        {
          name: '🔓 Recursos Liberados Imediatamente',
          value: [
            `> 📻 **${commandPrefixLabel}autoplay** — Músicas recomendadas sem parar`,
            `> 🔊 **${commandPrefixLabel}volume <1-200>** — Volume amplificado HD até 200%`,
            `> ⏭️ **${commandPrefixLabel}skip** — Pule faixas sem restrições`,
            `> 📜 **${commandPrefixLabel}queue [nº]** — Fila completa com salto direto`,
            `> ⏸️ **${commandPrefixLabel}pause & ${commandPrefixLabel}resume** — Controle de pausa liberado`
          ].join('\n'),
          inline: false
        }
      ],
      footerText: `Chave ${code} resgatada por ${userTag}`
    });
    embed.setFooter({
      text: `Chave ${code} resgatada por ${userTag}`,
      iconURL: goldAsset.url || getBotAvatarUrl() || undefined
    });

    return { embeds: [embed], files };
  }

  async function playInVoiceChannel(guild, member, voiceChannel, query, extraOptions = {}) {
    const normalizedQuery = normalizePlayQuery(query);
    return voiceSession.playWithSummonerTracking(
      guild,
      member,
      () => distube.play(voiceChannel, normalizedQuery, { member, ...extraOptions }),
      (guildId) => Boolean(distube.getQueue(guildId) || distube.voices.get(guildId))
    );
  }

  function renderQueuePayload(guildId, queue, notice = null) {
    return buildQueueMessagePayload(queue, {
      isVip: vipManager.isGuildVip(guildId),
      embedColor: EMBED_COLOR,
      goldColor: GOLD_COLOR,
      notice,
      botAvatarUrl: getBotAvatarUrl(),
      formatEmoji: formatPlayerEmoji,
      getEmoji: (key) => emojiManager.getEmoji(key)
    });
  }

  async function executeQueueJump(queue, guildId, userId, rawPosition, songIdHint = null) {
    return jumpToQueuePosition({
      queue,
      guildId,
      userId,
      rawPosition,
      songIdHint,
      getSkipDenialMessage: (gId, uId, q) => voiceSession.getSkipDenialMessage(gId, uId, q)
    });
  }

  async function handleNumericQueueJump(queue, guildId, userId, numStr, replyFn) {
    if (!/^\d+$/.test(numStr)) {
      return replyFn({
        embeds: [
          statusEmbed({
            type: 'error',
            description: '❌ Informe um número válido da fila! Exemplo: `!queue 3`'
          })
        ]
      });
    }

    const requestedNumber = parseInt(numStr, 10);
    const jumpResult = await executeQueueJump(queue, guildId, userId, requestedNumber);
    if (!jumpResult.ok) {
      return replyFn({
        embeds: [
          statusEmbed({
            type: 'error',
            description: jumpResult.message
          })
        ]
      });
    }

    const isVip = vipManager.isGuildVip(guildId);
    const confirmEmbed = statusEmbed({
      type: isVip ? 'vip' : 'info',
      description:
        `${formatPlayerEmoji('skip')} Pulando para **#${jumpResult.targetIndex} • ${jumpResult.targetSong.name}**!\n` +
        `${formatPlayerEmoji('queue')} **${jumpResult.skippedCount}** música(s) pulada(s) foram removida(s) da fila.`
    });
    return replyFn({ embeds: [confirmEmbed] });
  }

  /**
   * Controla o bloqueio VIP com aviso único, diferenciando slash commands (que exigem resposta)
   * e comandos de prefixo (que silenciam após o primeiro aviso).
   */
  function handleVipFeatureGate({ guildId, userId, isSlash, slashDescription, slashRepeatText, replyFn }) {
    if (vipManager.isGuildVip(guildId)) {
      return true;
    }

    if (isSlash) {
      if (warnedNonVipUsers.has(userId)) {
        replyFn({ content: slashRepeatText, ephemeral: true });
        return false;
      }
      warnedNonVipUsers.add(userId);
      replyFn({ embeds: [createVipLockedEmbed(slashDescription)], ephemeral: true });
      return false;
    }

    notifyNonVipOnce(userId, replyFn);
    return false;
  }

  /**
   * Lógica compartilhada de Skip (usada por !skip e /skip),
   * respeitando VIP (aviso único) e a trava de quem puxou o bot para a call.
   */
  async function handleSkipAction({
    guildId,
    userId,
    queue,
    leaveTarget,
    isSlash,
    slashDescription,
    slashRepeatText,
    replyFn,
    onPrefixSkipSuccess
  }) {
    if (!handleVipFeatureGate({ guildId, userId, isSlash, slashDescription, slashRepeatText, replyFn })) {
      return;
    }

    const ephemeralFlag = isSlash ? { ephemeral: true } : {};

    if (!queue) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
        ...ephemeralFlag
      });
    }

    // Trava: apenas quem puxou o bot para a call pode usar skip (mesmo no Autoplay)
    const skipDenial = voiceSession.getSkipDenialMessage(guildId, userId, queue);
    if (skipDenial) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: skipDenial })],
        ...ephemeralFlag
      });
    }

    const skippedSong = queue.songs?.[0];

    try {
      if (queue.songs.length <= 1 && !queue.autoplay) {
        await queue.stop();
        distube.voices.leave(leaveTarget);
        voiceSession.clearVoiceSummoner(guildId);
        return replyFn({
          embeds: [statusEmbed({ type: 'info', description: `${formatPlayerEmoji('stop')} Fim da fila. A reprodução foi encerrada.` })],
          ...ephemeralFlag
        });
      }

      queue._isSkipped = true;
      await queue.skip();
      if (isSlash) {
        const songLabel = skippedSong?.name ? `**${sanitizeLinkLabel(skippedSong.name, 70)}**` : 'a música atual';
        return replyFn({
          embeds: [statusEmbed({ type: 'vip', description: `${formatPlayerEmoji('skip')} Faixa pulada: ${songLabel}` })],
          ephemeral: true
        });
      }
      if (onPrefixSkipSuccess) {
        onPrefixSkipSuccess();
      }
    } catch (err) {
      queue._isSkipped = false;
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: `❌ Não foi possível pular: \`${truncateText(err.message || err, 180)}\`` })],
        ...ephemeralFlag
      });
    }
  }

  function handlePauseAction({ guildId, userId, queue, isSlash, replyFn }) {
    const allowed = handleVipFeatureGate({
      guildId,
      userId,
      isSlash,
      slashDescription:
        '⏸️ O comando de **Pausar Músicas (/pause)** faz parte dos comandos exclusivos **Chlorine VIP**!\n\n' +
        'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!',
      slashRepeatText: '🔒 Comando de pause exclusivo para servidores VIP.',
      replyFn
    });
    if (!allowed) return;

    const ephemeralFlag = isSlash ? { ephemeral: true } : {};
    if (!queue) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
        ...ephemeralFlag
      });
    }
    if (queue.paused) {
      const cmdHint = isSlash ? '`/resume`' : '`!resume`';
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: `⚠️ A música já está pausada! Use ${cmdHint} para continuar.` })],
        ...ephemeralFlag
      });
    }
    queue.pause();
    const currentSong = queue.songs?.[0];
    const songTitle = currentSong?.name ? `**${truncateText(currentSong.name, 65)}**\n` : '';
    const resumeHint = isSlash
      ? `Use \`/resume\` ou ${formatPlayerEmoji('play')} **Despausar** para continuar.`
      : `Use \`!resume\` ou ${formatPlayerEmoji('play')} **Despausar** para continuar.`;
    return replyFn({
      embeds: [statusEmbed({ type: 'vip', description: `${formatPlayerEmoji('pause')} **Reprodução pausada**\n${songTitle}${resumeHint}` })],
      ...ephemeralFlag
    });
  }

  function handleResumeAction({ guildId, userId, queue, isSlash, replyFn }) {
    const allowed = handleVipFeatureGate({
      guildId,
      userId,
      isSlash,
      slashDescription:
        `${formatPlayerEmoji('play')} O comando de **Retomar Músicas (/resume)** faz parte dos comandos exclusivos **Chlorine VIP**!\n\n` +
        'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!',
      slashRepeatText: '🔒 Comando de resume exclusivo para servidores VIP.',
      replyFn
    });
    if (!allowed) return;

    const ephemeralFlag = isSlash ? { ephemeral: true } : {};
    if (!queue) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
        ...ephemeralFlag
      });
    }
    if (!queue.paused) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '⚠️ A música já está tocando normalmente!' })],
        ...ephemeralFlag
      });
    }
    queue.resume();
    const currentSong = queue.songs?.[0];
    const songTitle = currentSong?.name ? `**${truncateText(currentSong.name, 65)}**` : 'Continuando a reprodução.';
    return replyFn({
      embeds: [statusEmbed({ type: 'vip', description: `${formatPlayerEmoji('play')} **Reprodução retomada**\n${songTitle}` })],
      ...ephemeralFlag
    });
  }

  async function handleQueueAction({ guildId, userId, queue, jumpArg = null, isSlash, replyFn }) {
    const allowed = handleVipFeatureGate({
      guildId,
      userId,
      isSlash,
      slashDescription:
        '📜 O comando de **Fila de Músicas (/queue)** faz parte dos comandos exclusivos **Chlorine VIP**!\n\n' +
        'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!',
      slashRepeatText: '🔒 Comando de fila exclusivo para servidores VIP.',
      replyFn
    });
    if (!allowed) return;

    if (!queue) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma fila de músicas ativa no momento!' })],
        ...(isSlash ? { ephemeral: true } : {})
      });
    }

    if (jumpArg !== null) {
      return handleNumericQueueJump(queue, guildId, userId, jumpArg, replyFn);
    }

    return replyFn(renderQueuePayload(guildId, queue));
  }

  async function handleInteractionVipGate(interaction, featureLabel) {
    if (vipManager.isGuildVip(interaction.guildId)) {
      return true;
    }
    if (warnedNonVipUsers.has(interaction.user.id)) {
      await interaction.deferUpdate().catch(() => {});
      return false;
    }
    warnedNonVipUsers.add(interaction.user.id);
    await interaction.reply({
      embeds: [
        createVipLockedEmbed(
          `O recurso de **${featureLabel}** faz parte da assinatura **Chlorine VIP**!\n` +
          'Digite `!vip` ou `/vip` para conhecer os planos e liberar para todo o servidor.'
        )
      ],
      ephemeral: true
    });
    return false;
  }

  function handleAutoplayAction({ guildId, userId, queue, isSlash, replyFn }) {
    const allowed = handleVipFeatureGate({
      guildId,
      userId,
      isSlash,
      slashDescription:
        '📻 O modo **Autoplay Automático** (músicas semelhantes infinitas) é um recurso exclusivo para servidores **Chlorine VIP**!\n\n' +
        'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!',
      slashRepeatText: '🔒 Modo Autoplay exclusivo para servidores VIP.',
      replyFn
    });
    if (!allowed) return;

    const ephemeralFlag = isSlash ? { ephemeral: true } : {};

    if (!queue) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
        ...ephemeralFlag
      });
    }

    const autoplay = queue.toggleAutoplay();
    const embed = statusEmbed({
      type: 'info',
      title: `Autoplay ${autoplay ? 'Ativado' : 'Desativado'}`,
      description: autoplay
        ? `${formatPlayerEmoji('autoplay')} O bot continuará tocando músicas recomendadas automaticamente ao fim da fila!`
        : `${formatPlayerEmoji('stop')} O autoplay foi desligado. O bot irá parar quando a fila terminar.`
    });
    return replyFn({ embeds: [embed], ...ephemeralFlag });
  }

  function handleVolumeAction({ guildId, userId, queue, volume, isSlash, replyFn }) {
    const allowed = handleVipFeatureGate({
      guildId,
      userId,
      isSlash,
      slashDescription:
        `${formatPlayerEmoji('volume')} O controle de **Volume Personalizado** (1% a 200%) é um recurso exclusivo para servidores **Chlorine VIP**!\n\n` +
        'Digite `/vip` ou `!vip` para liberar o volume para o seu servidor!',
      slashRepeatText: '🔒 Controle de volume exclusivo para servidores VIP.',
      replyFn
    });
    if (!allowed) return;

    const ephemeralFlag = isSlash ? { ephemeral: true } : {};
    if (!queue) {
      return replyFn({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
        ...ephemeralFlag
      });
    }

    if (Number.isNaN(volume) || volume < 1 || volume > 200) {
      const embed = statusEmbed({
        type: 'info',
        title: 'Controle de Volume',
        description:
          `${formatPlayerEmoji('volume')} ${createVolumeBar(queue.volume)}\n` +
          'Escolha um valor entre **1** e **200** *(ex: `!volume 120`)*.'
      });
      return replyFn({ embeds: [embed], ...ephemeralFlag });
    }

    queue.setVolume(volume);
    const embed = statusEmbed({
      type: 'info',
      title: 'Volume Ajustado',
      description: `${formatPlayerEmoji('volume')} ${createVolumeBar(volume)}`
    });
    return replyFn({ embeds: [embed], ...ephemeralFlag });
  }

  function createPlaySearchEmbed(query) {
    return statusEmbed({
      type: 'info',
      description: `${formatPlayerEmoji('headset')} Buscando **"${truncateText(query, 95)}"**...`
    });
  }

  /**
   * Monta o card de despedida exibido quando alguém retira o bot da chamada de voz (!leave / !stop / /stop / Parar).
   */
  function createLeavePayload() {
    const supportUrl = process.env.SUPPORT_SERVER_URL || DEFAULT_SUPPORT_URL;
    const bannerAsset = resolveAsset(assetsDir, ['banner.png', 'banner.jpg']);
    const files = bannerAsset.attachment ? [bannerAsset.attachment] : [];

    const embed = statusEmbed({
      type: 'info',
      description:
        'Obrigado por usar o nosso serviço!\n\n' +
        `Entre no nosso [**servidor de suporte**](${supportUrl}) para obter informações sobre atualizações, problemas e para discussões sobre os recursos do bot!`
    });

    if (bannerAsset.url) {
      embed.setImage(bannerAsset.url);
    }

    embed.setFooter({ text: 'Suas sugestões e opiniões são sempre consideradas!' });

    return { embeds: [embed], files };
  }

  /**
   * Trata todas as interações de Slash Commands (/).
   */
  async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

    if (interaction.channelId && activeClearChannels.has(interaction.channelId)) {
      return interaction.reply({
        embeds: [
          statusEmbed({
            type: 'error',
            description: '⏳ Já existe uma limpeza de chat em andamento neste canal. Aguarde finalizar para usar outro comando!'
          })
        ],
        ephemeral: true
      });
    }

    if (commandName === 'play') {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          embeds: [statusEmbed({ type: 'error', description: '❌ Você precisa entrar em um canal de voz primeiro!' })],
          ephemeral: true
        });
      }

      const query = normalizePlayQuery(interaction.options.getString('musica'));
      await interaction.reply({
        embeds: [createPlaySearchEmbed(query)],
        ephemeral: true
      });

      try {
        await playInVoiceChannel(interaction.guild, interaction.member, voiceChannel, query, {
          textChannel: interaction.channel
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
      } catch (err) {
        interaction.editReply({
          content: '',
          embeds: [
            statusEmbed({
              type: 'error',
              description: `❌ Ocorreu um erro ao buscar a música: \`${truncateText(err.message || err, 180)}\``
            })
          ]
        }).catch(() => {});
      }
      return;
    }

    if (commandName === 'skip') {
      return handleSkipAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        queue: distube.getQueue(interaction.guildId),
        leaveTarget: interaction.guildId,
        isSlash: true,
        slashDescription:
          '⏭️ O comando de **Pular Músicas (/skip)** faz parte dos comandos exclusivos **Chlorine VIP**!\n\n' +
          'Digite `/vip` ou `!vip` para conhecer os planos e liberar para o seu servidor!',
        slashRepeatText: '🔒 Comando exclusivo para servidores VIP.',
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'stop') {
      const queue = distube.getQueue(interaction.guildId);
      const targetChannel = queue?.textChannel || interaction.channel;
      if (queue) {
        await queue.stop().catch(() => {});
      }
      distube.voices.leave(interaction.guildId);
      voiceSession.clearVoiceSummoner(interaction.guildId);

      if (targetChannel?.send) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        await targetChannel.send(createLeavePayload()).catch(() => {});
        await interaction.deleteReply().catch(() => {});
        return;
      }
      return interaction.reply(createLeavePayload());
    }

    if (commandName === 'pause') {
      return handlePauseAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        queue: distube.getQueue(interaction.guildId),
        isSlash: true,
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'resume') {
      return handleResumeAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        queue: distube.getQueue(interaction.guildId),
        isSlash: true,
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'autoplay') {
      return handleAutoplayAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        queue: distube.getQueue(interaction.guildId),
        isSlash: true,
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'queue') {
      return handleQueueAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        queue: distube.getQueue(interaction.guildId),
        isSlash: true,
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'nowplaying') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({
          embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
          ephemeral: true
        });
      }
      return interaction.reply(createNowPlayingPayload(interaction.guildId, queue));
    }

    if (commandName === 'volume') {
      return handleVolumeAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        queue: distube.getQueue(interaction.guildId),
        volume: interaction.options.getInteger('nivel'),
        isSlash: true,
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'vip') {
      return interaction.reply(createVipEmbed(interaction.guildId, interaction.guild.name));
    }

    if (commandName === 'setvip') {
      if (!vipManager.isOwner(interaction.user.id)) {
        const embed = statusEmbed({
          type: 'error',
          authorName: 'CHLORINE VIP • SEGURANÇA',
          title: '⛔ Acesso Restrito ao Desenvolvedor',
          description: `Apenas o dono do bot (<@${vipManager.OWNER_ID}>) possui permissão para ativar chaves VIP manualmente.`
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const code = interaction.options.getString('codigo');
      const payload = createSetVipActivationPayload({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        code,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        commandPrefixLabel: '/'
      });
      return interaction.reply(
        payload.files ? payload : { ...payload, ephemeral: true }
      );
    }

    if (commandName === 'help') {
      return interaction.reply(createHelpPayload());
    }
  }

  /**
   * Trata interações gerais: Slash Commands, Menu de Seleção da Fila e Botões do Player.
   */
  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      return handleSlashCommand(interaction);
    }

    // Seleção de música na fila (!queue / /queue)
    if (interaction.isStringSelectMenu() && interaction.customId === 'queue_jump_select') {
      if (!(await handleInteractionVipGate(interaction, 'Fila (!queue)'))) {
        return;
      }

      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.update({
          embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma fila de músicas ativa no momento!' })],
          components: []
        }).catch(() => {});
      }

      const selectedValue = interaction.values?.[0] || '';
      const colonIdx = selectedValue.indexOf(':');
      const rawIndexStr = colonIdx >= 0 ? selectedValue.slice(0, colonIdx) : selectedValue;
      const songIdHint = colonIdx >= 0 ? selectedValue.slice(colonIdx + 1) : '';
      const rawPosition = parseInt(rawIndexStr, 10);

      const jumpResult = await executeQueueJump(
        queue,
        interaction.guildId,
        interaction.user.id,
        rawPosition,
        songIdHint || null
      );

      if (!jumpResult.ok) {
        if (jumpResult.stale) {
          return interaction.update(renderQueuePayload(interaction.guildId, queue, jumpResult.message)).catch(() => {});
        }
        return interaction.reply({
          embeds: [
            statusEmbed({
              type: 'error',
              description: jumpResult.message
            })
          ],
          ephemeral: true
        });
      }

      const notice = `${formatPlayerEmoji('skip')} Pulando para **${jumpResult.targetSong.name}** — **${jumpResult.skippedCount}** faixa(s) anterior(es) removida(s) da fila!`;
      return interaction.update(renderQueuePayload(interaction.guildId, queue, notice)).catch(() => {});
    }

    if (!interaction.isButton()) return;

    // Botão de Contato VIP legado
    if (interaction.customId === 'vip_contact_info') {
      const supportUrl = process.env.SUPPORT_SERVER_URL || DEFAULT_SUPPORT_URL;
      return interaction.reply({
        embeds: [
          statusEmbed({
            type: 'vip',
            description: `👑 Para contratar o seu plano VIP, entre no servidor oficial: **[discord.gg/6MFj275a3S](${supportUrl})**`
          })
        ],
        ephemeral: true
      });
    }

    if (!interaction.customId.startsWith('music_')) return;

    const [rawAction, buttonHostId] = interaction.customId.replace('music_', '').split(':');
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({
        embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })],
        ephemeral: true
      });
    }

    const activeHostId = voiceSession.resolveCallHostId(
      interaction.guildId,
      buttonHostId && buttonHostId !== 'open' ? buttonHostId : queue.songs[0]?.user?.id
    );

    // Trava de segurança: apenas quem puxou o bot para a call pode usar os botões (mesmo no Autoplay)
    if (activeHostId && interaction.user.id !== activeHostId) {
      return interaction.reply({
        content:
          rawAction === 'skip'
            ? `❌ Apenas quem puxou o bot para a call (<@${activeHostId}>) pode pular músicas!`
            : `❌ Apenas quem puxou o bot para a call (<@${activeHostId}>) pode usar estes botões!`,
        ephemeral: true
      });
    }

    // Pausar / Despausar (exclusivo VIP + aviso único)
    if (rawAction === 'pause') {
      if (!(await handleInteractionVipGate(interaction, 'Pausar / Retomar Músicas'))) {
        return;
      }

      const controllerId = activeHostId || buttonHostId;
      if (queue.paused) {
        queue.resume();
      } else {
        queue.pause();
      }
      const updatedCard = buildPlayerCardPayload(interaction.guildId, queue, {
        isSkipped: false,
        showLiveProgress: true
      });
      updatedCard.components = [createMusicRow(controllerId, Boolean(queue.paused))];
      await interaction.update(updatedCard).catch(() => {});
      return;
    }

    // Pular (exclusivo VIP + aviso único)
    if (rawAction === 'skip') {
      if (!(await handleInteractionVipGate(interaction, 'Pular Músicas'))) {
        return;
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
        console.error('[Botão Pular] Erro:', err?.message || err);
      }
      return;
    }

    // Parar
    if (rawAction === 'stop') {
      const targetChannel = queue?.textChannel || interaction.channel;
      await interaction.deferUpdate().catch(() => {});
      await queue.stop().catch(() => {});
      distube.voices.leave(interaction.guildId);
      voiceSession.clearVoiceSummoner(interaction.guildId);
      if (targetChannel?.send) {
        await targetChannel.send(createLeavePayload()).catch(() => {});
      }
    }
  }

  /**
   * Trata todas as mensagens de texto (@menção, resposta numérica na fila e comandos !).
   */
  async function handleMessage(message) {
    if (message.author.bot || !message.guild) return;

    // Resposta quando o bot é mencionado (@Chlorine Music™)
    if (message.mentions.has(client.user.id) && !message.mentions.everyone && !message.content.startsWith(PREFIX)) {
      return message.reply(createMentionPayload());
    }

    // Se o usuário responder (Reply) à mensagem da fila apenas com o número da música (ex: 3)
    const trimmedContent = message.content.trim();
    if (message.reference?.messageId && /^\d+$/.test(trimmedContent)) {
      const refMsg = await message.fetchReference().catch(() => null);
      if (
        refMsg &&
        refMsg.author?.id === client.user?.id &&
        refMsg.embeds?.[0]?.title?.includes('Fila de Reprodução')
      ) {
        if (!handleVipFeatureGate({ guildId: message.guild.id, userId: message.author.id, isSlash: false, replyFn: (payload) => message.reply(payload) })) {
          return;
        }
        const queue = distube.getQueue(message.guild.id);
        if (!queue) {
          return message.reply({
            embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma fila de músicas ativa no momento!' })]
          });
        }
        return handleNumericQueueJump(queue, message.guild.id, message.author.id, trimmedContent, (payload) =>
          message.reply(payload)
        );
      }
    }

    // Ignora mensagens que não comecem com o prefixo
    if (!message.content.startsWith(PREFIX)) return;

    const withoutPrefix = message.content.slice(PREFIX.length).trim();
    if (!withoutPrefix) return;

    const args = withoutPrefix.split(/ +/g);
    const command = args.shift().toLowerCase();

    // Impede qualquer outro comando no canal enquanto uma limpeza !clear estiver em andamento
    const channelId = message.channel?.id;
    if (channelId && activeClearChannels.has(channelId)) {
      const waitMsg = await message.reply({
        embeds: [
          statusEmbed({
            type: 'error',
            description: '⏳ Já existe uma limpeza de chat em andamento neste canal. Aguarde finalizar para usar outro comando!'
          })
        ]
      }).catch(() => null);
      if (clearAutoDeleteMs > 0) {
        setTimeout(() => {
          waitMsg?.delete?.().catch(() => {});
          message.delete?.().catch(() => {});
        }, Math.min(clearAutoDeleteMs, 4000)).unref?.();
      }
      return;
    }

    // COMANDO ADMIN: !clear <1-500> (ou !limpar)
    if (command === 'clear' || command === 'limpar') {
      const isAdmin = Boolean(
        message.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        (message.guild?.ownerId && message.guild.ownerId === message.author?.id)
      );
      if (!isAdmin) {
        return message.reply({
          embeds: [
            statusEmbed({
              type: 'error',
              description: '⛔ Apenas administradores do servidor podem usar o comando `!clear`!'
            })
          ]
        });
      }

      const botPerms = message.guild?.members?.me?.permissionsIn?.(message.channel);
      if (botPerms && typeof botPerms.has === 'function') {
        if (
          !botPerms.has(PermissionFlagsBits.ManageMessages) ||
          !botPerms.has(PermissionFlagsBits.ReadMessageHistory)
        ) {
          return message.reply({
            embeds: [
              statusEmbed({
                type: 'error',
                description: '❌ Preciso das permissões **Gerenciar Mensagens** e **Ver Histórico de Mensagens** neste canal!'
              })
            ]
          });
        }
      }

      const rawCount = (args[0] || '').trim();
      const amount = /^\d+$/.test(rawCount) ? parseInt(rawCount, 10) : NaN;
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_CLEAR_MESSAGES) {
        return message.reply({
          embeds: [
            statusEmbed({
              type: 'error',
              description: `❌ Informe uma quantidade válida entre **1** e **${MAX_CLEAR_MESSAGES}** mensagens!\n> Exemplo: \`!clear 50\``
            })
          ]
        });
      }

      if (!message.channel?.messages?.fetch || typeof message.channel?.bulkDelete !== 'function') {
        return message.reply({
          embeds: [statusEmbed({ type: 'error', description: '❌ Não foi possível limpar mensagens neste canal.' })]
        });
      }

      if (channelId) {
        activeClearChannels.add(channelId);
      }

      let deletedTotal = 0;
      let skippedOldMessages = 0;

      try {
        let beforeId = message.id;
        await message.delete?.().catch(() => {});

        let remaining = amount;
        while (remaining > 0) {
          const toFetch = Math.min(remaining, 100);
          const fetched = await message.channel.messages.fetch({
            limit: toFetch,
            ...(beforeId ? { before: beforeId } : {})
          });

          const batch = fetched ? Array.from(fetched.values()) : [];
          if (batch.length === 0) break;

          beforeId = batch[batch.length - 1]?.id || beforeId;
          const now = Date.now();
          const deletable = batch.filter(
            (m) => !m.createdTimestamp || now - m.createdTimestamp < BULK_DELETE_MAX_AGE_MS
          );
          const oldInBatch = batch.length - deletable.length;
          if (oldInBatch > 0) {
            skippedOldMessages += oldInBatch;
          }

          if (deletable.length === 0) {
            break;
          }

          const bulkResult = await message.channel.bulkDelete(deletable, true);
          const batchDeleted =
            bulkResult && typeof bulkResult.size === 'number' && bulkResult.size > 0
              ? bulkResult.size
              : deletable.length;

          deletedTotal += batchDeleted;
          remaining -= batchDeleted;

          if (batch.length < toFetch || oldInBatch > 0) {
            break;
          }

          if (remaining > 0 && clearBatchDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, clearBatchDelayMs));
          }
        }

        const summaryEmbed =
          deletedTotal > 0
            ? statusEmbed({
                type: 'info',
                title: 'Chat Limpo',
                description:
                  `${formatPlayerEmoji('bolt')} **${deletedTotal}** mensagem(ns) removida(s) por ${message.author}.` +
                  (skippedOldMessages > 0
                    ? '\n> ⚠️ Mensagens com mais de **14 dias** não puderam ser apagadas (limite do Discord).'
                    : '')
              })
            : statusEmbed({
                type: skippedOldMessages > 0 ? 'error' : 'info',
                description:
                  skippedOldMessages > 0
                    ? '⚠️ Nenhuma mensagem pôde ser apagada porque todas têm mais de **14 dias** (limite do Discord).'
                    : '✨ Não havia mensagens anteriores para apagar neste canal.'
              });

        const confirmMsg = await message.channel.send({ embeds: [summaryEmbed] }).catch(() => null);
        if (confirmMsg?.delete && clearAutoDeleteMs > 0) {
          setTimeout(() => confirmMsg.delete().catch(() => {}), clearAutoDeleteMs).unref?.();
        }
      } catch (err) {
        console.error('[!clear] Erro:', err?.message || err);
        await message.channel
          .send({
            embeds: [
              statusEmbed({
                type: 'error',
                description: `❌ Não foi possível concluir a limpeza do chat: \`${truncateText(err.message || err, 180)}\``
              })
            ]
          })
          .catch(() => {});
      } finally {
        if (channelId) {
          activeClearChannels.delete(channelId);
        }
      }
      return;
    }

    // COMANDO: !play (ou !p)
    if (command === 'play' || command === 'p') {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          embeds: [statusEmbed({ type: 'error', description: '❌ Você precisa entrar em um canal de voz primeiro!' })]
        });
      }

      const query = normalizePlayQuery(args.join(' '));
      if (!query) {
        return message.reply({
          embeds: [
            statusEmbed({
              type: 'error',
              description: '❌ Por favor, digite o nome ou o link da música!\nExemplo: `!play bohemian rhapsody`'
            })
          ]
        });
      }

      const searchMsg = await message.channel.send({
        embeds: [createPlaySearchEmbed(query)]
      });

      try {
        await playInVoiceChannel(message.guild, message.member, voiceChannel, query, {
          textChannel: message.channel,
          message
        });
        setTimeout(() => searchMsg.delete().catch(() => {}), 2000);
      } catch (err) {
        console.error('[!play] Erro:', err?.message || err);
        searchMsg.edit({
          embeds: [
            statusEmbed({
              type: 'error',
              description: `❌ Ocorreu um erro ao buscar a música: \`${truncateText(err.message || err, 180)}\``
            })
          ]
        }).catch(() => {});
      }
      return;
    }

    // COMANDO: !skip (ou !s, !pular, !next)
    if (['skip', 's', 'pular', 'next'].includes(command)) {
      return handleSkipAction({
        guildId: message.guild.id,
        userId: message.author.id,
        queue: distube.getQueue(message),
        leaveTarget: message,
        isSlash: false,
        replyFn: (payload) => message.reply(payload),
        onPrefixSkipSuccess: () => message.react('⏭️').catch(() => {})
      });
    }

    // COMANDO: !stop (ou !parar, !leave, !sair)
    if (['stop', 'parar', 'leave', 'sair'].includes(command)) {
      const queue = distube.getQueue(message);
      const voice = distube.voices.get(message);

      if (!queue && !voice) {
        return message.reply({
          embeds: [statusEmbed({ type: 'error', description: '❌ O bot não está em nenhum canal de voz no momento!' })]
        });
      }

      const targetChannel = queue?.textChannel || message.channel;
      if (queue) {
        await queue.stop().catch(() => {});
      }
      distube.voices.leave(message);
      voiceSession.clearVoiceSummoner(message.guild.id);
      return targetChannel.send(createLeavePayload());
    }

    // COMANDO: !pause (ou !pausar)
    if (['pause', 'pausar'].includes(command)) {
      return handlePauseAction({
        guildId: message.guild.id,
        userId: message.author.id,
        queue: distube.getQueue(message),
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !resume (ou !despausar, !continuar, !unpause)
    if (['resume', 'despausar', 'continuar', 'unpause'].includes(command)) {
      return handleResumeAction({
        guildId: message.guild.id,
        userId: message.author.id,
        queue: distube.getQueue(message),
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !queue (ou !fila, !q) — aceita também !queue <número> para pular direto
    if (['queue', 'fila', 'q'].includes(command)) {
      return handleQueueAction({
        guildId: message.guild.id,
        userId: message.author.id,
        queue: distube.getQueue(message),
        jumpArg: args.length > 0 ? args[0] : null,
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !nowplaying (ou !np, !tocando)
    if (['nowplaying', 'np', 'tocando'].includes(command)) {
      const queue = distube.getQueue(message);
      if (!queue) {
        return message.reply({
          embeds: [statusEmbed({ type: 'error', description: '❌ Nenhuma música está tocando no momento!' })]
        });
      }
      return message.reply(createNowPlayingPayload(message.guild.id, queue));
    }

    // COMANDO: !volume (ou !vol, !v)
    if (['volume', 'vol', 'v'].includes(command)) {
      return handleVolumeAction({
        guildId: message.guild.id,
        userId: message.author.id,
        queue: distube.getQueue(message),
        volume: parseInt(args[0], 10),
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !autoplay (ou !ap, !auto)
    if (['autoplay', 'ap', 'auto'].includes(command)) {
      return handleAutoplayAction({
        guildId: message.guild.id,
        userId: message.author.id,
        queue: distube.getQueue(message),
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !vip (ou !premium)
    if (['vip', 'premium'].includes(command)) {
      return message.reply(createVipEmbed(message.guild.id, message.guild.name));
    }

    // COMANDO SECRETO: !setvip ou !vipset (Somente o dono — totalmente invisível para outros usuários)
    if (['setvip', 'vipset'].includes(command)) {
      if (!vipManager.isOwner(message.author.id)) {
        return;
      }

      const code = args[0];
      if (!code) {
        return message.reply({
          embeds: [
            statusEmbed({
              type: 'vip',
              authorName: 'CHLORINE VIP • ATIVAÇÃO',
              title: '⚠️ Código VIP Não Informado',
              description:
                'Informe o código gerado no painel web do bot.\n\n' +
                '> **Exemplo:** `!setvip CHLORINE-VIP-30D-XXXX-YYYY`'
            })
          ]
        });
      }

      const payload = createSetVipActivationPayload({
        guildId: message.guild.id,
        guildName: message.guild.name,
        code,
        userId: message.author.id,
        userTag: message.author.tag,
        commandPrefixLabel: '!'
      });
      return message.reply(payload);
    }

    // COMANDO: !help (ou !ajuda, !comandos, !h)
    if (['help', 'ajuda', 'comandos', 'h'].includes(command)) {
      return message.reply(createHelpPayload());
    }
  }

  /**
   * Monta os cards automáticos do DisTube (addSong / addList) usando o mesmo padrão visual.
   */
  function buildAddedSongEmbed(queue, song) {
    return createAddedSongEmbed({
      queue,
      song,
      isVip: vipManager.isGuildVip(queue.id),
      botUserId: client.user?.id || null,
      botAvatarUrl: getBotAvatarUrl(),
      formatEmoji: formatPlayerEmoji
    });
  }

  function buildAddedListEmbed(queue, playlist) {
    const voiceChannelName =
      queue.voiceChannel?.name || distube.voices.get(queue.id)?.channel?.name || null;
    return createAddedListEmbed({
      queue,
      playlist,
      isVip: vipManager.isGuildVip(queue.id),
      voiceChannelName,
      botAvatarUrl: getBotAvatarUrl(),
      formatEmoji: formatPlayerEmoji
    });
  }

  /**
   * Conecta os listeners de interações e mensagens ao client do Discord.
   */
  function registerCommandListeners() {
    client.on('interactionCreate', handleInteraction);
    client.on('messageCreate', handleMessage);
  }

  return {
    PREFIX,
    EMBED_COLOR,
    GOLD_COLOR,
    slashCommands,
    warnedNonVipUsers,
    activeClearChannels,
    statusEmbed,
    createMusicRow,
    buildPlayerCardPayload,
    buildAddedSongEmbed,
    buildAddedListEmbed,
    createVipEmbed,
    createHelpPayload,
    createMentionPayload,
    createLeavePayload,
    createNowPlayingPayload,
    registerCommandListeners,
    handleInteraction,
    handleMessage
  };
}

module.exports = {
  PREFIX,
  EMBED_COLOR,
  GOLD_COLOR,
  slashCommands,
  createCommandsModule
};
