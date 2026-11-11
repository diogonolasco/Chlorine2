/**
 * Gerenciador de responsável pela chamada de voz ("quem puxou o bot para a call").
 * Garante que apenas quem puxou o bot tenha controle total para pular músicas,
 * mesmo quando outros membros adicionam faixas ou quando o Autoplay está ativo.
 */
function createVoiceSessionManager({ getBotVoiceChannel, getActiveQueue, getBotUserId }) {
  const voiceSummoners = new Map();

  function getVoiceSummoner(guildId) {
    return voiceSummoners.get(guildId) || null;
  }

  function clearVoiceSummoner(guildId) {
    voiceSummoners.delete(guildId);
  }

  function ensureVoiceSummoner(guild, member) {
    if (!guild || !member?.id || member.user?.bot) {
      return getVoiceSummoner(guild?.id);
    }

    const existingSummonerId = voiceSummoners.get(guild.id);
    const botVoiceChannel = getBotVoiceChannel(guild);
    const activeQueue = getActiveQueue(guild.id);

    if (!existingSummonerId || !botVoiceChannel) {
      voiceSummoners.set(guild.id, member.id);
      return member.id;
    }

    // Se a fila anterior já terminou e o antigo responsável saiu da call, quem chamou assume
    if (!activeQueue && !botVoiceChannel.members?.has(existingSummonerId)) {
      voiceSummoners.set(guild.id, member.id);
      return member.id;
    }

    return existingSummonerId;
  }

  function resolveCallHostId(guildId, fallbackUserId = null) {
    const summonerId = getVoiceSummoner(guildId);
    if (summonerId) return summonerId;

    const botUserId = getBotUserId();
    if (fallbackUserId && fallbackUserId !== botUserId) {
      return fallbackUserId;
    }
    return null;
  }

  function getSkipDenialMessage(guildId, userId, queue) {
    const hostId = resolveCallHostId(guildId, queue?.songs?.[0]?.user?.id);
    if (hostId && hostId !== userId) {
      return `❌ Apenas quem puxou o bot para a call (<@${hostId}>) pode pular músicas!`;
    }
    return null;
  }

  function formatSongRequesterInfo(queue, song) {
    const summonerId = getVoiceSummoner(queue.id);
    const botUserId = getBotUserId();
    const isBotQueued = Boolean(botUserId && song?.user?.id === botUserId);

    if (isBotQueued) {
      const sourceLabel = queue.autoplay ? '📻 Autoplay Automático' : '🌐 Painel Web';
      return summonerId
        ? `**Origem:** ${sourceLabel} • **Controle da Call:** <@${summonerId}>`
        : `**Origem:** ${sourceLabel}`;
    }

    return summonerId && summonerId !== song?.user?.id
      ? `**Pedido por:** ${song.user} • **Controle (Skip):** <@${summonerId}>`
      : `**Pedido por:** ${song.user}`;
  }

  async function playWithSummonerTracking(guild, member, playFn, hasVoiceOrQueueFn) {
    const hadSummonerBefore = voiceSummoners.has(guild.id);
    const previousSummonerId = voiceSummoners.get(guild.id);
    ensureVoiceSummoner(guild, member);

    try {
      return await playFn();
    } catch (err) {
      // Se a primeira busca falhar antes de o bot entrar/criar fila, restaura o estado anterior
      if (!hasVoiceOrQueueFn(guild.id)) {
        if (hadSummonerBefore && previousSummonerId) {
          voiceSummoners.set(guild.id, previousSummonerId);
        } else {
          clearVoiceSummoner(guild.id);
        }
      }
      throw err;
    }
  }

  return {
    getVoiceSummoner,
    clearVoiceSummoner,
    ensureVoiceSummoner,
    resolveCallHostId,
    getSkipDenialMessage,
    formatSongRequesterInfo,
    playWithSummonerTracking
  };
}

module.exports = { createVoiceSessionManager };
