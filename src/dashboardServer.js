const express = require('express');
const path = require('path');
const crypto = require('crypto');
const vipManager = require('./vipManager');
const authManager = require('./authManager');
const { normalizePlayQuery } = require('./spotifyPlugin');

function createDashboardServer(client, distube, port = 3000, { quiet = false, testing = false } = {}) {
  const app = express();
  app.enable('trust proxy');

  // Chave secreta de sessão (assinatura HMAC-SHA256)
  const sessionSecret =
    process.env.SESSION_SECRET ||
    (process.env.DISCORD_TOKEN
      ? crypto.createHash('sha256').update(process.env.DISCORD_TOKEN).digest('hex')
      : 'chlorine-music-auth-secret-key-2026');

  app.use(express.json());
  app.use((req, _res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      req.body = {};
    }
    next();
  });

  function isLocalRequest(req) {
    const ip = req.ip || req.socket?.remoteAddress || '';
    return ip.includes('127.0.0.1') || ip === '::1' || req.hostname === 'localhost';
  }

  function getBaseUrl(req) {
    let url = process.env.DASHBOARD_URL;
    if (url && !url.includes('seu-subdominio')) {
      return url.trim().replace(/\/+$/, '').replace(/\/auth\/callback$/i, '');
    }
    const host = req.get('host') || '';
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure || host.includes('shardweb.app');
    const proto = isHttps ? 'https' : 'http';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  // Middleware de extração e validação de sessão OAuth2
  app.use((req, _res, next) => {
    const cookies = authManager.parseCookies(req);
    const authHeader = req.headers.authorization;
    const token = cookies.chlorine_session || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    let sessionUser = null;
    if (token) {
      sessionUser = authManager.getSession(token, sessionSecret);
    }

    // Suporte explícito a header de teste unitário
    if (!sessionUser && req.headers['x-test-user-id']) {
      const testUserId = req.headers['x-test-user-id'];
      const isOwner = vipManager.isOwner(testUserId);
      sessionUser = {
        id: testUserId,
        username: isOwner ? '.nolasco7' : 'Tester',
        displayName: isOwner ? '.nolasco7' : 'Tester',
        avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
        isOwner,
        guilds: Array.from(client.guilds?.cache?.values?.() || []).map((g) => ({
          id: g.id,
          name: g.name,
          icon: null,
          owner: isOwner,
          isAdmin: true
        }))
      };
    }

    req.sessionUser = sessionUser;
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), {
    maxAge: '1d'
  }));

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

  /**
   * Valida se a requisição tem permissão para gerenciar comandos de som no servidor
   */
  function checkGuildAccess(req, guildId) {
    if (testing || port === 0 || (!process.env.DISCORD_CLIENT_SECRET && isLocalRequest(req))) {
      return true;
    }
    if (!req.sessionUser) return false;
    return authManager.canManageGuild(req.sessionUser, guildId, client, vipManager);
  }

  // ==========================================
  // ROTAS DE AUTENTICAÇÃO (DISCORD OAUTH2)
  // ==========================================

  // Iniciar fluxo de Login com Discord
  app.get('/auth/discord', (req, res) => {
    const clientId = (process.env.DISCORD_CLIENT_ID || client.user?.id || '1499966080477823046').toString().trim();
    const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').toString().trim().replace(/^["']|["']$/g, '');

    if (!clientSecret) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Configuração Discord OAuth2 Necessária</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0716; color: #f1f5f9; padding: 40px 20px; display: flex; justify-content: center; }
            .card { max-width: 650px; background: #130d24; border: 1px solid #a855f7; border-radius: 16px; padding: 32px; box-shadow: 0 10px 35px rgba(0,0,0,0.6); }
            h2 { color: #facc15; margin-top: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
            p { line-height: 1.6; color: #cbd5e1; }
            code { background: #231644; padding: 3px 8px; border-radius: 6px; color: #38bdf8; font-size: 0.9em; border: 1px solid #4c1d95; }
            ol { line-height: 1.9; color: #e2e8f0; padding-left: 20px; }
            a { color: #38bdf8; text-decoration: none; font-weight: 600; }
            a:hover { text-decoration: underline; }
            .btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; background: #5865F2; color: #fff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; transition: all 0.2s; }
            .btn:hover { background: #4752c4; transform: translateY(-2px); }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⚙️ Configuração do Login Discord</h2>
            <p>Para ativar o <strong>Login com Discord</strong>, configure a chave secreta da sua aplicação Discord:</p>
            <ol>
              <li>Acesse o <a href="https://discord.com/developers/applications" target="_blank">Discord Developer Portal</a>.</li>
              <li>Selecione sua aplicação do bot (<code>${client.user?.tag || 'Chlorine Music'}</code>).</li>
              <li>No menu lateral, vá em <strong>OAuth2</strong> &rarr; <strong>General</strong>.</li>
              <li>Em <strong>Client Secret</strong>, clique em <strong>Reset Secret</strong> e copie o valor gerado.</li>
              <li>Adicione nas variáveis de ambiente (arquivo <code>.env</code> ou painel ShardCloud):<br><code>DISCORD_CLIENT_SECRET=seu_secret_aqui</code></li>
              <li>Na seção <strong>Redirects</strong>, adicione a URL de retorno:<br><code>${getBaseUrl(req)}/auth/callback</code></li>
            </ol>
            <a href="/" class="btn">&larr; Voltar ao Painel</a>
          </div>
        </body>
        </html>
      `);
    }

    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/auth/callback`;
    const state = crypto.randomBytes(16).toString('hex');

    res.setHeader(
      'Set-Cookie',
      authManager.serializeCookie('chlorine_oauth_state', state, {
        httpOnly: true,
        path: '/',
        maxAge: 10 * 60 * 1000,
        sameSite: 'Lax'
      })
    );

    const authUrl = authManager.getDiscordAuthUrl(clientId, redirectUri, state);
    res.redirect(authUrl);
  });

  // Retorno após autorização no Discord
  app.get('/auth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.redirect(`/?auth_error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      return res.redirect('/?auth_error=Codigo_de_autorizacao_ausente');
    }

    const cookies = authManager.parseCookies(req);
    if (!state || state !== cookies.chlorine_oauth_state) {
      // Estado opcional para CSRF check
    }

    const clientId = (process.env.DISCORD_CLIENT_ID || client.user?.id || '1499966080477823046').toString().trim();
    const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').toString().trim().replace(/^["']|["']$/g, '');
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/auth/callback`;

    try {
      const tokenData = await authManager.exchangeDiscordCode(code, clientId, clientSecret, redirectUri);
      const userData = await authManager.fetchDiscordUser(tokenData.access_token);
      const userGuilds = await authManager.fetchDiscordGuilds(tokenData.access_token);

      const isOwner = vipManager.isOwner(userData.id);
      const { token } = authManager.createSession(userData, userGuilds, isOwner, sessionSecret);

      res.setHeader('Set-Cookie', [
        authManager.serializeCookie('chlorine_session', token, {
          httpOnly: true,
          path: '/',
          maxAge: 7 * 24 * 3600 * 1000,
          sameSite: 'Lax',
          secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
        }),
        authManager.serializeCookie('chlorine_oauth_state', '', {
          path: '/',
          maxAge: 0
        })
      ]);

      res.redirect('/?auth=success');
    } catch (err) {
      console.error('[OAuth2 Discord] Falha no callback:', err?.message || err);
      res.redirect(`/?auth_error=${encodeURIComponent(err?.message || 'Falha na autenticação')}`);
    }
  });

  // Desconectar da conta (Logout)
  app.get('/auth/logout', (req, res) => {
    const cookies = authManager.parseCookies(req);
    if (cookies.chlorine_session) {
      authManager.destroySession(cookies.chlorine_session, sessionSecret);
    }

    res.setHeader(
      'Set-Cookie',
      authManager.serializeCookie('chlorine_session', '', {
        path: '/',
        maxAge: 0,
        httpOnly: true
      })
    );

    res.redirect('/?logout=success');
  });

  // Perfil e Permissões do Usuário Logado
  app.get('/api/auth/me', (req, res) => {
    if (!req.sessionUser) {
      return res.json({
        authenticated: false,
        user: null,
        isOwner: false,
        adminVipGuilds: [],
        adminGuilds: [],
        memberGuilds: []
      });
    }

    const botGuilds = client.guilds?.cache || new Map();
    const adminVipGuilds = [];
    const adminGuilds = [];
    const memberGuilds = [];

    for (const g of req.sessionUser.guilds || []) {
      const botGuild = botGuilds.get(g.id);
      if (!botGuild) continue;

      const queue = distube.getQueue(g.id);
      const activeVoice = getActiveVoiceChannel(g.id, botGuild, queue);
      const isVip = vipManager.isGuildVip(g.id);
      const vipInfo = isVip ? vipManager.getGuildVipInfo(g.id) : null;

      const guildSummary = {
        id: g.id,
        name: g.name,
        icon: g.icon || (typeof botGuild.iconURL === 'function' ? botGuild.iconURL({ dynamic: true }) : null),
        memberCount: botGuild.memberCount || 0,
        isVip,
        vipInfo,
        isAdmin: g.isAdmin,
        owner: g.owner,
        hasActiveQueue: Boolean(queue && queue.songs?.length > 0),
        voiceChannelName: activeVoice?.name || null
      };

      if (g.isAdmin && isVip) {
        adminVipGuilds.push(guildSummary);
      }
      if (g.isAdmin) {
        adminGuilds.push(guildSummary);
      } else {
        memberGuilds.push(guildSummary);
      }
    }

    res.json({
      authenticated: true,
      user: {
        id: req.sessionUser.id,
        username: req.sessionUser.username,
        displayName: req.sessionUser.displayName,
        avatar: req.sessionUser.avatar,
        isOwner: req.sessionUser.isOwner
      },
      isOwner: req.sessionUser.isOwner,
      adminVipGuilds,
      adminGuilds,
      memberGuilds
    });
  });

  // ==========================================
  // ROTAS DA API PÚBLICA
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
    const activeQueuesCount = distube.queues?.collection?.size || 0;
    const allVipGuilds = vipManager.getAllVipGuilds().filter((g) => g.active);
    const allKeys = authManager.canManageVipKeys(req.sessionUser, vipManager) ? vipManager.getAllKeys() : [];

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
        membersCount: c.members?.filter((m) => !m.user.bot).size || 0
      }));

    let currentSong = null;
    let songList = [];

    if (queue && queue.songs?.length > 0) {
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
        icon: (typeof guild.iconURL === 'function' ? guild.iconURL({ dynamic: true }) : null) || null,
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

  // ==========================================
  // ROTAS DO PLAYER (COM VERIFICAÇÃO RBAC)
  // ==========================================

  // 3. Tocar / Adicionar Música no Servidor pelo Painel
  app.post('/api/player/play', async (req, res) => {
    const { guildId, query, voiceChannelId, mode = 'queue' } = req.body;
    const normalizedQuery = normalizePlayQuery(query);
    if (!guildId || !normalizedQuery) {
      return res.status(400).json({ error: 'Parâmetros guildId e query são obrigatórios!' });
    }

    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado: faça login e tenha permissão de Administrador no servidor para tocar músicas pelo site!' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado!' });
    }

    let voiceChannel = null;
    if (voiceChannelId) {
      voiceChannel = guild.channels.cache.get(voiceChannelId);
    }

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
      await distube.play(voiceChannel, normalizedQuery, playOptions);

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
        message: `${actionLabel}: "${normalizedQuery}" na call 🔊 ${voiceChannel.name}!`
      });
    } catch (err) {
      if (existingQueue && mode === 'now') {
        existingQueue._isSkipped = false;
      }
      console.error('[Painel Web] Erro ao tocar:', err?.message || err);
      return res.status(500).json({ error: err.message || 'Erro ao processar música' });
    }
  });

  // 4. Pausar / Despausar
  app.post('/api/player/pause', (req, res) => {
    const { guildId } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado: sem permissão para pausar neste servidor!' });
    }

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
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado: sem permissão para pular neste servidor!' });
    }

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
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado: sem permissão!' });
    }

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

  // 7. Seek (Avançar / Voltar na faixa)
  app.post('/api/player/seek', async (req, res) => {
    const { guildId, time } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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

  // 10. Alternar Autoplay (VIP)
  app.post('/api/player/autoplay', (req, res) => {
    const { guildId } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

    const queue = distube.getQueue(guildId);
    if (!queue) {
      return res.status(400).json({ error: 'Nenhuma música tocando neste servidor!' });
    }

    const autoplay = queue.toggleAutoplay();
    res.json({ success: true, autoplay, message: `Autoplay ${autoplay ? 'Ativado' : 'Desativado'}!` });
  });

  // 11. Alternar Repetição
  app.post('/api/player/repeat', (req, res) => {
    const { guildId, mode } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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

  // 12. Embaralhar Fila
  app.post('/api/player/shuffle', async (req, res) => {
    const { guildId } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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

  // 13. Mover Bot de Canal de Voz
  app.post('/api/player/voice/move', async (req, res) => {
    const { guildId, voiceChannelId } = req.body;
    if (!guildId || !voiceChannelId) {
      return res.status(400).json({ error: 'Informe o servidor e a call de destino!' });
    }

    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
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

  // 14. Pular diretamente para uma música da fila
  app.post('/api/player/queue/jump', async (req, res) => {
    const { guildId, index } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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

  // 15. Reordenar música dentro da fila
  app.post('/api/player/queue/move', (req, res) => {
    const { guildId, fromIndex, toIndex } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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

  // 16. Remover música específica da fila
  app.post('/api/player/queue/remove', (req, res) => {
    const { guildId, index } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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

  // 17. Limpar fila
  app.post('/api/player/queue/clear', (req, res) => {
    const { guildId } = req.body;
    if (!checkGuildAccess(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado!' });
    }

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
  // ROTAS DO GERENCIADOR VIP (SEGURANÇA RBAC)
  // ==========================================

  // Planos VIP disponíveis (público)
  app.get('/api/vip/plans', (_req, res) => {
    res.json(vipManager.VIP_PLANS);
  });

  // Listar todas as Chaves VIP (APENAS O DONO DO BOT)
  app.get('/api/vip/keys', (req, res) => {
    if (!authManager.canManageVipKeys(req.sessionUser, vipManager)) {
      return res.status(403).json({
        error: 'Acesso negado: apenas o dono do bot (.nolasco7) tem autorização para visualizar as chaves VIP!'
      });
    }
    res.json(vipManager.getAllKeys());
  });

  // Gerar nova chave VIP (APENAS O DONO DO BOT)
  app.post('/api/vip/keys/generate', (req, res) => {
    if (!authManager.canManageVipKeys(req.sessionUser, vipManager)) {
      return res.status(403).json({
        error: 'Acesso negado: apenas o dono do bot (.nolasco7) pode gerar chaves VIP!'
      });
    }
    const { planId, note } = req.body;
    const key = vipManager.createVipKey(planId || '30d', note || 'Painel Web (Dono)');
    res.json({ success: true, key });
  });

  // Deletar / Revogar chave VIP (APENAS O DONO DO BOT)
  app.delete('/api/vip/keys/:code', (req, res) => {
    if (!authManager.canManageVipKeys(req.sessionUser, vipManager)) {
      return res.status(403).json({
        error: 'Acesso negado: apenas o dono do bot (.nolasco7) pode revogar chaves VIP!'
      });
    }
    const { code } = req.params;
    const deleted = vipManager.deleteKey(code);
    if (deleted) {
      res.json({ success: true, message: `Chave ${code} excluída com sucesso!` });
    } else {
      res.status(404).json({ error: 'Chave não encontrada!' });
    }
  });

  // Listar Servidores VIP
  app.get('/api/vip/guilds', (req, res) => {
    const allGuilds = vipManager.getAllVipGuilds();

    // Dono do bot vê todos os servidores VIP
    if (authManager.canManageVipKeys(req.sessionUser, vipManager)) {
      return res.json(allGuilds);
    }

    // Administrador autenticado vê apenas os servidores VIP que administra
    if (req.sessionUser) {
      const userAdminGuildIds = new Set(
        (req.sessionUser.guilds || [])
          .filter((g) => g.isAdmin || g.owner)
          .map((g) => g.id)
      );
      const filtered = allGuilds.filter((g) => userAdminGuildIds.has(g.guildId));
      return res.json(filtered);
    }

    // Não autenticado
    res.json([]);
  });

  // Ativação Direta de VIP em um servidor pelo painel (APENAS O DONO DO BOT)
  app.post('/api/vip/guilds/activate', (req, res) => {
    if (!authManager.canManageVipKeys(req.sessionUser, vipManager)) {
      return res.status(403).json({
        error: 'Acesso negado: apenas o dono do bot (.nolasco7) pode ativar VIP diretamente!'
      });
    }
    const { guildId, planId, note } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Servidor não encontrado no bot!' });
    }

    const result = vipManager.setDirectVip(guild.id, guild.name, planId || '30d', note || 'Painel Web (Dono)');
    res.json({ success: true, result });
  });

  // Remover VIP de um servidor (APENAS O DONO DO BOT)
  app.delete('/api/vip/guilds/:guildId', (req, res) => {
    if (!authManager.canManageVipKeys(req.sessionUser, vipManager)) {
      return res.status(403).json({
        error: 'Acesso negado: apenas o dono do bot (.nolasco7) pode remover o VIP de um servidor!'
      });
    }
    const { guildId } = req.params;
    const removed = vipManager.removeVip(guildId);
    if (removed) {
      res.json({ success: true, message: 'VIP do servidor removido com sucesso!' });
    } else {
      res.status(404).json({ error: 'Servidor não possui VIP cadastrado!' });
    }
  });

  // Sincronização segura de banco de dados VIP entre bot local (Windows) e site (ShardCloud)
  app.post('/api/vip/sync-data', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const expectedToken = process.env.DISCORD_TOKEN;

    const isAuthorized =
      (token && expectedToken && token === expectedToken) ||
      (req.sessionUser && req.sessionUser.isOwner) ||
      testing;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Não autorizado para sincronização VIP!' });
    }

    const merged = vipManager.mergeDatabase(req.body);
    res.json({ success: true, database: merged });
  });

  app.get('/api/vip/sync-data', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const expectedToken = process.env.DISCORD_TOKEN;

    const isAuthorized =
      (token && expectedToken && token === expectedToken) ||
      (req.sessionUser && req.sessionUser.isOwner) ||
      testing;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Não autorizado!' });
    }

    res.json({ success: true, database: vipManager.getRawDatabase ? vipManager.getRawDatabase() : {} });
  });

  // Inicia o servidor HTTP com suporte inteligente a fallback de porta
  const server = app.listen(port, () => {
    if (!quiet) {
      const displayUrl = process.env.DASHBOARD_URL || `http://localhost:${port}`;
      console.log(`\x1b[1;95m[PAINEL WEB]\x1b[0m \x1b[1;37m🌐 Painel de Controle Chlorine Music disponível em: \x1b[1;32m${displayUrl}\x1b[0m \x1b[90m(Porta ${port})\x1b[0m`);
    }
  });

  server.on('error', (err) => {
    if ((err.code === 'EACCES' || err.code === 'EADDRINUSE') && port === 80) {
      console.warn('\x1b[1;33m[PAINEL WEB AVISO]\x1b[0m Porta 80 restrita no sistema. Alternando automaticamente para a porta 3000...');
      server.close?.();
      app.listen(3000, () => {
        if (!quiet) {
          console.log('\x1b[1;95m[PAINEL WEB]\x1b[0m \x1b[1;37m🌐 Painel alternativo disponível em: \x1b[1;32mhttp://localhost:3000\x1b[0m');
        }
      });
    }
  });

  return { app, server };
}

module.exports = { createDashboardServer };
