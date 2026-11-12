const { EmbedBuilder } = require('discord.js');

// Paleta oficial da Chlorine Music™
const EMBED_COLOR = 0x8018D8;   // Roxo Neon Chlorine
const GOLD_COLOR = 0xFFD700;    // Dourado VIP
const SUCCESS_COLOR = 0x10B981; // Verde Esmeralda
const WARNING_COLOR = 0xF59E0B; // Âmbar Aviso
const ERROR_COLOR = 0xEF4444;   // Vermelho Erro

const FOOTER_TEXT = '© 2026 Chlorine Music™ • Desenvolvido por .nolasco7';
const DEFAULT_SUPPORT_URL = 'https://discord.gg/6MFj275a3S';

const COLOR_BY_TYPE = {
  info: EMBED_COLOR,
  success: SUCCESS_COLOR,
  warning: WARNING_COLOR,
  error: ERROR_COLOR,
  vip: GOLD_COLOR
};

/**
 * Trunca texto mantendo reticências dentro do limite informado.
 */
function truncateText(text, maxLength = 80) {
  if (!text) return '';
  const str = String(text).replace(/\s+/g, ' ').trim();
  if (str.length <= maxLength) return str;
  return `${str.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * Limpa colchetes para evitar que nomes como "[Official Video]" quebrem links Markdown no Discord.
 */
function sanitizeLinkLabel(text, maxLength = 85) {
  const truncated = truncateText(text || 'Faixa desconhecida', maxLength);
  return truncated.replace(/\[/g, '(').replace(/\]/g, ')');
}

/**
 * Formata uma duração em segundos no formato MM:SS ou HH:MM:SS.
 */
function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function resolveIcon(formatEmoji, key, fallback) {
  if (typeof formatEmoji === 'function') {
    const formatted = formatEmoji(key);
    if (formatted) return formatted;
  }
  return fallback;
}

/**
 * Gera uma barra de progresso compacta (8 blocos) para o comando !nowplaying.
 */
function createProgressBar(
  currentSeconds,
  totalSeconds,
  { size = 8, isPaused = false, playIcon = '▶️', pauseIcon = '⏸️' } = {}
) {
  const total = Number(totalSeconds) || 0;
  if (total <= 0) {
    return `${isPaused ? pauseIcon : '🔴'} **Ao Vivo**`;
  }

  const current = Math.min(Math.max(0, Number(currentSeconds) || 0), total);
  const ratio = Math.min(1, Math.max(0, current / total));
  const pct = Math.round(ratio * 100);
  const pointerIndex = Math.min(size - 1, Math.floor(ratio * size));

  let bar = '';
  for (let i = 0; i < size; i++) {
    if (i === pointerIndex) bar += '🔘';
    else if (i < pointerIndex) bar += '▰';
    else bar += '▱';
  }

  const stateIcon = isPaused ? pauseIcon : playIcon;
  return `${stateIcon} \`${formatDuration(current)}\` ${bar} \`${formatDuration(total)}\` **(${pct}%)**`;
}

/**
 * Gera uma barra visual compacta proporcional ao volume (1% a 200%).
 */
function createVolumeBar(volume) {
  const safe = Math.min(200, Math.max(0, Math.round(Number(volume) || 0)));
  const blocks = 10;
  const filled = Math.min(blocks, Math.max(0, Math.round((safe / 200) * blocks)));
  const bar = `${'▰'.repeat(filled)}${'▱'.repeat(blocks - filled)}`;
  return `\`${bar}\` **${safe}%**`;
}

/**
 * Resolve o texto limpo de quem solicitou ou originou uma faixa.
 */
function getRequesterDisplay(queue, song, botUserId = null, formatEmoji = null) {
  const isBotQueued = Boolean(botUserId && song?.user?.id === botUserId);
  if (isBotQueued) {
    const autoplayIcon = resolveIcon(formatEmoji, 'autoplay', '📻');
    return queue?.autoplay ? `${autoplayIcon} Autoplay` : '🌐 Painel Web';
  }
  return song?.user ? `${song.user}` : 'Membro';
}

/**
 * Monta embeds limpos e padronizados sem poluição visual excessiva.
 */
function createStatusEmbed({
  type = 'info',
  title = null,
  description = '',
  botAvatarUrl = null,
  authorName = null,
  footerText = null,
  thumbnail = null,
  fields = null
}) {
  const embed = new EmbedBuilder().setColor(COLOR_BY_TYPE[type] || EMBED_COLOR);

  if (authorName) {
    embed.setAuthor({ name: authorName, iconURL: botAvatarUrl || undefined });
  }
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (Array.isArray(fields) && fields.length > 0) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (footerText) {
    embed.setFooter({ text: footerText, iconURL: botAvatarUrl || undefined });
  }

  return embed;
}

/**
 * Monta o card de "Tocando Agora" — bonito, limpo e compacto.
 */
function createPlayerEmbed({
  queue,
  song,
  isVip = false,
  isSkipped = false,
  botUserId = null,
  botAvatarUrl = null,
  callHostId = null,
  voiceChannelName = null,
  showLiveProgress = false,
  formatEmoji = null
}) {
  let title = isVip ? '👑 Tocando Agora • VIP' : 'Tocando Agora';
  if (isSkipped) {
    title = isVip ? '👑 Pulada • Tocando Agora • VIP' : 'Pulada • Tocando Agora';
  } else if (queue?.paused) {
    title = isVip ? '👑 Tocando Agora • VIP (Pausado)' : 'Tocando Agora (Pausado)';
  }

  const playingIcon = resolveIcon(formatEmoji, 'playing', '🎵');
  const pauseIcon = resolveIcon(formatEmoji, 'pause', '⏸️');
  const playIcon = resolveIcon(formatEmoji, 'play', '▶️');
  const skipIcon = resolveIcon(formatEmoji, 'skip', '⏭️');
  const clockIcon = resolveIcon(formatEmoji, 'clock', '⏱️');
  const userIcon = resolveIcon(formatEmoji, 'user', '👤');
  const headsetIcon = resolveIcon(formatEmoji, 'headset', '🔊');

  const trackStateIcon = queue?.paused ? pauseIcon : isSkipped ? skipIcon : playingIcon;
  const safeTitle = sanitizeLinkLabel(song?.name, 90);
  const songLine = `${trackStateIcon} ${song?.url ? `**[${safeTitle}](${song.url})**` : `**${safeTitle}**`}`;

  const requesterDisplay = getRequesterDisplay(queue, song, botUserId, formatEmoji);
  const durationLabel = song?.formattedDuration || 'Ao Vivo';
  const callPart = voiceChannelName ? ` • ${headsetIcon} **${truncateText(voiceChannelName, 26)}**` : '';
  const hostNote =
    callHostId && callHostId !== song?.user?.id
      ? `\n${headsetIcon} **Controle:** <@${callHostId}>`
      : '';

  let body;
  if (showLiveProgress) {
    const progress = createProgressBar(queue?.currentTime || 0, song?.duration || 0, {
      isPaused: Boolean(queue?.paused),
      playIcon,
      pauseIcon
    });
    body = `${songLine}\n\n${progress}\n\n${userIcon} ${requesterDisplay}${callPart}${hostNote}`;
  } else {
    body = `${songLine}\n\n${clockIcon} \`${durationLabel}\` • ${userIcon} ${requesterDisplay}${callPart}${hostNote}`;
  }

  const queueCount = queue?.songs?.length || 1;
  const footerSummary = `Vol: ${queue?.volume ?? 100}% • Fila: ${queueCount} • Autoplay: ${queue?.autoplay ? 'ON' : 'OFF'}`;

  const embed = new EmbedBuilder()
    .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
    .setTitle(title)
    .setDescription(body)
    .setFooter({
      text: footerSummary,
      iconURL: botAvatarUrl || undefined
    });

  if (song?.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  return embed;
}

/**
 * Monta o card compacto de nova música adicionada à fila.
 */
function createAddedSongEmbed({ queue, song, isVip = false, botUserId = null, formatEmoji = null }) {
  const noteIcon = resolveIcon(formatEmoji, 'note', '🎵');
  const clockIcon = resolveIcon(formatEmoji, 'clock', '⏱️');
  const userIcon = resolveIcon(formatEmoji, 'user', '👤');
  const safeTitle = sanitizeLinkLabel(song?.name, 85);
  const songLine = song?.url ? `**[${safeTitle}](${song.url})**` : `**${safeTitle}**`;
  const requesterDisplay = getRequesterDisplay(queue, song, botUserId, formatEmoji);
  const queuePosition = Math.max(1, (queue?.songs?.length || 2) - 1);

  const embed = new EmbedBuilder()
    .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
    .setTitle('Adicionado à Fila')
    .setDescription(
      `${noteIcon} ${songLine}\n\n` +
      `${clockIcon} \`${song?.formattedDuration || '--:--'}\` • ${userIcon} ${requesterDisplay} • **#${queuePosition}** na espera`
    );

  if (song?.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  return embed;
}

/**
 * Monta o card compacto de playlist adicionada à fila.
 */
function createAddedListEmbed({ queue, playlist, isVip = false, voiceChannelName = null, formatEmoji = null }) {
  const queueIcon = resolveIcon(formatEmoji, 'queue', '📋');
  const noteIcon = resolveIcon(formatEmoji, 'note', '🎵');
  const clockIcon = resolveIcon(formatEmoji, 'clock', '⏱️');
  const headsetIcon = resolveIcon(formatEmoji, 'headset', '🔊');
  const safeTitle = sanitizeLinkLabel(playlist?.name || 'Playlist', 85);
  const heading = playlist?.url ? `**[${safeTitle}](${playlist.url})**` : `**${safeTitle}**`;
  const songCount = playlist?.songs?.length || 0;
  const thumb = playlist?.thumbnail || playlist?.songs?.[0]?.thumbnail || null;
  const callPart = voiceChannelName ? ` • ${headsetIcon} **${truncateText(voiceChannelName, 24)}**` : '';

  const embed = new EmbedBuilder()
    .setColor(isVip ? GOLD_COLOR : EMBED_COLOR)
    .setTitle('Playlist Adicionada à Fila')
    .setDescription(
      `${queueIcon} ${heading}\n\n` +
      `${noteIcon} **${songCount}** músicas • ${clockIcon} \`${playlist?.formattedDuration || '--:--'}\`${callPart}`
    )
    .setFooter({ text: `Total na fila: ${queue?.songs?.length || songCount} música(s)` });

  if (thumb) {
    embed.setThumbnail(thumb);
  }

  return embed;
}

module.exports = {
  EMBED_COLOR,
  GOLD_COLOR,
  SUCCESS_COLOR,
  WARNING_COLOR,
  ERROR_COLOR,
  FOOTER_TEXT,
  DEFAULT_SUPPORT_URL,
  truncateText,
  sanitizeLinkLabel,
  formatDuration,
  createProgressBar,
  createVolumeBar,
  getRequesterDisplay,
  createStatusEmbed,
  createPlayerEmbed,
  createAddedSongEmbed,
  createAddedListEmbed
};
