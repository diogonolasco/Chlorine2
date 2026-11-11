const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require('discord.js');
const { buildQueueMessagePayload, jumpToQueuePosition } = require('./src/queueHelper');

// Prefixo padrão dos comandos de texto
const PREFIX = '!';

// Cores oficiais dos embeds
const EMBED_COLOR = 0x00D8E6; // Cyan Neon
const GOLD_COLOR = 0xFFD700;  // Dourado VIP

const FOOTER_TEXT = '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7';
const DEFAULT_SUPPORT_URL = 'https://discord.gg/6MFj275a3S';

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
function createCommandsModule({ client, distube, vipManager, voiceSession, rootDir = __dirname }) {
  if (!client || !distube || !vipManager || !voiceSession) {
    throw new Error('createCommandsModule requer client, distube, vipManager e voiceSession.');
  }

  const assetsDir = path.join(rootDir, 'assets');

  // Controle de aviso único para usuários que tentam comandos bloqueados sem VIP
  // Notifica o usuário APENAS UMA VEZ sobre comprar VIP; tentativas posteriores não repetem o anúncio
  const warnedNonVipUsers = new Set();

  function createVipLockedEmbed(description) {
    return new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🔒 Comando Exclusivo VIP!')
      .setDescription(description)
      .setFooter({ text: FOOTER_TEXT });
  }

  function notifyNonVipOnce(userId, replyFn, description) {
    if (warnedNonVipUsers.has(userId)) {
      return false;
    }
    warnedNonVipUsers.add(userId);
    const defaultDescription =
      'Os comandos **!skip**, **!volume** e **!autoplay** são exclusivos para servidores com plano **Chlorine VIP**!\n\n' +
      'Digite **!vip** ou use **/vip** para conhecer os planos e liberar para o seu servidor!';
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
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`music_skip:${hostTag}`)
        .setLabel('Pular')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`music_stop:${hostTag}`)
        .setLabel('Parar')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  /**
   * Monta o embed completo do comando !vip / /vip conforme o status VIP do servidor.
   */
  function createVipEmbed(guildId, guildName) {
    const isVip = vipManager.isGuildVip(guildId);
    const vipInfo = vipManager.getGuildVipInfo(guildId);
    const iconAsset = resolveAsset(assetsDir, ['iconepremium.png', 'chlorine_gold.webp']);
    const files = iconAsset.attachment ? [iconAsset.attachment] : [];

    const supportUrl = process.env.SUPPORT_SERVER_URL || DEFAULT_SUPPORT_URL;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Entrar no Servidor Oficial')
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl)
        .setEmoji('👑')
    );

    if (isVip && vipInfo) {
      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle('👑 Chlorine Music™ VIP • Status do Servidor')
        .setDescription(
          `🎉 Parabéns! O servidor **${guildName}** possui o plano **Chlorine VIP Ativo**!\n` +
          'Aproveite recursos de áudio ilimitados e qualidade de som máxima sem nenhuma restrição.'
        )
        .addFields(
          { name: '🏷️ Plano Contratado', value: `> **${vipInfo.planName}**`, inline: true },
          { name: '⏱️ Tempo Restante', value: `> **${vipInfo.formattedRemaining}**`, inline: true },
          { name: '📅 Válido Até', value: `> **${vipInfo.formattedExpiresAt}**`, inline: true },
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
          text: FOOTER_TEXT,
          iconURL: iconAsset.url || undefined
        });

      if (iconAsset.url) {
        embed.setThumbnail(iconAsset.url);
      }
      return { embeds: [embed], files, components: [row] };
    }

    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('👑 Chlorine Music™ VIP • Eleve sua Experiência Sonora')
      .setDescription(
        `O servidor **${guildName}** ainda não possui um plano **Chlorine VIP**.\n` +
        'Desbloqueie recursos de ponta, reprodução contínua e qualidade sonora de alta fidelidade para todos os membros!'
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
            `Para adquirir o seu VIP, entre no nosso servidor oficial: **[discord.gg/6MFj275a3S](${supportUrl})**!\n` +
            'A ativação no seu servidor é imediata pela equipe oficial após a confirmação!'
          ),
          inline: false
        }
      )
      .setFooter({
        text: FOOTER_TEXT,
        iconURL: iconAsset.url || undefined
      });

    if (iconAsset.url) {
      embed.setThumbnail(iconAsset.url);
    }
    return { embeds: [embed], files, components: [row] };
  }

  /**
   * Monta o painel principal de ajuda (/help e !help).
   */
  function createHelpPayload() {
    const logoAsset = resolveAsset(assetsDir, ['logo.png', 'logo.jpg']);
    const files = logoAsset.attachment ? [logoAsset.attachment] : [];
    const avatarUrl = client.user?.displayAvatarURL?.();
    const iconUrl = logoAsset.url || avatarUrl || undefined;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({
        name: 'Chlorine Music™ • Central de Ajuda & Comandos',
        iconURL: iconUrl
      })
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
            '> 📜 **!queue [nº]** • Ver fila e pular para uma música',
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
        text: FOOTER_TEXT,
        iconURL: iconUrl
      });

    if (iconUrl) {
      embed.setThumbnail(iconUrl);
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
    const avatarUrl = client.user?.displayAvatarURL?.();
    const iconUrl = logoAsset.url || avatarUrl || undefined;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({
        name: 'Chlorine Music™',
        iconURL: iconUrl
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
      .setFooter({ text: FOOTER_TEXT });

    if (iconUrl) {
      embed.setThumbnail(iconUrl);
    }
    if (bannerAsset.url) {
      embed.setImage(bannerAsset.url);
    }

    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Me adicione ao seu servidor')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl)
    );

    return { embeds: [embed], components: [row], files };
  }

  /**
   * Monta o card "Tocando Agora" do comando /nowplaying e !nowplaying.
   */
  function createNowPlayingPayload(guildId, queue) {
    const isVip = vipManager.isGuildVip(guildId);
    const song = queue.songs[0];
    const requesterInfo = voiceSession.formatSongRequesterInfo(queue, song);
    const controllerId = voiceSession.resolveCallHostId(guildId, song.user?.id);
    const embed = new EmbedBuilder()
      .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
      .setTitle(isVip ? '👑 Tocando Agora • VIP' : '🎵 Tocando Agora')
      .setDescription(`**[${song.name}](${song.url})**\n\n**Duração:** \`${queue.formattedCurrentTime} / ${song.formattedDuration}\` • ${requesterInfo}`);

    if (song.thumbnail) {
      embed.setThumbnail(song.thumbnail);
    }

    const row = createMusicRow(controllerId, queue.paused);
    return { embeds: [embed], components: [row] };
  }

  /**
   * Gera a resposta de ativação de código VIP (usada pelo comando secreto do dono).
   */
  function createSetVipActivationPayload({ guildId, guildName, code, userId, userTag, commandPrefixLabel }) {
    const result = vipManager.activateVipWithKey(guildId, guildName, code, userId);

    if (!result.success) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(GOLD_COLOR)
            .setTitle('❌ Falha na Ativação')
            .setDescription(result.message)
        ]
      };
    }

    const goldAsset = resolveAsset(assetsDir, ['chlorine_gold.webp']);
    const files = goldAsset.attachment ? [goldAsset.attachment] : [];

    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🎉 VIP ATIVADO COM SUCESSO!')
      .setDescription(`O servidor **${guildName}** agora é **Chlorine VIP**! 👑`)
      .addFields(
        { name: '💎 Plano Ativado', value: `> **${result.guildVip.planName}**`, inline: true },
        { name: '⏱️ Duração', value: `> **${result.guildVip.durationDays} dias**`, inline: true },
        { name: '📅 Vencimento', value: `> **${result.guildVip.formattedExpiresAt}**`, inline: true },
        {
          name: '🔓 Comandos Liberados Imediatamente',
          value: [
            `> 📻 **${commandPrefixLabel}autoplay** • Músicas automáticas infinitas!`,
            `> 🔊 **${commandPrefixLabel}volume <1-200>** • Controle de volume amplificado HD!`,
            `> ⏭️ **${commandPrefixLabel}skip** • Pule músicas sem restrição!`
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({
        text: `Código ${code} resgatado por ${userTag}`,
        iconURL: goldAsset.url || undefined
      });

    if (goldAsset.url) {
      embed.setThumbnail(goldAsset.url);
    }

    return { embeds: [embed], files };
  }

  async function playInVoiceChannel(guild, member, voiceChannel, query, extraOptions = {}) {
    return voiceSession.playWithSummonerTracking(
      guild,
      member,
      () => distube.play(voiceChannel, query, { member, ...extraOptions }),
      (guildId) => Boolean(distube.getQueue(guildId) || distube.voices.get(guildId))
    );
  }

  function renderQueuePayload(guildId, queue, notice = null) {
    return buildQueueMessagePayload(queue, {
      isVip: vipManager.isGuildVip(guildId),
      embedColor: EMBED_COLOR,
      goldColor: GOLD_COLOR,
      notice
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
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription('❌ Informe um número válido da fila! Exemplo: `!queue 3`');
      return replyFn({ embeds: [embed] });
    }

    const requestedNumber = parseInt(numStr, 10);
    const jumpResult = await executeQueueJump(queue, guildId, userId, requestedNumber);
    if (!jumpResult.ok) {
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(jumpResult.message);
      return replyFn({ embeds: [embed] });
    }

    const confirmEmbed = new EmbedBuilder()
      .setColor(vipManager.isGuildVip(guildId) ? GOLD_COLOR : EMBED_COLOR)
      .setDescription(
        `⏭️ Pulando para **#${jumpResult.targetIndex} • ${jumpResult.targetSong.name}**!\n` +
        `🗑️ **${jumpResult.skippedCount}** música(s) pulada(s) foram excluída(s) da fila.`
      );
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

    if (!queue) {
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!')],
        ...(isSlash ? { ephemeral: true } : {})
      });
    }

    // Trava: apenas quem puxou o bot para a call pode usar skip (mesmo no Autoplay)
    const skipDenial = voiceSession.getSkipDenialMessage(guildId, userId, queue);
    if (skipDenial) {
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(skipDenial)],
        ...(isSlash ? { ephemeral: true } : {})
      });
    }

    try {
      if (queue.songs.length <= 1 && !queue.autoplay) {
        await queue.stop();
        distube.voices.leave(leaveTarget);
        voiceSession.clearVoiceSummoner(guildId);
        return replyFn({
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ Fim da fila. A reprodução foi encerrada.')],
          ...(isSlash ? { ephemeral: true } : {})
        });
      }

      queue._isSkipped = true;
      await queue.skip();
      if (isSlash) {
        return replyFn({
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏭️ **Música pulada com sucesso!**')],
          ephemeral: true
        });
      }
      if (onPrefixSkipSuccess) {
        onPrefixSkipSuccess();
      }
    } catch (err) {
      queue._isSkipped = false;
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`❌ Não foi possível pular: ${err.message || err}`)],
        ...(isSlash ? { ephemeral: true } : {})
      });
    }
  }

  function handlePauseAction({ queue, isSlash, replyFn }) {
    const ephemeralFlag = isSlash ? { ephemeral: true } : {};
    if (!queue) {
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!')],
        ...ephemeralFlag
      });
    }
    if (queue.paused) {
      const cmdHint = isSlash ? '`/resume`' : '`!resume`';
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`⚠️ A música já está pausada! Use ${cmdHint} para continuar.`)],
        ...ephemeralFlag
      });
    }
    queue.pause();
    const pausedText = isSlash ? '⏸️ **Música pausada.**' : '⏸️ **Música pausada.** Use `!resume` para continuar.';
    return replyFn({
      embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(pausedText)],
      ...ephemeralFlag
    });
  }

  function handleResumeAction({ queue, isSlash, replyFn }) {
    const ephemeralFlag = isSlash ? { ephemeral: true } : {};
    if (!queue) {
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!')],
        ...ephemeralFlag
      });
    }
    if (!queue.paused) {
      return replyFn({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⚠️ A música já está tocando normalmente!')],
        ...ephemeralFlag
      });
    }
    queue.resume();
    const resumedText = isSlash ? '▶️ **Música despausada!**' : '▶️ **Música despausada!** Continuando a reprodução.';
    return replyFn({
      embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(resumedText)],
      ...ephemeralFlag
    });
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

    if (!queue) {
      if (isSlash) {
        return replyFn({ content: '❌ Nenhuma música está tocando no momento!', ephemeral: true });
      }
      return replyFn({
        embeds: [new EmbedBuilder().setColor(GOLD_COLOR).setDescription('❌ Nenhuma música está tocando no momento!')]
      });
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
    return replyFn({ embeds: [embed] });
  }

  function handleVolumeAction({ guildId, userId, queue, volume, isSlash, replyFn }) {
    const allowed = handleVipFeatureGate({
      guildId,
      userId,
      isSlash,
      slashDescription:
        '🔊 O controle de **Volume Personalizado** (1% a 200%) é um recurso exclusivo para servidores **Chlorine VIP**!\n\n' +
        'Digite `/vip` ou `!vip` para liberar o volume para o seu servidor!',
      slashRepeatText: '🔒 Controle de volume exclusivo para servidores VIP.',
      replyFn
    });
    if (!allowed) return;

    const ephemeralFlag = isSlash ? { ephemeral: true } : {};
    if (!queue) {
      return replyFn({
        embeds: [new EmbedBuilder().setColor(GOLD_COLOR).setDescription('❌ Nenhuma música está tocando no momento!')],
        ...ephemeralFlag
      });
    }

    if (Number.isNaN(volume) || volume < 1 || volume > 200) {
      const embed = new EmbedBuilder()
        .setColor(GOLD_COLOR)
        .setTitle('🔊 Ajuste de Volume (VIP 👑)')
        .setDescription(
          `O volume atual é **${queue.volume}%**.\n\n` +
          'Para alterar, digite um valor entre **1** e **200**.\n' +
          '> Exemplo: `!volume 120` *(ou `!vol 150` / `!v 80`)*'
        );
      return replyFn({ embeds: [embed], ...ephemeralFlag });
    }

    queue.setVolume(volume);
    return replyFn({
      embeds: [new EmbedBuilder().setColor(GOLD_COLOR).setDescription(`🔊 Volume ajustado para **${volume}%** com sucesso! 👑`)],
      ...ephemeralFlag
    });
  }

  /**
   * Trata todas as interações de Slash Commands (/).
   */
  async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

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
        await playInVoiceChannel(interaction.guild, interaction.member, voiceChannel, query, {
          textChannel: interaction.channel
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
      } catch (err) {
        interaction.editReply(`❌ Ocorreu um erro ao buscar a música: ${err.message || err}`).catch(() => {});
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
      if (queue) {
        await queue.stop().catch(() => {});
      }
      distube.voices.leave(interaction.guildId);
      voiceSession.clearVoiceSummoner(interaction.guildId);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ **Música parada e saí da chamada de voz com sucesso!** 👋')],
        ephemeral: true
      });
    }

    if (commandName === 'pause') {
      return handlePauseAction({
        queue: distube.getQueue(interaction.guildId),
        isSlash: true,
        replyFn: (payload) => interaction.reply(payload)
      });
    }

    if (commandName === 'resume') {
      return handleResumeAction({
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
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({ content: '❌ Nenhuma fila de músicas ativa no momento!', ephemeral: true });
      }
      return interaction.reply(renderQueuePayload(interaction.guildId, queue));
    }

    if (commandName === 'nowplaying') {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.reply({ content: '❌ Nenhuma música está tocando no momento!', ephemeral: true });
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
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('⛔ Acesso Restrito ao Desenvolvedor')
          .setDescription(`Apenas o dono do bot (<@${vipManager.OWNER_ID}>) possui permissão para usar este comando e ativar planos VIP com código!`);
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
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) {
        return interaction.update({
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma fila de músicas ativa no momento!')],
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
        return interaction.reply({ content: jumpResult.message, ephemeral: true });
      }

      const notice = `⏭️ Pulando para **${jumpResult.targetSong.name}** — **${jumpResult.skippedCount}** faixa(s) anterior(es) removida(s) da fila!`;
      return interaction.update(renderQueuePayload(interaction.guildId, queue, notice)).catch(() => {});
    }

    if (!interaction.isButton()) return;

    // Botão de Contato VIP legado
    if (interaction.customId === 'vip_contact_info') {
      const supportUrl = process.env.SUPPORT_SERVER_URL || DEFAULT_SUPPORT_URL;
      return interaction.reply({
        content: `👑 Para contratar o seu plano VIP, entre no servidor oficial da Chlorine: **${supportUrl}**!`,
        ephemeral: true
      });
    }

    if (!interaction.customId.startsWith('music_')) return;

    const [rawAction, buttonHostId] = interaction.customId.replace('music_', '').split(':');
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({
        content: '❌ Nenhuma música está tocando no momento!',
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

    // Pausar / Despausar
    if (rawAction === 'pause') {
      const controllerId = activeHostId || buttonHostId;
      if (queue.paused) {
        queue.resume();
        const row = createMusicRow(controllerId, false);
        await interaction.update({ components: [row] }).catch(() => {});
      } else {
        queue.pause();
        const row = createMusicRow(controllerId, true);
        await interaction.update({ components: [row] }).catch(() => {});
      }
      return;
    }

    // Pular (exclusivo VIP + aviso único)
    if (rawAction === 'skip') {
      if (!vipManager.isGuildVip(interaction.guildId)) {
        if (warnedNonVipUsers.has(interaction.user.id)) {
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

    // Parar
    if (rawAction === 'stop') {
      await interaction.deferUpdate().catch(() => {});
      await queue.stop().catch(() => {});
      distube.voices.leave(interaction.guildId);
      voiceSession.clearVoiceSummoner(interaction.guildId);
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
        refMsg.embeds?.[0]?.title?.startsWith('🎶 Fila de Reprodução')
      ) {
        const queue = distube.getQueue(message.guild.id);
        if (!queue) {
          return message.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma fila de músicas ativa no momento!')]
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

    // COMANDO: !play (ou !p)
    if (command === 'play' || command === 'p') {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Você precisa entrar em um canal de voz primeiro!')]
        });
      }

      const query = args.join(' ');
      if (!query) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(EMBED_COLOR)
              .setDescription('❌ Por favor, digite o nome ou o link da música!\nExemplo: `!play bohemian rhapsody`')
          ]
        });
      }

      const searchEmbed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`🔍 Buscando **"${query}"**...`);
      const searchMsg = await message.channel.send({ embeds: [searchEmbed] });

      try {
        await playInVoiceChannel(message.guild, message.member, voiceChannel, query, {
          textChannel: message.channel,
          message
        });
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
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ O bot não está em nenhum canal de voz no momento!')]
        });
      }

      if (queue) {
        await queue.stop().catch(() => {});
      }
      distube.voices.leave(message);
      voiceSession.clearVoiceSummoner(message.guild.id);
      return message.reply({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('⏹️ **Música parada e saí da chamada de voz com sucesso!** 👋')]
      });
    }

    // COMANDO: !pause (ou !pausar)
    if (['pause', 'pausar'].includes(command)) {
      return handlePauseAction({
        queue: distube.getQueue(message),
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !resume (ou !despausar, !continuar, !unpause)
    if (['resume', 'despausar', 'continuar', 'unpause'].includes(command)) {
      return handleResumeAction({
        queue: distube.getQueue(message),
        isSlash: false,
        replyFn: (payload) => message.reply(payload)
      });
    }

    // COMANDO: !queue (ou !fila, !q) — aceita também !queue <número> para pular direto
    if (['queue', 'fila', 'q'].includes(command)) {
      const queue = distube.getQueue(message);
      if (!queue) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma fila de músicas ativa no momento!')]
        });
      }

      if (args.length > 0) {
        return handleNumericQueueJump(queue, message.guild.id, message.author.id, args[0], (payload) =>
          message.reply(payload)
        );
      }

      return message.reply(renderQueuePayload(message.guild.id, queue));
    }

    // COMANDO: !nowplaying (ou !np, !tocando)
    if (['nowplaying', 'np', 'tocando'].includes(command)) {
      const queue = distube.getQueue(message);
      if (!queue) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription('❌ Nenhuma música está tocando no momento!')]
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
        const embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('⚠️ Código VIP Não Informado')
          .setDescription(
            'Por favor, informe o código gerado no painel web do bot.\n\n' +
            '**Exemplo de uso:**\n`!setvip CHLORINE-VIP-30D-XXXX-YYYY`'
          );
        return message.reply({ embeds: [embed] });
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
    createMusicRow,
    createVipEmbed,
    createHelpPayload,
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
