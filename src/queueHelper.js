const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const MAX_EMBED_SONGS = 16; // 1 tocando + até 15 próximas na fila
const MAX_SELECT_OPTIONS = 25;
const MAX_DESC_LENGTH = 3600;

function truncateText(text, maxLength) {
  if (!text) return '';
  const str = String(text);
  return str.length > maxLength ? `${str.slice(0, maxLength - 3)}...` : str;
}

function getSongHintId(song) {
  return song?.id ? String(song.id).slice(0, 60) : '';
}

/**
 * Monta o payload (embed + menu interativo numerado) do comando !queue / /queue.
 */
function buildQueueMessagePayload(queue, { isVip = false, embedColor, goldColor, notice = null } = {}) {
  const lines = [];
  let currentLength = notice ? notice.length + 4 : 0;
  let shownCount = 0;

  for (let i = 0; i < Math.min(queue.songs.length, MAX_EMBED_SONGS); i++) {
    const song = queue.songs[i];
    const safeName = truncateText(song.name || 'Faixa desconhecida', 80);
    const titlePart = song.url ? `[${safeName}](${song.url})` : safeName;
    const prefix = i === 0 ? '▶️ **Tocando agora:**' : `**${i}.**`;
    const line = `${prefix} ${titlePart} - \`${song.formattedDuration || '--:--'}\``;

    if (currentLength + line.length + 1 > MAX_DESC_LENGTH && i > 0) {
      break;
    }

    lines.push(line);
    currentLength += line.length + 1;
    shownCount++;
  }

  const remainingSongs = queue.songs.length - shownCount;
  if (remainingSongs > 0) {
    lines.push(`\n*... e mais **${remainingSongs}** música(s) na fila. Use \`!queue <número>\` para pular até qualquer posição.*`);
  } else if (queue.songs.length > 1) {
    lines.push('\n💡 *Escolha o número pelo menu abaixo, responda esta mensagem com o número ou use `!queue <número>`.*');
  }

  const description = notice ? `${notice}\n\n${lines.join('\n')}` : lines.join('\n');

  const embed = new EmbedBuilder()
    .setColor(isVip ? goldColor : embedColor)
    .setTitle(`🎶 Fila de Reprodução (${queue.songs.length} música(s))${isVip ? ' 👑' : ''}`)
    .setDescription(description)
    .setFooter({ text: `Volume: ${queue.volume}% | Autoplay: ${queue.autoplay ? 'Ativado ✅' : 'Desativado ❌'}` });

  const components = [];
  if (queue.songs.length > 1) {
    const options = [];
    const maxOptions = Math.min(queue.songs.length - 1, MAX_SELECT_OPTIONS);

    for (let i = 1; i <= maxOptions; i++) {
      const song = queue.songs[i];
      const hintId = getSongHintId(song);
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(truncateText(`${i}. ${song.name || 'Faixa sem título'}`, 100))
          .setDescription(truncateText(`Duração: ${song.formattedDuration || '--:--'} • Pular para #${i} e remover anteriores`, 100))
          .setValue(`${i}:${hintId}`)
      );
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('queue_jump_select')
      .setPlaceholder('⏭️ Escolha o número da música para pular...')
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
