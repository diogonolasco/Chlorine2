const express = require('express');
const path = require('path');
const vipManager = require('./vipManager');

function createDashboardServer(client, distube, port = 3000) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

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
      const isVip = vipManager.isGuildVip(guild.id);
      const vipInfo = isVip ? vipManager.getGuildVipInfo(guild.id) : null;

      return {
        id: guild.id,
        name: guild.name,
        icon: (typeof guild.iconURL === 'function' ? guild.iconURL({ dynamic: true }) : null) || null,
        memberCount: guild.memberCount || 0,
        isVip,
        vipInfo,
        hasActiveQueue: Boolean(queue && queue.songs?.length > 0)
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

  // 2. Detalhes de um Servidor e sua Fila de Músicas
  app.get('/api/guild/:guildId', (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado!' });
    }

    const queue = distube.getQueue(guildId);
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
        name: song.name,
        url: song.url,
        formattedDuration: song.formattedDuration,
        currentTime: queue.currentTime,
        formattedCurrentTime: queue.formattedCurrentTime,
        thumbnail: song.thumbnail,
        user: song.user?.tag || song.user?.username || 'Dashboard'
      };

      songList = queue.songs.map((s, idx) => ({
        index: idx,
        name: s.name,
        url: s.url,
        formattedDuration: s.formattedDuration,
        thumbnail: s.thumbnail,
        user: s.user?.tag || s.user?.username || 'Membro'
      }));
    }

    res.json({
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ dynamic: true }) || null,
        memberCount: guild.memberCount,
        isVip,
        vipInfo
      },
      voiceChannels,
      queue: queue
        ? {
            playing: !queue.paused,
            paused: queue.paused,
            volume: queue.volume,
            autoplay: queue.autoplay,
            currentTime: queue.currentTime,
            formattedCurrentTime: queue.formattedCurrentTime,
            songsCount: queue.songs.length,
            currentSong,
            songs: songList
          }
        : null
    });
  });

  // 3. Tocar Música no Servidor
  app.post('/api/player/play', async (req, res) => {
    const { guildId, query, voiceChannelId } = req.body;
    if (!guildId || !query) {
      return res.status(400).json({ error: 'Parâmetros guildId e query são obrigatórios!' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado!' });
    }

    // Procura o canal de voz apropriado
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

    // Se ainda não achou, pega qualquer canal de voz
    if (!voiceChannel) {
      voiceChannel = guild.channels.cache.find((c) => c.isVoiceBased());
    }

    if (!voiceChannel) {
      return res.status(400).json({ error: 'Nenhum canal de voz disponível no servidor!' });
    }

    // Procura canal de texto para avisos
    const textChannel =
      guild.channels.cache.find(
        (c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages')
      ) || guild.systemChannel;

    try {
      await distube.play(voiceChannel, query, {
        textChannel: textChannel || undefined,
        member: guild.members.me
      });

      return res.json({ success: true, message: `Tocando "${query}" no canal ${voiceChannel.name}!` });
    } catch (err) {
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
      res.status(500).json({ error: err.message || 'Erro ao pular música' });
    }
  });

  // 6. Parar e Sair
  app.post('/api/player/stop', async (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (queue) {
      await queue.stop().catch(() => {});
    }
    distube.voices.leave(guildId);
    res.json({ success: true, message: 'Música parada e bot desconectado!' });
  });

  // 7. Ajustar Volume
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

  // 8. Alternar Autoplay
  app.post('/api/player/autoplay', (req, res) => {
    const { guildId } = req.body;
    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    const autoplay = queue.toggleAutoplay();
    res.json({ success: true, autoplay, message: `Autoplay ${autoplay ? 'Ativado' : 'Desativado'}!` });
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
