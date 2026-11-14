/**
 * Módulo de Sincronização Bidirecional de Fila em Tempo Real (Local Bot <-> Painel ShardCloud)
 * Permite que o site na nuvem (chlorine.shardweb.app) exiba e controle
 * as músicas tocando no bot (mesmo se o bot estiver rodando no Windows ou em outra máquina).
 */

const remoteQueues = new Map(); // guildId -> queuePayload
const pendingRemoteCommands = []; // comandos enviados do site para o bot

/**
 * Serializa o estado atual de uma fila do DisTube para JSON limpo
 */
function serializeQueue(queue, guild, distube) {
  if (!queue || !queue.songs || queue.songs.length === 0) return null;
  const song = queue.songs[0];
  const voice =
    queue.voiceChannel ||
    distube?.voices?.get(queue.id)?.channel ||
    guild?.members?.me?.voice?.channel ||
    null;

  const activeVoicePayload = voice ? { id: voice.id, name: voice.name } : null;

  return {
    playing: !queue.paused,
    paused: Boolean(queue.paused),
    volume: queue.volume ?? 100,
    autoplay: Boolean(queue.autoplay),
    repeatMode: typeof queue.repeatMode === 'number' ? queue.repeatMode : 0,
    canPrevious: Boolean(queue.previousSongs?.length || queue.repeatMode === 2),
    voiceChannel: activeVoicePayload,
    currentTime: queue.currentTime || 0,
    formattedCurrentTime: queue.formattedCurrentTime || '00:00',
    songsCount: queue.songs.length,
    currentSong: {
      id: song.id || song.url || '0',
      name: song.name,
      url: song.url,
      duration: Number(song.duration) || 0,
      formattedDuration: song.formattedDuration || '00:00',
      currentTime: queue.currentTime || 0,
      formattedCurrentTime: queue.formattedCurrentTime || '00:00',
      thumbnail: song.thumbnail,
      user: song.user?.tag || song.user?.username || 'Membro'
    },
    songs: queue.songs.map((s, idx) => ({
      index: idx,
      id: s.id || s.url || String(idx),
      name: s.name,
      url: s.url,
      duration: Number(s.duration) || 0,
      formattedDuration: s.formattedDuration || '00:00',
      thumbnail: s.thumbnail,
      user: s.user?.tag || s.user?.username || 'Membro'
    }))
  };
}

/**
 * Lado do Servidor Web (ShardCloud): Recebe e armazena filas remotas
 */
function handleIncomingSync(body) {
  if (!body || typeof body !== 'object') return [];
  const { queues } = body;
  if (queues && typeof queues === 'object') {
    const activeIds = new Set(Object.keys(queues));
    for (const [gid, qData] of Object.entries(queues)) {
      if (qData) {
        remoteQueues.set(gid, qData);
      } else {
        remoteQueues.delete(gid);
      }
    }
    // Remove filas que não estão mais ativas
    for (const existingId of remoteQueues.keys()) {
      if (!activeIds.has(existingId)) {
        remoteQueues.delete(existingId);
      }
    }
  }

  // Devolve comandos pendentes para o bot remoto executar
  return pendingRemoteCommands.splice(0, 10);
}

/**
 * Lado do Servidor Web (ShardCloud): Obtém fila remota de um servidor
 */
function getRemoteQueue(guildId) {
  return remoteQueues.get(guildId) || null;
}

/**
 * Quantidade de filas ativas registradas remotamente
 */
function getActiveRemoteQueuesCount() {
  let count = 0;
  for (const q of remoteQueues.values()) {
    if (q && q.songsCount > 0) count++;
  }
  return count;
}

/**
 * Lado do Servidor Web (ShardCloud): Enfileira um comando para o bot remoto executar
 */
function enqueueRemoteCommand(guildId, action, params = {}) {
  const cmd = {
    id: Math.random().toString(36).slice(2, 10),
    guildId,
    action,
    params,
    createdAt: Date.now()
  };
  pendingRemoteCommands.push(cmd);
  if (pendingRemoteCommands.length > 50) {
    pendingRemoteCommands.shift();
  }
  return cmd;
}

/**
 * Lado do Bot Ativo (Windows): Envia as filas para o site e executa comandos pendentes
 */
async function syncLocalQueuesToRemote({ dashboardUrl, token, distube, client }) {
  if (!dashboardUrl || !token || !distube) return;
  const cleanUrl = String(dashboardUrl).replace(/\/+$/, '');

  const queuesPayload = {};
  if (distube.queues?.collection) {
    for (const [gid, queue] of distube.queues.collection.entries()) {
      const guild = client.guilds.cache.get(gid);
      const serialized = serializeQueue(queue, guild, distube);
      if (serialized) {
        queuesPayload[gid] = serialized;
      }
    }
  }

  try {
    const res = await fetch(`${cleanUrl}/api/internal/sync-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ queues: queuesPayload })
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.commands) && data.commands.length > 0) {
        for (const cmd of data.commands) {
          await executeRemoteCommandLocally(cmd, distube, client);
        }
      }
    }
  } catch {}
}

/**
 * Executa localmente no DisTube um comando enviado pelo site remoto
 */
async function executeRemoteCommandLocally(cmd, distube, client) {
  const { guildId, action, params = {} } = cmd;
  const queue = distube.getQueue(guildId);
  const guild = client.guilds.cache.get(guildId);

  try {
    switch (action) {
      case 'pause':
        if (queue) {
          if (queue.paused) queue.resume();
          else queue.pause();
        }
        break;
      case 'skip':
        if (queue) {
          queue._isSkipped = true;
          if (queue.songs.length <= 1 && !queue.autoplay) {
            await queue.stop();
          } else {
            await queue.skip();
          }
        }
        break;
      case 'previous':
        if (queue) {
          queue._isSkipped = true;
          await queue.previous();
        }
        break;
      case 'stop':
        if (queue) await queue.stop().catch(() => {});
        distube.voices.leave(guildId);
        break;
      case 'volume':
        if (queue && typeof params.volume === 'number') {
          queue.setVolume(params.volume);
        }
        break;
      case 'autoplay':
        if (queue) {
          if (typeof params.enabled === 'boolean') {
            if (Boolean(queue.autoplay) !== params.enabled) {
              queue.toggleAutoplay();
            }
          } else {
            queue.toggleAutoplay();
          }
        }
        break;
      case 'repeat':
        if (queue && typeof params.mode === 'number') {
          queue.setRepeatMode(params.mode);
        }
        break;
      case 'shuffle':
        if (queue && queue.songs.length > 2) {
          await queue.shuffle();
        }
        break;
      case 'seek':
        if (queue && typeof params.time === 'number') {
          queue.seek(params.time);
        }
        break;
      case 'jump':
        if (queue && typeof params.index === 'number') {
          queue._isSkipped = true;
          await queue.jump(params.index);
        }
        break;
      case 'remove':
        if (queue && typeof params.index === 'number' && params.index > 0 && params.index < queue.songs.length) {
          queue.songs.splice(params.index, 1);
        }
        break;
      case 'clear':
        if (queue && queue.songs.length > 1) {
          queue.songs.splice(1);
        }
        break;
      case 'moveQueueSong':
        if (
          queue &&
          typeof params.fromIndex === 'number' &&
          typeof params.toIndex === 'number' &&
          params.fromIndex > 0 &&
          params.fromIndex < queue.songs.length &&
          params.toIndex > 0 &&
          params.toIndex < queue.songs.length
        ) {
          const [moved] = queue.songs.splice(params.fromIndex, 1);
          queue.songs.splice(params.toIndex, 0, moved);
        }
        break;
      case 'moveVoice':
        if (guild && params.voiceChannelId) {
          const targetChannel = guild.channels.cache.get(params.voiceChannelId);
          if (targetChannel && targetChannel.isVoiceBased()) {
            await distube.voices.join(targetChannel);
          }
        }
        break;
      case 'play':
        if (guild && params.query) {
          let voiceChannel = null;
          if (params.voiceChannelId) {
            voiceChannel = guild.channels.cache.get(params.voiceChannelId);
          }
          if (!voiceChannel) {
            voiceChannel =
              queue?.voiceChannel ||
              distube.voices.get(guildId)?.channel ||
              guild.channels.cache.find((c) => c.isVoiceBased() && c.members.some((m) => !m.user.bot)) ||
              guild.channels.cache.find((c) => c.isVoiceBased());
          }
          if (voiceChannel) {
            const playOpts = { member: guild.members.me };
            if (params.mode === 'now' && queue) {
              playOpts.skip = true;
              queue._isSkipped = true;
            } else if (params.mode === 'next' && queue) {
              playOpts.position = 1;
            }
            await distube.play(voiceChannel, params.query, playOpts);
          }
        }
        break;
    }
  } catch (err) {
    console.error(`[RemoteCmd] Erro ao executar ${action}:`, err?.message || err);
  }
}

/**
 * Inicia o loop de sincronização periódica (executado no bot que toca as músicas)
 */
let syncIntervalTimer = null;
function startQueueSyncLoop({ dashboardUrl, token, distube, client, intervalMs = 1200 } = {}) {
  if (!dashboardUrl || !token || !distube || syncIntervalTimer) return;
  syncIntervalTimer = setInterval(() => {
    syncLocalQueuesToRemote({ dashboardUrl, token, distube, client }).catch(() => {});
  }, intervalMs);
  syncIntervalTimer.unref?.();
  // Sincroniza imediatamente na primeira vez
  syncLocalQueuesToRemote({ dashboardUrl, token, distube, client }).catch(() => {});
}

module.exports = {
  serializeQueue,
  handleIncomingSync,
  getRemoteQueue,
  getActiveRemoteQueuesCount,
  enqueueRemoteCommand,
  syncLocalQueuesToRemote,
  startQueueSyncLoop
};
