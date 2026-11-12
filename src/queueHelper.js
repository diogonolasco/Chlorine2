const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const {
  EMBED_COLOR,
  GOLD_COLOR,
  truncateText,
  sanitizeLinkLabel,
  formatDuration
} = require('./embedHelper');

const MAX_EMBED_SONGS = 16; // 1 tocando + até 15 próximas na fila
const MAX_SELECT_OPTIONS = 25;
const MAX_DESC_LENGTH = 3500;

function getSongHintId(song) {
  return song?.id ? String(song.id).slice(0, 60) : '';
}

function getTotalQueueDurationLabel(songs = []) {
  let totalSeconds = 0;
  let hasLive = false;

  for (const song of songs) {
    const dur = Number(song?.duration) || 0;
    if (dur > 0) {
      totalSeconds += dur;
    } else if (song?.formattedDuration && /live|ao vivo/i.test(song.formattedDuration)) {
      hasLive = true;
    }
  }

  if (totalSeconds <= 0) {
    return hasLive ? '🔴 Ao Vivo' : '--:--';
  }
  const formatted = formatDuration(totalSeconds);
  return hasLive ? `${formatted} + 🔴` : formatted;
}

function resolveIcon(formatEmoji, key, fallback) {
  if (typeof formatEmoji === 'function') {
    const formatted = formatEmoji(key);
    if (formatted) return formatted;
  }
  return fallback;
}

/**
 * Monta o payload (embed limpo + menu interativo numerado) do comando !queue / /queue.
 */
function buildQueueMessagePayload(
  queue,
  {
    isVip = false,
    embedColor = EMBED_COLOR,
    goldColor = GOLD_COLOR,
    notice = null,
    botAvatarUrl = null,
    formatEmoji = null,
    getEmoji = null
  } = {}
) {
  const playingIcon = resolveIcon(formatEmoji, 'playing', '▶️');
  const helpIcon = resolveIcon(formatEmoji, 'help', '💡');
  const songs = Array.isArray(queue?.songs) ? queue.songs : [];
  const currentSong = songs[0];
  const lines = [];

  if (notice) {
    lines.push(`${notice}\n`);
  }

  if (currentSong) {
    const safeCurrent = sanitizeLinkLabel(currentSong.name || 'Faixa desconhecida', 72);
    const currentTitle = currentSong.url ? `[${safeCurrent}](${currentSong.url})` : safeCurrent;
    lines.push(
      `${playingIcon} **Tocando:** ${currentTitle} — \`${currentSong.formattedDuration || '--:--'}\`\n`
    );
  }

  let currentLength = lines.join('\n').length;
  let shownCount = currentSong ? 1 : 0;

  for (let i = 1; i < Math.min(songs.length, MAX_EMBED_SONGS); i++) {
    const song = songs[i];
    const safeName = sanitizeLinkLabel(song.name || 'Faixa desconhecida', 68);
    const titlePart = song.url ? `[${safeName}](${song.url})` : safeName;
    const line = `\`${i}.\` ${titlePart} — \`${song.formattedDuration || '--:--'}\``;

    if (currentLength + line.length + 1 > MAX_DESC_LENGTH) {
      break;
    }

    lines.push(line);
    currentLength += line.length + 1;
    shownCount++;
  }

  if (songs.length <= 1) {
    lines.push('*Nenhuma música aguardando na fila.*');
  }

  const remainingSongs = songs.length - shownCount;
  if (remainingSongs > 0) {
    lines.push(`\n*... e mais **${remainingSongs}** música(s). Use \`!queue <nº>\` para pular até qualquer posição.*`);
  } else if (songs.length > 1) {
    lines.push(`\n${helpIcon} *Escolha no menu abaixo, responda esta mensagem com o nº ou use \`!queue <nº>\`.*`);
  }

  const totalLabel = `${songs.length} música${songs.length === 1 ? '' : 's'}`;
  const totalTimeLabel = getTotalQueueDurationLabel(songs);
  const callName = queue.voiceChannel?.name ? truncateText(queue.voiceChannel.name, 22) : null;
  const footerParts = [
    callName ? `Call: ${callName}` : null,
    `Duração: ${totalTimeLabel}`,
    `Vol: ${queue.volume ?? 100}%`,
    `Autoplay: ${queue.autoplay ? 'ON' : 'OFF'}`
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(isVip ? goldColor : embedColor)
    .setTitle(`Fila de Reprodução (${totalLabel})${isVip ? ' • VIP 👑' : ''}`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: footerParts.join(' • '),
      iconURL: botAvatarUrl || undefined
    });

  if (currentSong?.thumbnail) {
    embed.setThumbnail(currentSong.thumbnail);
  }

  const components = [];
  if (songs.length > 1) {
    const options = [];
    const maxOptions = Math.min(songs.length - 1, MAX_SELECT_OPTIONS);
    const optionEmojiRaw = typeof getEmoji === 'function' ? getEmoji('note') : null;
    const optionEmoji =
      optionEmojiRaw && typeof optionEmojiRaw === 'object' && optionEmojiRaw.id && optionEmojiRaw.name
        ? optionEmojiRaw
        : null;

    for (let i = 1; i <= maxOptions; i++) {
      const song = songs[i];
      const hintId = getSongHintId(song);
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(truncateText(`${i}. ${song.name || 'Faixa sem título'}`, 100))
        .setDescription(truncateText(`Duração: ${song.formattedDuration || '--:--'} • Pular para #${i} e remover anteriores`, 100))
        .setValue(`${i}:${hintId}`);
      if (optionEmoji) {
        option.setEmoji(optionEmoji);
      }
      options.push(option);
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('queue_jump_select')
      .setPlaceholder('Escolha o número da música para pular...')
      .addOptions(options);

    components.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  return { embeds: [embed], components };
}

/**
 * Resolve o índice alvo na fila, verifica se quem pediu o salto é quem puxou o bot para a call
 * e executa queue.jump() removendo todas as músicas puladas da fila.
 */
async function jumpToQueuePosition({
  queue,
  guildId,
  userId,
  rawPosition,
  songIdHint = null,
  getSkipDenialMessage
}) {
  if (!queue || !queue.songs?.length) {
    return { ok: false, message: '❌ Nenhuma fila de músicas ativa no momento!' };
  }

  if (queue.songs.length <= 1) {
    return { ok: false, message: '❌ Não há outras músicas depois da atual na fila para pular!' };
  }

  let targetIndex = rawPosition;

  // Se veio do menu interativo com ID da faixa, confirma se a fila mudou enquanto o menu estava aberto
  if (songIdHint) {
    const songAtRaw = queue.songs[rawPosition];
    if (!songAtRaw || getSongHintId(songAtRaw) !== songIdHint) {
      const relocatedIndex = queue.songs.findIndex((s, idx) => idx >= 1 && getSongHintId(s) === songIdHint);
      if (relocatedIndex >= 1) {
        targetIndex = relocatedIndex;
      } else if (getSongHintId(queue.songs[0]) === songIdHint) {
        return { ok: false, stale: true, message: '▶️ Essa música já está tocando agora!' };
      } else {
        return { ok: false, stale: true, message: '⚠️ Essa música já saiu da fila!' };
      }
    }
  } else if (!Number.isInteger(targetIndex) || targetIndex < 1 || targetIndex >= queue.songs.length) {
    return {
      ok: false,
      message: `❌ Número inválido! Escolha um número entre **1** e **${queue.songs.length - 1}** da fila.`
    };
  }

  const skipDenial = getSkipDenialMessage(guildId, userId, queue);
  if (skipDenial) {
    return { ok: false, denied: true, message: skipDenial };
  }

  const skippedCount = targetIndex;
  const targetSong = queue.songs[targetIndex];
  queue._isSkipped = true;

  try {
    await queue.jump(targetIndex);
    return {
      ok: true,
      targetIndex,
      skippedCount,
      targetSong
    };
  } catch (err) {
    queue._isSkipped = false;
    return {
      ok: false,
      message: `❌ Não foi possível pular para esta música: ${err.message || err}`
    };
  }
}

module.exports = {
  buildQueueMessagePayload,
  jumpToQueuePosition
};
