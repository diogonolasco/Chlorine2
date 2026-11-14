/* ==============================================================
   CHLORINE MUSIC™ • JAVASCRIPT DO PAINEL WEB & RBAC
   ============================================================== */

const DEFAULT_ICON_URL = '/bot_logo.png';

let currentGuildId = null;
let selectedPlanId = '30d';
let plansData = {};
let pollTimer = null;
let currentSongDurationSec = 0;
let dragSourceIndex = null;

// Estado de Autenticação e Permissões
let currentUser = null;
let isOwner = false;
let adminVipGuilds = [];
let adminGuilds = [];

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  checkUrlParams();
  await loadAuthMe();
  loadPlans();
  loadStatus();
  setupPlayerControls();
  setupVipControls();

  // Polling automático a cada 2.5s para manter o player atualizado
  pollTimer = setInterval(() => {
    if (currentGuildId) {
      loadGuildQueue(currentGuildId, true);
    }
  }, 2500);
});

// Toast de Notificação
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--gold-primary)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Verifica parâmetros de URL (Retorno do OAuth2)
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth') === 'success') {
    showToast('🎉 Conectado com sucesso pelo Discord!');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('auth_error')) {
    showToast(`⚠️ Erro ao entrar com Discord: ${params.get('auth_error')}`, true);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('logout') === 'success') {
    showToast('👋 Desconectado da conta com sucesso!');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ==============================================================
// AUTENTICAÇÃO DISCORD & VERIFICAÇÃO RBAC
// ==============================================================
async function loadAuthMe() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    const btnLogin = document.getElementById('btn-login-discord');
    const userBadge = document.getElementById('user-profile-badge');
    const authBanner = document.getElementById('auth-banner-card');
    const ownerTabBtn = document.getElementById('tab-btn-owner-vip');
    const myVipsTabBtn = document.getElementById('tab-btn-my-vips');

    if (data.authenticated && data.user) {
      currentUser = data.user;
      isOwner = Boolean(data.isOwner);
      adminVipGuilds = data.adminVipGuilds || [];
      adminGuilds = data.adminGuilds || [];

      // Exibe perfil do usuário
      btnLogin.style.display = 'none';
      authBanner.style.display = 'none';
      userBadge.style.display = 'flex';

      document.getElementById('user-avatar').src = currentUser.avatar || DEFAULT_ICON_URL;
      document.getElementById('user-name').textContent = currentUser.displayName || currentUser.username;

      const roleBadge = document.getElementById('user-role-badge');
      if (isOwner) {
        roleBadge.className = 'badge badge-owner';
        roleBadge.textContent = '👑 Dono';
      } else if (adminVipGuilds.length > 0) {
        roleBadge.className = 'badge badge-vip-admin';
        roleBadge.textContent = '💎 Admin VIP';
      } else if (adminGuilds.length > 0) {
        roleBadge.className = 'badge badge-purple';
        roleBadge.textContent = '🛡️ Admin';
      } else {
        roleBadge.className = 'badge badge-member';
        roleBadge.textContent = '🎧 Membro';
      }

      // SEGURANÇA: Aba de Dono (Gerador de Chaves) só aparece para o criador!
      if (isOwner) {
        ownerTabBtn.style.display = 'inline-flex';
      } else {
        ownerTabBtn.style.display = 'none';
      }

      // Aba Meus Servidores VIP (para administradores de servidores com VIP)
      if (adminVipGuilds.length > 0 || (isOwner && adminGuilds.length > 0)) {
        myVipsTabBtn.style.display = 'inline-flex';
        const displayVips = adminVipGuilds.length > 0 ? adminVipGuilds : adminGuilds.filter(g => g.isVip);
        document.getElementById('nav-my-vips-count').textContent = displayVips.length;
        document.getElementById('my-vips-badge').textContent = `${displayVips.length} Servidores`;
        renderMyVipGuilds(displayVips);
      } else {
        myVipsTabBtn.style.display = 'none';
      }
    } else {
      // Deslogado / Visitante
      currentUser = null;
      isOwner = false;
      adminVipGuilds = [];
      adminGuilds = [];

      btnLogin.style.display = 'inline-flex';
      userBadge.style.display = 'none';
      authBanner.style.display = 'flex';
      ownerTabBtn.style.display = 'none';
      myVipsTabBtn.style.display = 'none';
    }
  } catch (err) {
    console.error('Erro ao verificar sessão do usuário:', err);
  }
}

// Renderiza a lista de servidores VIP que o usuário administra
function renderMyVipGuilds(guilds) {
  const container = document.getElementById('my-vips-grid');
  container.innerHTML = '';

  if (guilds.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 30px;">
        <span>💎</span>
        <p>Você não administra nenhum servidor com VIP ativo no momento.</p>
      </div>
    `;
    return;
  }

  guilds.forEach((g) => {
    const card = document.createElement('div');
    card.className = 'guild-card guild-card-vip';

    const iconUrl = g.icon || DEFAULT_ICON_URL;
    const planName = g.vipInfo?.planName || 'VIP Ativo';
    const remaining = g.vipInfo?.remainingFormatted || 'Ativo';

    card.innerHTML = `
      <div class="guild-card-header">
        <div class="guild-card-avatar-wrap">
          <img src="${escapeHtml(iconUrl)}" alt="Ícone" class="guild-card-icon" onerror="this.src='${DEFAULT_ICON_URL}'">
          <span class="guild-avatar-badge-vip" title="Servidor VIP">👑</span>
        </div>
        <div class="guild-card-title">
          <h4 title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</h4>
          <span class="guild-card-id">ID: ${escapeHtml(g.id)}</span>
        </div>
      </div>
      <div class="guild-card-body">
        <div class="guild-chips-row">
          <span class="chip chip-members">👥 <strong>${g.memberCount}</strong> membros</span>
          <span class="chip chip-vip">👑 ${escapeHtml(planName)}</span>
        </div>
        <div class="guild-chips-row">
          <span class="chip chip-time">⏳ Restante: <strong>${escapeHtml(remaining)}</strong></span>
          <span class="chip chip-voice ${g.voiceChannelName ? 'active' : ''}">
            🔊 ${escapeHtml(g.voiceChannelName || 'Sem call')}
          </span>
        </div>
      </div>
      <div class="guild-card-footer">
        <button class="btn btn-gold btn-select-my-vip" data-guild-id="${escapeHtml(g.id)}">
          <span>🎛️ Controlar no Player</span>
          <svg class="btn-arrow" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42 5.43 5.43H5v2z"/></svg>
        </button>
      </div>
    `;

    card.querySelector('.btn-select-my-vip').addEventListener('click', () => {
      selectGuildInPlayer(g.id);
    });

    container.appendChild(card);
  });
}

// Seleciona o servidor no player e troca para a aba 1
function selectGuildInPlayer(guildId) {
  currentGuildId = guildId;
  const select = document.getElementById('server-select');
  if (select) select.value = guildId;

  // Troca para a aba Player
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

  const playerBtn = document.querySelector('.tab-btn[data-tab="player"]');
  const playerContent = document.getElementById('tab-player');
  if (playerBtn) playerBtn.classList.add('active');
  if (playerContent) playerContent.classList.add('active');

  loadGuildQueue(guildId);
  showToast('🎮 Servidor selecionado no player!');
}

// ==============================================================
// CONTROLE DE ABAS (TABS)
// ==============================================================
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Proteção no clique da aba VIP para não-owners
      if (targetTab === 'vip' && !isOwner) {
        showToast('🔒 Acesso negado: apenas o dono do bot pode acessar o gerenciador de chaves!', true);
        return;
      }

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(`tab-${targetTab}`);
      if (targetContent) targetContent.classList.add('active');

      if (targetTab === 'vip' && isOwner) {
        loadVipTables();
      }
    });
  });
}

// ==============================================================
// STATUS GERAL DO BOT & SERVIDORES
// ==============================================================
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.error) return;

    // Atualiza badges da navbar
    document.getElementById('bot-tag').textContent = data.bot.tag || data.bot.username;
    document.getElementById('bot-ping').textContent = `Ping: ${data.bot.ping}ms`;
    document.getElementById('nav-guilds-count').textContent = data.stats.totalGuilds;
    document.getElementById('guilds-total-badge').textContent = `${data.stats.totalGuilds} Servidores`;

    // Popula seletor de servidores
    const serverSelect = document.getElementById('server-select');
    const directGuildSelect = document.getElementById('direct-guild-select');

    serverSelect.innerHTML = '';
    directGuildSelect.innerHTML = '';

    if (data.guilds.length === 0) {
      serverSelect.innerHTML = '<option value="">Nenhum servidor conectado</option>';
      directGuildSelect.innerHTML = '<option value="">Nenhum servidor conectado</option>';
      return;
    }

    data.guilds.forEach((g) => {
      const vipIcon = g.isVip ? '👑 ' : '';
      const callSuffix = g.voiceChannelName ? ` • 🔊 ${g.voiceChannelName}` : '';
      const activeQueueIcon = g.hasActiveQueue ? ` 🎵${callSuffix}` : '';
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${vipIcon}${g.name} (${g.memberCount} membros)${activeQueueIcon}`;

      serverSelect.appendChild(opt);

      const directOpt = opt.cloneNode(true);
      directGuildSelect.appendChild(directOpt);
    });

    // Seleciona servidor inicial
    if (!currentGuildId && data.guilds.length > 0) {
      const preferredGuild = data.guilds.find((g) => g.hasActiveQueue) || data.guilds[0];
      currentGuildId = preferredGuild.id;
      serverSelect.value = currentGuildId;
      loadGuildQueue(currentGuildId);
    }

    // Renderiza grid de servidores na aba 4
    renderGuildsGrid(data.guilds);
  } catch (err) {
    console.error('Erro ao carregar status:', err);
  }
}

// Renderiza a lista de todos os servidores conectados
function renderGuildsGrid(guilds) {
  const container = document.getElementById('guilds-grid-container');
  container.innerHTML = '';

  guilds.forEach((g) => {
    const card = document.createElement('div');
    card.className = g.isVip ? 'guild-card guild-card-vip' : 'guild-card';

    const iconUrl = g.icon || DEFAULT_ICON_URL;
    const isVip = Boolean(g.isVip);
    const planName = g.vipInfo?.planName || (isVip ? 'VIP Ativo' : 'Plano Livre');

    const playingTag = g.hasActiveQueue
      ? '<span class="chip chip-playing">🎵 Tocando Agora</span>'
      : '<span class="chip chip-idle">⏸️ Parado</span>';

    const callChip = g.voiceChannelName
      ? `<span class="chip chip-voice active">🔊 ${escapeHtml(g.voiceChannelName)}</span>`
      : `<span class="chip chip-voice">🔊 Sem call</span>`;

    card.innerHTML = `
      <div class="guild-card-header">
        <div class="guild-card-avatar-wrap">
          <img src="${escapeHtml(iconUrl)}" alt="Ícone" class="guild-card-icon" onerror="this.src='${DEFAULT_ICON_URL}'">
          ${isVip ? '<span class="guild-avatar-badge-vip" title="Servidor VIP">👑</span>' : ''}
        </div>
        <div class="guild-card-title">
          <h4 title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</h4>
          <span class="guild-card-id">ID: ${escapeHtml(g.id)}</span>
        </div>
      </div>
      <div class="guild-card-body">
        <div class="guild-chips-row">
          <span class="chip chip-members">👥 <strong>${g.memberCount}</strong> membros</span>
          ${isVip ? `<span class="chip chip-vip">👑 ${escapeHtml(planName)}</span>` : '<span class="chip chip-normal">Livre</span>'}
        </div>
        <div class="guild-chips-row">
          ${playingTag}
          ${callChip}
        </div>
      </div>
      <div class="guild-card-footer">
        <button class="btn ${isVip ? 'btn-gold' : 'btn-purple-outline'} btn-select-guild" data-guild-id="${escapeHtml(g.id)}">
          <span>🎛️ Abrir no Player</span>
          <svg class="btn-arrow" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42 5.43 5.43H5v2z"/></svg>
        </button>
      </div>
    `;

    card.querySelector('.btn-select-guild').addEventListener('click', () => {
      selectGuildInPlayer(g.id);
    });

    container.appendChild(card);
  });
}

// ==============================================================
// CARREGAMENTO DA FILA & ESTADO DO PLAYER
// ==============================================================
async function loadGuildQueue(guildId, isPolling = false) {
  if (!guildId) return;

  try {
    const res = await fetch(`/api/guild/${guildId}`);
    const data = await res.json();
    if (data.error) return;

    // Atualiza status VIP do servidor selecionado
    const vipBadgeContainer = document.getElementById('server-vip-badge');
    const playerCard = document.querySelector('.now-playing-card');
    const serverBar = document.querySelector('.server-bar');

    if (data.guild.isVip) {
      if (playerCard) playerCard.classList.add('is-vip');
      if (serverBar) serverBar.classList.add('is-vip');
      const planName = data.guild.vipInfo?.planName || 'VIP Ativo';
      const remaining = data.guild.vipInfo?.remainingFormatted || 'Ativo';
      vipBadgeContainer.innerHTML = `<span class="badge badge-gold" title="Tempo restante: ${escapeHtml(remaining)}">👑 ${escapeHtml(planName)}</span>`;
    } else {
      if (playerCard) playerCard.classList.remove('is-vip');
      if (serverBar) serverBar.classList.remove('is-vip');
      vipBadgeContainer.innerHTML = '<span class="badge badge-purple">Servidor Conectado</span>';
    }

    // Atualiza badges de Call de Voz
    const serverVoicePill = document.getElementById('server-voice-pill');
    const playerVoiceBadge = document.getElementById('player-voice-badge');
    const callHint = document.getElementById('quick-play-call-hint');

    if (data.activeVoiceChannel?.name) {
      const callName = `🔊 Call: ${data.activeVoiceChannel.name}`;
      serverVoicePill.textContent = callName;
      serverVoicePill.style.display = 'inline-block';
      playerVoiceBadge.textContent = callName;
      playerVoiceBadge.style.display = 'inline-block';
      callHint.textContent = `Conectado na call: 🔊 ${data.activeVoiceChannel.name}`;
      callHint.style.color = 'var(--purple-light)';
    } else {
      serverVoicePill.style.display = 'none';
      playerVoiceBadge.style.display = 'none';
      callHint.textContent = 'Nenhuma call conectada no momento';
      callHint.style.color = 'var(--text-muted)';
    }

    // Popula dropdown de canais de voz para troca de call
    if (!isPolling && data.voiceChannels) {
      const voiceSelect = document.getElementById('quick-play-voice');
      voiceSelect.innerHTML = '<option value="">Canal de voz automático</option>';
      data.voiceChannels.forEach((vc) => {
        const opt = document.createElement('option');
        opt.value = vc.id;
        opt.textContent = `🔊 ${vc.name} (${vc.membersCount} ouvintes)`;
        if (data.activeVoiceChannel && data.activeVoiceChannel.id === vc.id) {
          opt.selected = true;
        }
        voiceSelect.appendChild(opt);
      });
    }

    const queue = data.queue;
    const playerStatusBadge = document.getElementById('player-status-badge');
    const trackThumb = document.getElementById('track-thumb');
    const trackTitle = document.getElementById('track-title');
    const trackMeta = document.getElementById('track-meta');
    const soundwave = document.getElementById('soundwave');
    const pauseIcon = document.getElementById('pause-icon');
    const repeatBtn = document.getElementById('btn-repeat');
    const repeatText = document.getElementById('repeat-text');
    const autoplayBtn = document.getElementById('btn-autoplay');
    const autoplayText = document.getElementById('autoplay-text');
    const progressFill = document.getElementById('progress-fill');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');

    if (queue && queue.currentSong) {
      const song = queue.currentSong;
      currentSongDurationSec = song.duration || 0;

      playerStatusBadge.textContent = queue.paused ? 'Pausado' : 'Tocando';
      playerStatusBadge.className = `queue-status-badge badge ${queue.paused ? 'badge-normal' : (data.guild?.isVip ? 'badge-gold' : 'badge-purple')}`;

      trackThumb.src = song.thumbnail || DEFAULT_ICON_URL;
      trackTitle.textContent = song.name;
      trackMeta.innerHTML = `👤 Adicionado por: <strong>${escapeHtml(song.user)}</strong> • Duração: <strong>${escapeHtml(song.formattedDuration)}</strong>`;

      pauseIcon.textContent = queue.paused ? '▶️' : '⏸️';

      // Soundwave animation
      soundwave.style.display = queue.paused ? 'none' : 'flex';

      // Progresso
      const curSec = Math.floor(queue.currentTime || 0);
      const totalSec = currentSongDurationSec;
      const pct = totalSec > 0 ? Math.min(100, (curSec / totalSec) * 100) : 0;

      progressFill.style.width = `${pct}%`;
      currentTimeEl.textContent = queue.formattedCurrentTime || '00:00';
      totalTimeEl.textContent = song.formattedDuration || '00:00';

      // Volume slider
      if (!isPolling) {
        document.getElementById('volume-slider').value = queue.volume;
        document.getElementById('volume-val').textContent = `${queue.volume}%`;
      }

      // Repetição
      const repeatModes = { 0: 'Repetir: OFF', 1: 'Repetir: Música', 2: 'Repetir: Fila' };
      repeatText.textContent = repeatModes[queue.repeatMode] || 'Repetir: OFF';
      repeatBtn.classList.toggle('active', queue.repeatMode > 0);

      // Autoplay
      autoplayText.textContent = `Autoplay: ${queue.autoplay ? 'ON' : 'OFF'}`;
      autoplayBtn.classList.toggle('active', queue.autoplay);

      // Renderiza lista da fila
      renderQueueList(queue.songs);
      document.getElementById('queue-count').textContent = queue.songsCount;
    } else {
      // Estado Parado
      currentSongDurationSec = 0;
      playerStatusBadge.textContent = 'Parado';
      playerStatusBadge.className = 'queue-status-badge badge badge-normal';
      trackThumb.src = DEFAULT_ICON_URL;
      trackTitle.textContent = 'Nenhuma música tocando no momento';
      trackMeta.textContent = 'Selecione uma faixa e dê play abaixo!';
      soundwave.style.display = 'none';
      pauseIcon.textContent = '⏸️';
      progressFill.style.width = '0%';
      currentTimeEl.textContent = '00:00';
      totalTimeEl.textContent = '00:00';
      repeatText.textContent = 'Repetir: OFF';
      repeatBtn.classList.remove('active');
      autoplayText.textContent = 'Autoplay: OFF';
      autoplayBtn.classList.remove('active');

      document.getElementById('queue-list').innerHTML = `
        <div class="empty-state">
          <span>🎵</span>
          <p>Nenhuma música na fila deste servidor.</p>
        </div>
      `;
      document.getElementById('queue-count').textContent = '0';
    }
  } catch (err) {
    if (!isPolling) console.error('Erro ao carregar fila:', err);
  }
}

// Renderiza a lista de músicas da fila com botões e drag-and-drop
function renderQueueList(songs) {
  const container = document.getElementById('queue-list');
  container.innerHTML = '';

  if (!songs || songs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🎵</span>
        <p>Nenhuma música na fila deste servidor.</p>
      </div>
    `;
    return;
  }

  songs.forEach((song, idx) => {
    const item = document.createElement('div');
    item.className = `queue-item ${idx === 0 ? 'current' : ''}`;
    item.setAttribute('data-index', idx);

    if (idx > 0) {
      item.setAttribute('draggable', 'true');
    }

    const badgeLabel = idx === 0 ? '▶ Tocando' : `#${idx}`;
    const thumbUrl = song.thumbnail || DEFAULT_ICON_URL;

    let actionsHtml = '';
    if (idx > 0) {
      actionsHtml = `
        <div class="queue-item-actions">
          <button class="queue-action-btn btn-queue-jump" title="Pular direto para esta música" data-idx="${idx}">⏭️</button>
          <button class="queue-action-btn btn-queue-up" title="Mover para cima" data-idx="${idx}" ${idx === 1 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
          <button class="queue-action-btn btn-queue-down" title="Mover para baixo" data-idx="${idx}" ${idx === songs.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
          <button class="queue-action-btn btn-queue-remove" title="Remover da fila" data-idx="${idx}" style="color:var(--danger)">🗑️</button>
        </div>
      `;
    }

    item.innerHTML = `
      <span class="queue-item-num">${badgeLabel}</span>
      <img src="${escapeHtml(thumbUrl)}" alt="Thumb" class="queue-item-thumb">
      <div class="queue-item-info">
        <h5>${escapeHtml(song.name)}</h5>
        <span>⏱️ ${escapeHtml(song.formattedDuration)} • 👤 ${escapeHtml(song.user)}</span>
      </div>
      ${actionsHtml}
    `;

    // Eventos de Ações na Faixa
    if (idx > 0) {
      item.querySelector('.btn-queue-jump')?.addEventListener('click', () => jumpToQueueIndex(idx));
      item.querySelector('.btn-queue-up')?.addEventListener('click', () => moveQueueItem(idx, idx - 1));
      item.querySelector('.btn-queue-down')?.addEventListener('click', () => moveQueueItem(idx, idx + 1));
      item.querySelector('.btn-queue-remove')?.addEventListener('click', () => removeQueueItem(idx));

      // Drag and Drop
      item.addEventListener('dragstart', (e) => {
        dragSourceIndex = idx;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        dragSourceIndex = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (dragSourceIndex !== null && dragSourceIndex !== idx && idx > 0) {
          moveQueueItem(dragSourceIndex, idx);
        }
      });
    }

    container.appendChild(item);
  });
}

// ==============================================================
// CONTROLES DO PLAYER
// ==============================================================
function setupPlayerControls() {
  // Seletor de Servidor
  document.getElementById('server-select').addEventListener('change', (e) => {
    currentGuildId = e.target.value;
    loadGuildQueue(currentGuildId);
  });

  // Tocar Música
  document.getElementById('btn-quick-play').addEventListener('click', sendPlayRequest);
  document.getElementById('quick-play-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendPlayRequest();
  });

  // Mover Bot de Call
  document.getElementById('btn-move-voice').addEventListener('click', async () => {
    const voiceChannelId = document.getElementById('quick-play-voice').value;
    if (!currentGuildId) return showToast('Selecione um servidor primeiro!', true);
    if (!voiceChannelId) return showToast('Selecione um canal de voz!', true);

    try {
      const res = await fetch('/api/player/voice/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId, voiceChannelId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
      } else {
        showToast(data.error || 'Erro ao mover call', true);
      }
    } catch {
      showToast('Erro na conexão', true);
    }
  });

  // Barra de Progresso Seekable
  const progressBar = document.getElementById('progress-bar-seek');
  progressBar.addEventListener('click', async (e) => {
    if (!currentGuildId || currentSongDurationSec <= 0) return;
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSeconds = Math.floor(pct * currentSongDurationSec);

    try {
      const res = await fetch('/api/player/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId, time: targetSeconds })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
      } else {
        showToast(data.error || 'Erro ao avançar na música', true);
      }
    } catch {
      showToast('Erro ao avançar faixa', true);
    }
  });

  // Pause / Resume
  document.getElementById('btn-pause').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
      } else {
        showToast(data.error || 'Erro', true);
      }
    } catch {
      showToast('Erro na requisição', true);
    }
  });

  // Skip
  document.getElementById('btn-skip').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setTimeout(() => loadGuildQueue(currentGuildId), 400);
      } else {
        showToast(data.error || 'Erro', true);
      }
    } catch {
      showToast('Erro na requisição', true);
    }
  });

  // Previous
  document.getElementById('btn-previous').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/previous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setTimeout(() => loadGuildQueue(currentGuildId), 400);
      } else {
        showToast(data.error || 'Sem faixa anterior no histórico', true);
      }
    } catch {
      showToast('Erro na requisição', true);
    }
  });

  // Stop
  document.getElementById('btn-stop').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
        loadStatus();
      } else {
        showToast(data.error || 'Erro', true);
      }
    } catch {
      showToast('Erro na requisição', true);
    }
  });

  // Repeat Mode Toggle
  document.getElementById('btn-repeat').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/repeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
      }
    } catch {
      showToast('Erro ao alternar repetição', true);
    }
  });

  // Autoplay Toggle (VIP)
  document.getElementById('btn-autoplay').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/autoplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
      }
    } catch {
      showToast('Erro ao alternar autoplay', true);
    }
  });

  // Volume Slider
  const volSlider = document.getElementById('volume-slider');
  const volVal = document.getElementById('volume-val');
  volSlider.addEventListener('input', (e) => {
    volVal.textContent = `${e.target.value}%`;
  });
  volSlider.addEventListener('change', async (e) => {
    if (!currentGuildId) return;
    const volume = parseInt(e.target.value, 10);
    try {
      const res = await fetch('/api/player/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId, volume })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🔊 Volume definido para ${volume}%`);
      }
    } catch {
      showToast('Erro ao alterar volume', true);
    }
  });

  // Toolbar da Fila: Shuffle, Clear, Refresh
  document.getElementById('btn-shuffle').addEventListener('click', async () => {
    if (!currentGuildId) return;
    try {
      const res = await fetch('/api/player/shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast('🔀 Fila embaralhada com sucesso!');
        loadGuildQueue(currentGuildId);
      } else {
        showToast(data.error || 'Erro ao embaralhar', true);
      }
    } catch {
      showToast('Erro na requisição', true);
    }
  });

  document.getElementById('btn-clear-queue').addEventListener('click', async () => {
    if (!currentGuildId) return;
    if (!confirm('Deseja realmente limpar as próximas músicas da fila?')) return;
    try {
      const res = await fetch('/api/player/queue/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadGuildQueue(currentGuildId);
      } else {
        showToast(data.error || 'Erro ao limpar fila', true);
      }
    } catch {
      showToast('Erro na requisição', true);
    }
  });

  document.getElementById('btn-refresh-queue').addEventListener('click', () => {
    if (currentGuildId) loadGuildQueue(currentGuildId);
  });
}

// Envia solicitação de Play
async function sendPlayRequest() {
  const input = document.getElementById('quick-play-input');
  const query = input.value.trim();
  const mode = document.getElementById('quick-play-mode').value;
  const voiceChannelId = document.getElementById('quick-play-voice').value || undefined;

  if (!query) {
    showToast('Digite o nome ou link da música!', true);
    return;
  }

  if (!currentGuildId) {
    showToast('Por favor, selecione um servidor primeiro!', true);
    return;
  }

  showToast('🔍 Buscando e adicionando música...');
  input.value = '';

  try {
    const res = await fetch('/api/player/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: currentGuildId, query, mode, voiceChannelId })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message);
      setTimeout(() => loadGuildQueue(currentGuildId), 600);
      loadStatus();
    } else {
      showToast(data.error || 'Erro ao tocar música', true);
    }
  } catch {
    showToast('Erro na requisição', true);
  }
}

// Manipulação individual da fila
async function jumpToQueueIndex(index) {
  if (!currentGuildId) return;
  try {
    const res = await fetch('/api/player/queue/jump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: currentGuildId, index })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      setTimeout(() => loadGuildQueue(currentGuildId), 500);
    } else {
      showToast(data.error || 'Erro ao pular para música', true);
    }
  } catch {
    showToast('Erro na requisição', true);
  }
}

async function moveQueueItem(fromIndex, toIndex) {
  if (!currentGuildId) return;
  try {
    const res = await fetch('/api/player/queue/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: currentGuildId, fromIndex, toIndex })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      loadGuildQueue(currentGuildId);
    } else {
      showToast(data.error || 'Erro ao mover faixa', true);
    }
  } catch {
    showToast('Erro na requisição', true);
  }
}

async function removeQueueItem(index) {
  if (!currentGuildId) return;
  try {
    const res = await fetch('/api/player/queue/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: currentGuildId, index })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      loadGuildQueue(currentGuildId);
    } else {
      showToast(data.error || 'Erro ao remover faixa', true);
    }
  } catch {
    showToast('Erro na requisição', true);
  }
}

// ==============================================================
// SISTEMA VIP & PAINEL OWNER
// ==============================================================
async function loadPlans() {
  try {
    const res = await fetch('/api/vip/plans');
    plansData = await res.json();

    const grid = document.getElementById('plans-selector-grid');
    if (!grid) return;
    grid.innerHTML = '';

    Object.values(plansData).forEach((p) => {
      const card = document.createElement('div');
      card.className = `plan-card-option ${p.id === selectedPlanId ? 'active' : ''}`;
      card.setAttribute('data-plan-id', p.id);

      const popTag = p.popular
        ? '<span class="plan-tag-pop">⭐ Popular</span>'
        : p.bestValue
        ? '<span class="plan-tag-pop">🚀 Melhor</span>'
        : '';

      card.innerHTML = `
        ${popTag}
        <div class="plan-icon">${p.icon}</div>
        <div class="plan-title">${p.shortName}</div>
        <div class="plan-price">${p.price}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.plan-card-option').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        selectedPlanId = p.id;
      });

      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao carregar planos:', err);
  }
}

function setupVipControls() {
  // Gerar Novo Código VIP (Apenas Dono)
  const btnGenKey = document.getElementById('btn-generate-key');
  if (btnGenKey) {
    btnGenKey.addEventListener('click', async () => {
      if (!isOwner) {
        showToast('🔒 Apenas o dono do bot tem permissão para gerar chaves VIP!', true);
        return;
      }

      const note = document.getElementById('key-note').value.trim();

      try {
        const res = await fetch('/api/vip/keys/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: selectedPlanId, note })
        });
        const data = await res.json();

        if (data.success) {
          const key = data.key;
          showToast(`👑 Código VIP gerado: ${key.code}`);

          const box = document.getElementById('generated-box');
          const codeDisplay = document.getElementById('generated-code-display');
          const cmdExample = document.getElementById('gen-command-example');

          codeDisplay.value = key.code;
          cmdExample.textContent = `!setvip ${key.code}`;
          box.style.display = 'block';

          loadVipTables();
        } else {
          showToast(data.error || 'Erro ao gerar código VIP', true);
        }
      } catch {
        showToast('Erro ao gerar código VIP', true);
      }
    });
  }

  // Copiar Código com 1 Clique
  const btnCopy = document.getElementById('btn-copy-code');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const code = document.getElementById('generated-code-display').value;
      navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Código VIP copiado para a área de transferência!');
      });
    });
  }

  // Ativação Direta em Servidor (Apenas Dono)
  const btnDirect = document.getElementById('btn-direct-activate');
  if (btnDirect) {
    btnDirect.addEventListener('click', async () => {
      if (!isOwner) {
        showToast('🔒 Apenas o dono do bot pode ativar VIP diretamente!', true);
        return;
      }

      const guildId = document.getElementById('direct-guild-select').value;
      const planId = document.getElementById('direct-plan-select').value;
      const note = document.getElementById('direct-note').value.trim();

      if (!guildId) {
        showToast('Por favor, selecione um servidor!', true);
        return;
      }

      try {
        const res = await fetch('/api/vip/guilds/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId, planId, note })
        });
        const data = await res.json();

        if (data.success) {
          showToast('👑 VIP ativado diretamente no servidor com sucesso!');
          loadVipTables();
          loadStatus();
        } else {
          showToast(data.error || 'Erro ao ativar VIP', true);
        }
      } catch {
        showToast('Erro na requisição', true);
      }
    });
  }

  // Botões de atualizar tabelas
  document.getElementById('btn-refresh-vips')?.addEventListener('click', loadVipTables);
  document.getElementById('btn-refresh-keys')?.addEventListener('click', loadVipTables);
}

// Carrega as tabelas de VIPs e Códigos (Apenas Dono)
async function loadVipTables() {
  if (!isOwner) return;
  loadVipGuildsTable();
  loadVipKeysTable();
}

async function loadVipGuildsTable() {
  try {
    const res = await fetch('/api/vip/guilds');
    const guilds = await res.json();
    const tbody = document.getElementById('vip-guilds-tbody');
    if (!tbody) return;

    if (!Array.isArray(guilds) || guilds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum servidor VIP ativo no momento.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    guilds.forEach((g) => {
      const tr = document.createElement('tr');
      const statusBadge = g.active
        ? '<span class="badge badge-gold">🟢 Ativo</span>'
        : '<span class="badge badge-normal">🔴 Expirado</span>';

      tr.innerHTML = `
        <td><strong>${escapeHtml(g.guildName)}</strong><br><small style="color:var(--text-muted)">${escapeHtml(g.guildId)}</small></td>
        <td><span class="pill-gold">${escapeHtml(g.planName)}</span></td>
        <td><strong>${escapeHtml(g.formattedRemaining)}</strong></td>
        <td>${escapeHtml(g.formattedExpiresAt)}</td>
        <td>${statusBadge}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline btn-revoke-vip" style="color: var(--danger); border-color: rgba(239,68,68,0.3)">
            ❌ Revogar
          </button>
        </td>
      `;
      tr.querySelector('.btn-revoke-vip').addEventListener('click', () => window.revokeGuildVip(g.guildId));

      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
  }
}

async function loadVipKeysTable() {
  try {
    const res = await fetch('/api/vip/keys');
    const keys = await res.json();
    const tbody = document.getElementById('vip-keys-tbody');
    if (!tbody) return;

    if (!Array.isArray(keys) || keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma chave gerada ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    keys.forEach((k) => {
      const tr = document.createElement('tr');
      const statusBadge = k.used
        ? '<span class="badge badge-purple">🟣 Usado</span>'
        : '<span class="badge badge-gold">🟢 Disponível</span>';

      const usedInfo = k.usedInGuildName
        ? `<strong>${escapeHtml(k.usedInGuildName)}</strong>`
        : '<span style="color:var(--text-muted)">Não utilizado</span>';

      tr.innerHTML = `
        <td><code>${escapeHtml(k.code)}</code></td>
        <td>${escapeHtml(k.planName)}</td>
        <td>${Number(k.durationDays) || 0} dias</td>
        <td>${statusBadge}</td>
        <td>${usedInfo}</td>
        <td><small style="color:var(--text-secondary)">${escapeHtml(k.note || '-')}</small></td>
        <td>
          <button type="button" class="btn btn-sm btn-outline btn-copy-key">📋 Copiar</button>
          <button type="button" class="btn btn-sm btn-outline btn-delete-key" style="color: var(--danger)">🗑️</button>
        </td>
      `;
      tr.querySelector('.btn-copy-key').addEventListener('click', () => window.copyKeyText(k.code));
      tr.querySelector('.btn-delete-key').addEventListener('click', () => window.deleteVipKey(k.code));

      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
  }
}

// Funções Globais chamadas pelas tabelas
window.copyKeyText = (code) => {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`📋 Código ${code} copiado!`);
  });
};

window.deleteVipKey = async (code) => {
  if (!confirm(`Deseja realmente excluir o código ${code}?`)) return;
  try {
    const res = await fetch(`/api/vip/keys/${encodeURIComponent(code)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      loadVipTables();
    } else {
      showToast(data.error || 'Erro ao excluir', true);
    }
  } catch {
    showToast('Erro ao excluir código', true);
  }
};

window.revokeGuildVip = async (guildId) => {
  if (!confirm('Deseja realmente remover o VIP deste servidor?')) return;
  try {
    const res = await fetch(`/api/vip/guilds/${guildId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      loadVipTables();
      loadStatus();
    } else {
      showToast(data.error || 'Erro ao revogar VIP', true);
    }
  } catch {
    showToast('Erro ao revogar VIP', true);
  }
};
