const fs = require('fs');
const path = require('path');

const PLAYER_EMOJI_DEFS = [
  { key: 'pause', name: 'chlorine_pause', file: 'chlorine_pause.png', fallback: '⏸️' },
  { key: 'play', name: 'chlorine_play', file: 'chlorine_play.png', fallback: '▶️' },
  { key: 'skip', name: 'chlorine_skip', file: 'chlorine_skip.png', fallback: '⏭️' },
  { key: 'stop', name: 'chlorine_stop', file: 'chlorine_stop.png', fallback: '⏹️' },
  { key: 'playing', name: 'chlorine_playing', file: 'chlorine_playing.png', fallback: '🎵' },
  { key: 'headset', name: 'chlorine_headset', file: 'chlorine_headset.png', fallback: '🔊' },
  { key: 'note', name: 'chlorine_note', file: 'chlorine_note.png', fallback: '🎶' },
  { key: 'vip', name: 'chlorine_vip', file: 'chlorine_vip.png', fallback: '👑' },
  { key: 'gem', name: 'chlorine_gem', file: 'chlorine_gem.png', fallback: '💎' },
  { key: 'bolt', name: 'chlorine_bolt', file: 'chlorine_bolt.png', fallback: '⚡' },
  { key: 'help', name: 'chlorine_help', file: 'chlorine_help.png', fallback: '❓' },
  { key: 'queue', name: 'chlorine_queue', file: 'chlorine_queue.png', fallback: '📜' },
  { key: 'volume', name: 'chlorine_volume', file: 'chlorine_volume.png', fallback: '🔊' },
  { key: 'autoplay', name: 'chlorine_autoplay', file: 'chlorine_autoplay.png', fallback: '📻' },
  { key: 'clock', name: 'chlorine_clock', file: 'chlorine_clock.png', fallback: '⏱️' },
  { key: 'user', name: 'chlorine_user', file: 'chlorine_user.png', fallback: '👤' },
  { key: 'cross', name: 'chlorine_cross', file: 'chlorine_cross.png', fallback: '❌' },
  { key: 'check', name: 'chlorine_check', file: 'chlorine_check.png', fallback: '✅' },
  { key: 'warn', name: 'chlorine_warn', file: 'chlorine_warn.png', fallback: '⚠️' },
  { key: 'web', name: 'chlorine_web', file: 'chlorine_web.png', fallback: '🌐' },
  { key: 'lock', name: 'chlorine_lock', file: 'chlorine_lock.png', fallback: '🔒' },
  { key: 'unlock', name: 'chlorine_unlock', file: 'chlorine_unlock.png', fallback: '🔓' },
  { key: 'sparkles', name: 'chlorine_sparkles', file: 'chlorine_sparkles.png', fallback: '✨' },
  { key: 'calendar', name: 'chlorine_calendar', file: 'chlorine_calendar.png', fallback: '📅' },
  { key: 'tag', name: 'chlorine_tag', file: 'chlorine_tag.png', fallback: '🏷️' },
  { key: 'wave', name: 'chlorine_wave', file: 'chlorine_wave.png', fallback: '👋' },
  { key: 'servers', name: 'chlorine_servers', file: 'chlorine_servers.png', fallback: '🌍' },
  { key: 'stream', name: 'chlorine_stream', file: 'chlorine_stream.png', fallback: '📡' },
  { key: 'add', name: 'chlorine_add', file: 'chlorine_add.png', fallback: '➕' },
  { key: 'chat', name: 'chlorine_chat', file: 'chlorine_chat.png', fallback: '💬' },
  { key: 'tada', name: 'chlorine_tada', file: 'chlorine_tada.png', fallback: '🎉' },
  { key: 'bulb', name: 'chlorine_bulb', file: 'chlorine_bulb.png', fallback: '💡' },
  { key: 'repeat', name: 'chlorine_repeat', file: 'chlorine_repeat.png', fallback: '🔁' },
  { key: 'shuffle', name: 'chlorine_shuffle', file: 'chlorine_shuffle.png', fallback: '🔀' }
];

const DEF_BY_KEY = new Map(PLAYER_EMOJI_DEFS.map((d) => [d.key, d]));

function isValidEmojiEntry(entry) {
  return Boolean(entry && /^\d{15,22}$/.test(String(entry.id || '')) && entry.name);
}

/**
 * Gerencia e sincroniza os emojis personalizados do player diretamente como Application Emojis no Discord.
 */
function createPlayerEmojiManager({ rootDir = path.join(__dirname, '..'), initialMap = null } = {}) {
  const cacheFile = path.join(rootDir, 'data', 'player_emojis.json');
  const emojisDir = path.join(rootDir, 'assets', 'emojis');
  const resolved = new Map();

  function applyMap(mapObj) {
    if (!mapObj || typeof mapObj !== 'object') return;
    for (const def of PLAYER_EMOJI_DEFS) {
      const entry = mapObj[def.key];
      if (isValidEmojiEntry(entry)) {
        resolved.set(def.key, { id: String(entry.id), name: String(entry.name) });
      }
    }
  }

  if (initialMap) {
    applyMap(initialMap);
  } else if (fs.existsSync(cacheFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      applyMap(saved);
    } catch {}
  }

  function toObject() {
    const out = {};
    for (const [key, value] of resolved.entries()) {
      out[key] = value;
    }
    return out;
  }

  function saveCache() {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(toObject(), null, 2), 'utf8');
    } catch {}
  }

  function getEmoji(key) {
    const custom = resolved.get(key);
    if (custom) return custom;
    return DEF_BY_KEY.get(key)?.fallback || '🎵';
  }

  function formatEmoji(key) {
    const custom = resolved.get(key);
    if (custom?.id && custom?.name) {
      return `<:${custom.name}:${custom.id}>`;
    }
    return DEF_BY_KEY.get(key)?.fallback || '🎵';
  }

  async function syncWithApplication(application) {
    if (!application?.emojis?.fetch || !application?.emojis?.create) {
      return toObject();
    }

    const fetched = await application.emojis.fetch();
    const byName = new Map();
    for (const emoji of fetched.values()) {
      byName.set(emoji.name, emoji);
    }

    let changed = false;
    for (const def of PLAYER_EMOJI_DEFS) {
      let target = byName.get(def.name);
      if (!target) {
        const attachmentPath = path.join(emojisDir, def.file);
        if (fs.existsSync(attachmentPath)) {
          target = await application.emojis.create({
            attachment: attachmentPath,
            name: def.name
          });
          changed = true;
        }
      }

      if (target?.id) {
        const prev = resolved.get(def.key);
        if (!prev || prev.id !== String(target.id) || prev.name !== target.name) {
          resolved.set(def.key, { id: String(target.id), name: target.name });
          changed = true;
        }
      }
    }

    if (changed) {
      saveCache();
    }
    return toObject();
  }

  return {
    PLAYER_EMOJI_DEFS,
    getEmoji,
    formatEmoji,
    applyMap,
    toObject,
    syncWithApplication
  };
}

module.exports = {
  PLAYER_EMOJI_DEFS,
  createPlayerEmojiManager
};
