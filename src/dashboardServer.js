const express = require('express');
const path = require('path');
const vipManager = require('./vipManager');

function createDashboardServer(client, distube, port = 3000) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

  /**
   * Localiza o canal de voz ativo em que o bot está conectado no servidor.
   */
  function getActiveVoiceChannel(guildId, guild, queue) {
    return (
      queue?.voiceChannel ||
      distube.voices.get(guildId)?.channel ||
      guild?.members?.me?.voice?.channel ||
      null
    );
  }

  /**
   * Formata quem adicionou a faixa exibindo corretamente Painel Web / Autoplay.
   */
  function formatDashboardRequester(song, queue) {
    if (client.user?.id && song.user?.id === client.user.id) {
      return queue?.autoplay ? 'Autoplay Automático' : 'Painel Web';
    }
    return song.user?.tag || song.user?.username || 'Membro';
  }

  // ==========================================
  // ROTAS DA API
  // ==========================================

  // 1. Status Geral do Bot
  app.get('/api/status', (req, res) => {
    if (!client.isReady()) {
      return res.status(503).json({ error: 'Bot ainda está inicializando...' });
    }

    const guilds = Array.from(client.guilds.cache.values()).map((guild) => {
      const queue = distube.getQueue(guild.id);
      const activeVoice = getActiveVoiceChannel(guild.id, guild, queue);
      const isVip = vipManager.isGuildVip(guild.id);
      const vipInfo = isVip ? vipManager.getGuildVipInfo(guild.id) : null;

      return {
        id: guild.id,
        name: guild.name,
        icon: (typeof guild.iconURL === 'function' ? guild.iconURL({ dynamic: true }) : null) || null,
        memberCount: guild.memberCount || 0,
        isVip,
        vipInfo,
        hasActiveQueue: Boolean(queue && queue.songs?.length > 0),
        voiceChannelName: activeVoice?.name || null
      };
    });

    const totalGuilds = guilds.length;
    const activeQueuesCount = distube.queues.collection.size;
    const allVipGuilds = vipManager.getAllVipGuilds().filter((g) => g.active);
    const allKeys = vipManager.getAllKeys();

    res.json({
      bot: {
        id: client.user.id,
        tag: client.user.tag,
        username: client.user.username,
        avatar: client.user.displayAvatarURL(),
        ping: client.ws.ping,
        uptime: client.uptime
      },
      stats: {
        totalGuilds,
        activeQueuesCount,
        vipGuildsCount: allVipGuilds.length,
        totalKeysCount: allKeys.length
      },
      guilds
    });
  });

  // 2. Detalhes de um Servidor, Canal de Voz Atual e Fila de Músicas
  app.get('/api/guild/:guildId', (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado!' });
    }

    const queue = distube.getQueue(guildId);
    const activeVoice = getActiveVoiceChannel(guildId, guild, queue);
    const isVip = vipManager.isGuildVip(guildId);
    const vipInfo = vipManager.getGuildVipInfo(guildId);

    // Canais de voz do servidor
    const voiceChannels = guild.channels.cache
      .filter((c) => c.isVoiceBased())
      .map((c) => ({
        id: c.id,
        name: c.name,
        membersCount: c.members.filter((m) => !m.user.bot).size
      }));

    let currentSong = null;
    let songList = [];

    if (queue && queue.songs.length > 0) {
      const song = queue.songs[0];
      currentSong = {
        id: song.id || song.url || '0',
        name: song.name,
        url: song.url,
        duration: Number(song.duration) || 0,
        formattedDuration: song.formattedDuration,
        currentTime: queue.currentTime,
        formattedCurrentTime: queue.formattedCurrentTime,
        thumbnail: song.thumbnail,
        user: formatDashboardRequester(song, queue)
      };

      songList = queue.songs.map((s, idx) => ({
        index: idx,
        id: s.id || s.url || String(idx),
        name: s.name,
        url: s.url,
        duration: Number(s.duration) || 0,
        formattedDuration: s.formattedDuration,
        thumbnail: s.thumbnail,
        user: formatDashboardRequester(s, queue)
      }));
    }

    const activeVoicePayload = activeVoice
      ? { id: activeVoice.id, name: activeVoice.name }
      : null;

    res.json({
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ dynamic: true }) || null,
        memberCount: guild.memberCount,
        isVip,
        vipInfo
      },
      activeVoiceChannel: activeVoicePayload,
      voiceChannels,
      queue: queue
        ? {
            playing: !queue.paused,
            paused: queue.paused,
            volume: queue.volume,
            autoplay: queue.autoplay,
            repeatMode: typeof queue.repeatMode === 'number' ? queue.repeatMode : 0,
            canPrevious: Boolean(queue.previousSongs?.length || queue.repeatMode === 2),
            voiceChannel: activeVoicePayload,
            currentTime: queue.currentTime,
            formattedCurrentTime: queue.formattedCurrentTime,
            songsCount: queue.songs.length,
            currentSong,
            songs: songList
          }
        : null
    });
  });

  // 3. Tocar / Adicionar Música no Servidor pelo Painel (com suporte a fila, próxima ou imediata)
  app.post('/api/player/play', async (req, res) => {
    const { guildId, query, voiceChannelId, mode = 'queue' } = req.body;
    if (!guildId || !query) {
      return res.status(400).json({ error: 'Parâmetros guildId e query são obrigatórios!' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado!' });
    }

    let voiceChannel = null;
    if (voiceChannelId) {
      voiceChannel = guild.channels.cache.get(voiceChannelId);
    }

    // Se não especificado, tenta canal atual do bot ou o primeiro canal com humanos
    if (!voiceChannel) {
      const botVoice = distube.voices.get(guildId);
      if (botVoice?.channel) {
        voiceChannel = botVoice.channel;
      } else {
        voiceChannel = guild.channels.cache
          .filter((c) => c.isVoiceBased())
          .find((c) => c.members.some((m) => !m.user.bot));
      }
    }

    if (!voiceChannel) {
      voiceChannel = guild.channels.cache.find((c) => c.isVoiceBased());
    }

    if (!voiceChannel) {
      return res.status(400).json({ error: 'Nenhum canal de voz disponível no servidor!' });
    }

    const textChannel =
      guild.channels.cache.find(
        (c) => !c.isVoiceBased() && c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages')
      ) || guild.systemChannel;

    const existingQueue = distube.getQueue(guildId);
    const playOptions = {
      textChannel: textChannel || undefined,
      member: guild.members.me
    };

    if (existingQueue && existingQueue.songs.length > 0) {
      if (mode === 'now') {
        playOptions.skip = true;
        existingQueue._isSkipped = true;
      } else if (mode === 'next') {
        playOptions.position = 1;
      }
    }

    try {
      await distube.play(voiceChannel, query, playOptions);

      const actionLabel =
        mode === 'now' && existingQueue
          ? 'Tocando agora'
          : mode === 'next' && existingQueue
          ? 'Adicionada como próxima'
          : existingQueue
          ? 'Adicionada à fila'
          : 'Tocando';

      return res.json({
        success: true,
        voiceChannel: { id: voiceChannel.id, name: voiceChannel.name },
        message: `${actionLabel}: "${query}" na call 🔊 ${voiceChannel.name}!`
      });
    } catch (err) {
      if (existingQueue && mode === 'now') {
        existingQueue._isSkipped = false;
      }
      console.error('[Dashboard API] Erro ao tocar:', err);
      return res.status(500).json({ error: err.message || 'Erro ao processar música' });
    }
  });

  // 4. Pausar / Despausar
  app.post('/api/player/pause', (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    if (queue.paused) {
      queue.resume();
      res.json({ success: true, paused: false, message: 'Música despausada!' });
    } else {
      queue.pause();
      res.json({ success: true, paused: true, message: 'Música pausada!' });
    }
  });

  // 5. Pular Música
  app.post('/api/player/skip', async (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    try {
      if (queue.songs.length <= 1 && !queue.autoplay) {
        await queue.stop();
        res.json({ success: true, message: 'Última música finalizada!' });
      } else {
        queue._isSkipped = true;
        await queue.skip();
        res.json({ success: true, message: 'Música pulada com sucesso!' });
      }
    } catch (err) {
      queue._isSkipped = false;
      res.status(500).json({ error: err.message || 'Erro ao pular música' });
    }
  });

  // 6. Voltar para Música Anterior
  app.post('/api/player/previous', async (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    try {
      queue._isSkipped = true;
      const song = await queue.previous();
      res.json({ success: true, message: `Voltando para "${song?.name || 'faixa anterior'}"!` });
    } catch (err) {
      queue._isSkipped = false;
      res.status(400).json({ error: 'Não há música anterior disponível no histórico!' });
    }
  });

  // 7. Avançar / Voltar tempo da música atual (Seek)
  app.post('/api/player/seek', async (req, res) => {
    const { guildId, time } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    const timeSec = Math.floor(Number(time));
    if (!Number.isFinite(timeSec) || timeSec < 0) {
      return res.status(400).json({ error: 'Tempo inválido para avançar na faixa!' });
    }

    try {
      await queue.seek(timeSec);
      res.json({ success: true, time: timeSec, message: `Reprodução movida para ${queue.formattedCurrentTime}!` });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Erro ao avançar na faixa' });
    }
  });

  // 8. Parar e Sair
  app.post('/api/player/stop', async (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (queue) {
      await queue.stop().catch(() => {});
    }
    distube.voices.leave(guildId);
    res.json({ success: true, message: 'Música parada e bot desconectado!' });
  });

  // 9. Ajustar Volume (1 a 200%)
  app.post('/api/player/volume', (req, res) => {
    const { guildId, volume } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    const vol = parseInt(volume, 10);
    if (isNaN(vol) || vol < 1 || vol > 200) {
      return res.status(400).json({ error: 'Volume deve ser um número entre 1 e 200!' });
    }

    queue.setVolume(vol);
    res.json({ success: true, volume: vol, message: `Volume ajustado para ${vol}%!` });
  });

  // 10. Alternar Autoplay
  app.post('/api/player/autoplay', (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    const autoplay = queue.toggleAutoplay();
    res.json({ success: true, autoplay, message: `Autoplay ${autoplay ? 'Ativado' : 'Desativado'}!` });
  });

  // 11. Alternar Repetição (0 = OFF, 1 = Música, 2 = Fila)
  app.post('/api/player/repeat', (req, res) => {
    const { guildId, mode } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    const currentMode = typeof queue.repeatMode === 'number' ? queue.repeatMode : 0;
    const requestedMode = mode !== undefined && mode !== null ? parseInt(mode, 10) : (currentMode + 1) % 3;
    const targetMode = [0, 1, 2].includes(requestedMode) ? requestedMode : 0;
    const repeatMode = queue.setRepeatMode(targetMode);

    const labels = { 0: 'Desligado', 1: 'Repetir Música Atual', 2: 'Repetir Toda a Fila' };
    res.json({ success: true, repeatMode, message: `Repetição: ${labels[repeatMode] || 'Desligado'}!` });
  });

  // 12. Embaralhar a Fila de Espera
  app.post('/api/player/shuffle', async (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue || queue.songs.length <= 2) {
      return res.status(400).json({ error: 'É necessário ter ao menos 2 músicas aguardando na fila para embaralhar!' });
    }

    try {
      await queue.shuffle();
      res.json({ success: true, message: 'Fila de músicas embaralhada!' });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Erro ao embaralhar fila' });
    }
  });

  // 13. Mover Bot de Canal de Voz / Call pelo Site
  app.post('/api/player/voice/move', async (req, res) => {
    const { guildId, voiceChannelId } = req.body;
    if (!guildId || !voiceChannelId) {
      return res.status(400).json({ error: 'Informe o servidor e a call de destino!' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado!' });
    }

    const targetChannel = guild.channels.cache.get(voiceChannelId);
    if (!targetChannel || !targetChannel.isVoiceBased()) {
      return res.status(404).json({ error: 'Canal de voz selecionado não encontrado!' });
    }

    try {
      await distube.voices.join(targetChannel);
      res.json({
        success: true,
        voiceChannel: { id: targetChannel.id, name: targetChannel.name },
        message: `Bot movido para a call 🔊 ${targetChannel.name}!`
      });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Erro ao conectar na call selecionada' });
    }
  });

  // ==========================================
  // ROTAS DE GESTÃO COMPLETA DA FILA (OWNER)
  // ==========================================

  // Pular diretamente para uma música da fila (remove as anteriores)
  app.post('/api/player/queue/jump', async (req, res) => {
    const { guildId, index } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue || !queue.songs?.length) {
      return res.status(400).json({ error: 'Nenhuma fila ativa neste servidor!' });
    }

    const targetIndex = parseInt(index, 10);
    if (!Number.isInteger(targetIndex) || targetIndex < 1 || targetIndex >= queue.songs.length) {
      return res.status(400).json({ error: 'Posição inválida na fila!' });
    }

    const targetName = queue.songs[targetIndex]?.name || 'faixa';
    queue._isSkipped = true;
    try {
      await queue.jump(targetIndex);
      res.json({
        success: true,
        skippedCount: targetIndex,
        message: `Pulando para "${targetName}" (${targetIndex} anterior(es) removida(s))!`
      });
    } catch (err) {
      queue._isSkipped = false;
      res.status(500).json({ error: err.message || 'Erro ao pular para a faixa selecionada' });
    }
  });

  // Reordenar música dentro da fila (subir, descer, topo ou drag-and-drop)
  app.post('/api/player/queue/move', (req, res) => {
    const { guildId, fromIndex, toIndex } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue || queue.songs.length <= 1) {
      return res.status(400).json({ error: 'Nenhuma música aguardando na fila para mover!' });
    }

    const from = parseInt(fromIndex, 10);
    const to = parseInt(toIndex, 10);
    const maxIndex = queue.songs.length - 1;

    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      from > maxIndex ||
      to < 1 ||
      to > maxIndex
    ) {
      return res.status(400).json({ error: 'Posições inválidas para reordenar a fila!' });
    }

    if (from === to) {
      return res.json({ success: true, message: 'A música já está nessa posição!' });
    }

    const [movedSong] = queue.songs.splice(from, 1);
    queue.songs.splice(to, 0, movedSong);

    res.json({
      success: true,
      message: `"${movedSong.name}" movida para a posição #${to} da fila!`
    });
  });

  // Remover uma música específica da fila de espera
  app.post('/api/player/queue/remove', (req, res) => {
    const { guildId, index } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue || queue.songs.length <= 1) {
      return res.status(400).json({ error: 'Nenhuma música aguardando na fila para remover!' });
    }

    const targetIndex = parseInt(index, 10);
    if (!Number.isInteger(targetIndex) || targetIndex < 1 || targetIndex >= queue.songs.length) {
      return res.status(400).json({ error: 'Posição inválida para remover da fila!' });
    }

    const [removed] = queue.songs.splice(targetIndex, 1);
    res.json({
      success: true,
      removedName: removed.name,
      message: `Música "${removed.name}" removida da fila!`
    });
  });

  // Limpar todas as músicas seguintes mantendo apenas a atual
  app.post('/api/player/queue/clear', (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue || queue.songs.length <= 1) {
      return res.status(400).json({ error: 'Não há músicas aguardando na fila para limpar!' });
    }

    const removedCount = queue.songs.length - 1;
    queue.songs.splice(1);
    res.json({
      success: true,
      removedCount,
      message: `Fila limpa! ${removedCount} música(s) removida(s).`
    });
  });

  // ==========================================
  // ROTAS DO GERENCIADOR VIP
  // ==========================================

  // Planos VIP disponíveis
  app.get('/api/vip/plans', (req, res) => {
    res.json(vipManager.VIP_PLANS);
  });

  // Listar todas as Chaves VIP
  app.get('/api/vip/keys', (req, res) => {
    res.json(vipManager.getAllKeys());
  });

  // Gerar nova chave VIP
  app.post('/api/vip/keys/generate', (req, res) => {
    const { planId, note } = req.body;
    const key = vipManager.createVipKey(planId || '30d', note || 'Painel Local');
    res.json({ success: true, key });
  });

  // Deletar / Revogar chave VIP
  app.delete('/api/vip/keys/:code', (req, res) => {
    const { code } = req.params;
    const deleted = vipManager.deleteKey(code);
    if (deleted) {
      res.json({ success: true, message: `Chave ${code} excluída com sucesso!` });
    } else {
      res.status(404).json({ error: 'Chave não encontrada!' });
    }
  });

  // Listar todos os Servidores VIP
  app.get('/api/vip/guilds', (req, res) => {
    res.json(vipManager.getAllVipGuilds());
  });

  // Ativação Direta de VIP em um servidor pelo painel
  app.post('/api/vip/guilds/activate', (req, res) => {
    const { guildId, planId, note } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado no bot!' });
    }

    const result = vipManager.setDirectVip(guild.id, guild.name, planId || '30d', note);
    res.json({ success: true, result });
  });

  // Remover VIP de um servidor
  app.delete('/api/vip/guilds/:guildId', (req, res) => {
    const { guildId } = req.params;
    const removed = vipManager.removeVip(guildId);
    if (removed) {
      res.json({ success: true, message: 'VIP do servidor removido com sucesso!' });
    } else {
      res.status(404).json({ error: 'Servidor não possui VIP cadastrado!' });
    }
  });

  // Inicia o servidor HTTP
  const server = app.listen(port, () => {
    console.log(`\x1b[1;33m[PAINEL WEB]\x1b[0m \x1b[1;36m🌐 Painel de Controle Chlorine Music disponível em: \x1b[1;32mhttp://localhost:${port}\x1b[0m`);
  });

  return { app, server };
}

module.exports = { createDashboardServer };
