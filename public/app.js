/* ==============================================================
   CHLORINE MUSIC™ • JAVASCRIPT DO PAINEL LOCALHOST
   ============================================================== */

let currentGuildId = null;
let selectedPlanId = '30d';
let plansData = {};
let pollTimer = null;
let currentSongDurationSec = 0;
let dragSourceIndex = null;

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
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

// ==============================================================
// CONTROLE DE ABAS (TABS)
// ==============================================================
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(`tab-${targetTab}`);
      if (targetContent) targetContent.classList.add('active');

      if (targetTab === 'vip') {
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

    // Seleciona primeiro servidor com música tocando ou o primeiro da lista
    if (!currentGuildId && data.guilds.length > 0) {
      const preferredGuild = data.guilds.find((g) => g.hasActiveQueue) || data.guilds[0];
      currentGuildId = preferredGuild.id;
      serverSelect.value = currentGuildId;
      loadGuildQueue(currentGuildId);
    }

    // Renderiza grid de servidores na aba 3
    renderGuildsGrid(data.guilds);
  } catch (err) {
    console.error('Erro ao carregar status:', err);
  }
}

// Renderiza a lista de servidores conectados
function renderGuildsGrid(guilds) {
  const container = document.getElementById('guilds-grid-container');
  container.innerHTML = '';

  guilds.forEach((g) => {
    const card = document.createElement('div');
    card.className = 'guild-card';

    const iconUrl = g.icon || '/assets/chlorine_gold.webp';
    const vipBadge = g.isVip
      ? '<span class="badge badge-gold">👑 VIP Ativo</span>'
      : '<span class="badge badge-normal">Normal</span>';
    const callBadge = g.voiceChannelName
      ? `<span class="badge badge-cyan" style="margin-left: 6px;">🔊 ${escapeHtml(g.voiceChannelName)}</span>`
      : '';

    card.innerHTML = `
      <img src="${iconUrl}" alt="${escapeHtml(g.name)}" class="guild-icon">
      <div class="guild-info">
        <h4>${escapeHtml(g.name)}</h4>
        <p class="guild-members">👥 ${g.memberCount} membros</p>
        <div style="margin-top: 6px;">${vipBadge}${callBadge}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelector('[data-tab="player"]').click();
      document.getElementById('server-select').value = g.id;
      currentGuildId = g.id;
      loadGuildQueue(g.id);
    });

    container.appendChild(card);
  });
}

// ==============================================================
// FILA & REPRODUÇÃO DO SERVIDOR SELECIONADO
// ==============================================================
async function loadGuildQueue(guildId, isPolling = false) {
  if (!guildId) return;

  try {
    const res = await fetch(`/api/guild/${guildId}`);
    const data = await res.json();
    if (data.error) return;

    // Atualiza badge VIP do servidor
    const vipBadgeContainer = document.getElementById('server-vip-badge');
    if (data.guild.isVip) {
      vipBadgeContainer.innerHTML = `<span class="badge badge-gold">👑 SERVIDOR VIP • ${escapeHtml(data.guild.vipInfo?.formattedRemaining || 'Ativo')}</span>`;
    } else {
      vipBadgeContainer.innerHTML = `<span class="badge badge-normal">Servidor Normal</span>`;
    }

    const activeVoice = data.queue?.voiceChannel || data.activeVoiceChannel || null;

    // Popula canais de voz (sem perder a seleção atual durante polling)
    const voiceSelect = document.getElementById('quick-play-voice');
    const isSelectFocused = document.activeElement === voiceSelect;
    if (!isPolling || !isSelectFocused) {
      const previousVal = !isPolling ? '' : voiceSelect.value;
      voiceSelect.innerHTML = '<option value="">Canal de voz automático</option>';
      data.voiceChannels.forEach((vc) => {
        const opt = document.createElement('option');
        opt.value = vc.id;
        const isBotHere = activeVoice && activeVoice.id === vc.id;
        opt.textContent = `${isBotHere ? '🎙️ [BOT AQUI] ' : '🔊 '}${vc.name} (${vc.membersCount} online)`;
        voiceSelect.appendChild(opt);
      });
      if (previousVal && data.voiceChannels.some((vc) => vc.id === previousVal)) {
        voiceSelect.value = previousVal;
      }
    }

    // Atualiza indicador da call ativa em cima e dentro do card
    const serverVoicePill = document.getElementById('server-voice-pill');
    const playerVoiceBadge = document.getElementById('player-voice-badge');
    const quickCallHint = document.getElementById('quick-play-call-hint');
    if (activeVoice?.name) {
      serverVoicePill.textContent = `🔊 Call: ${activeVoice.name}`;
      serverVoicePill.style.display = 'inline-block';
      playerVoiceBadge.textContent = `🔊 Call: ${activeVoice.name}`;
      playerVoiceBadge.style.display = 'inline-block';
      quickCallHint.textContent = `🔊 Tocando na call: ${activeVoice.name}`;
    } else {
      serverVoicePill.style.display = 'none';
      playerVoiceBadge.style.display = 'none';
      quickCallHint.textContent = 'Bot fora de chamada de voz no momento';
    }

    const q = data.queue;
    const thumbEl = document.getElementById('track-thumb');
    const titleEl = document.getElementById('track-title');
    const metaEl = document.getElementById('track-meta');
    const fillEl = document.getElementById('progress-fill');
    const curTimeEl = document.getElementById('current-time');
    const totTimeEl = document.getElementById('total-time');
    const statusBadge = document.getElementById('player-status-badge');
    const soundwave = document.getElementById('soundwave');
    const pauseIcon = document.getElementById('pause-icon');
    const autoplayBtn = document.getElementById('btn-autoplay');
    const repeatBtn = document.getElementById('btn-repeat');
    const repeatText = document.getElementById('repeat-text');
    const prevBtn = document.getElementById('btn-previous');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeVal = document.getElementById('volume-val');

    if (q && q.currentSong) {
      const song = q.currentSong;
      const callSuffix = activeVoice?.name ? ` • 🔊 Call: ${activeVoice.name}` : '';
      titleEl.textContent = song.name;
      titleEl.title = song.name;
      metaEl.textContent = `Pedido por: ${song.user} • Duração: ${song.formattedDuration}${callSuffix}`;
      thumbEl.src = song.thumbnail || '/assets/chlorine_gold.webp';

      curTimeEl.textContent = q.formattedCurrentTime || '00:00';
      totTimeEl.textContent = song.formattedDuration || '00:00';

      const totalSec = song.duration > 0 ? song.duration : parseDurationSec(song.formattedDuration);
      currentSongDurationSec = totalSec;
      const progressPercent = q.currentTime > 0 ? Math.min(100, (q.currentTime / Math.max(1, totalSec)) * 100) : 0;
      fillEl.style.width = `${progressPercent}%`;

      if (q.paused) {
        statusBadge.textContent = '⏸️ Pausado';
        statusBadge.className = 'queue-status-badge badge badge-normal';
        soundwave.style.display = 'none';
        pauseIcon.textContent = '▶️';
      } else {
        statusBadge.textContent = '▶️ Tocando';
        statusBadge.className = 'queue-status-badge badge badge-cyan';
        soundwave.style.display = 'flex';
        pauseIcon.textContent = '⏸️';
      }

      if (q.autoplay) {
        autoplayBtn.classList.add('active');
        document.getElementById('autoplay-text').textContent = 'Autoplay: ON';
      } else {
        autoplayBtn.classList.remove('active');
        document.getElementById('autoplay-text').textContent = 'Autoplay: OFF';
      }

      const repeatMode = q.repeatMode || 0;
      if (repeatMode === 1) {
        repeatBtn.classList.add('active');
        repeatText.textContent = 'Repetir: Música';
      } else if (repeatMode === 2) {
        repeatBtn.classList.add('active');
        repeatText.textContent = 'Repetir: Fila';
      } else {
        repeatBtn.classList.remove('active');
        repeatText.textContent = 'Repetir: OFF';
      }

      prevBtn.disabled = !q.canPrevious;
      volumeSlider.value = q.volume;
      volumeVal.textContent = `${q.volume}%`;

      if (dragSourceIndex === null) {
        renderQueueList(q.songs, activeVoice?.name || null);
      }
    } else {
      currentSongDurationSec = 0;
      titleEl.textContent = 'Nenhuma música tocando no momento';
      titleEl.title = '';
      metaEl.textContent = activeVoice?.name
        ? `Bot conectado em 🔊 ${activeVoice.name} • Dê play abaixo!`
        : 'Use o formulário abaixo para tocar qualquer música no canal!';
      thumbEl.src = '/assets/chlorine_gold.webp';
      fillEl.style.width = '0%';
      curTimeEl.textContent = '00:00';
      totTimeEl.textContent = '00:00';
      statusBadge.textContent = 'Parado';
      statusBadge.className = 'queue-status-badge badge badge-normal';
      soundwave.style.display = 'none';
      pauseIcon.textContent = '⏸️';
      repeatBtn.classList.remove('active');
      repeatText.textContent = 'Repetir: OFF';
      prevBtn.disabled = true;

      renderQueueList([], activeVoice?.name || null);
    }
  } catch (err) {
    console.error('Erro ao carregar fila:', err);
  }
}

function parseDurationSec(str) {
  if (!str) return 1;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 1;
}

// Renderiza a lista de músicas da fila com controles completos do Owner (pular, reordenar, arrastar, remover)
function renderQueueList(songs, activeVoiceName = null) {
  const container = document.getElementById('queue-list');
  const countEl = document.getElementById('queue-count');
  const previousScrollTop = container.scrollTop;
  countEl.textContent = songs.length;

  if (songs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🎵</span>
        <p>Nenhuma música na fila deste servidor.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  const maxUpcomingIdx = songs.length - 1;

  songs.forEach((s, idx) => {
    const item = document.createElement('div');
    const isPlaying = idx === 0;
    item.className = `queue-item ${isPlaying ? 'playing' : ''}`;

    const safeName = escapeHtml(s.name);
    const safeUser = escapeHtml(s.user);
    const callInfoText = isPlaying && activeVoiceName ? ` • 🔊 ${escapeHtml(activeVoiceName)}` : '';
    const subText = isPlaying ? `Tocando agora${callInfoText}` : `Pedido por: ${safeUser}`;

    const actionsHtml = isPlaying
      ? ''
      : `
        <div class="queue-actions">
          <button type="button" class="q-act-btn q-play" title="Pular para esta música agora (remove as anteriores)" onclick="jumpQueueItem(${idx})">▶</button>
          <button type="button" class="q-act-btn" title="Tocar em seguida (#1)" onclick="moveQueueItem(${idx}, 1)" ${idx === 1 ? 'disabled' : ''}>⏫</button>
          <button type="button" class="q-act-btn" title="Subir na fila" onclick="moveQueueItem(${idx}, ${idx - 1})" ${idx === 1 ? 'disabled' : ''}>⬆️</button>
          <button type="button" class="q-act-btn" title="Descer na fila" onclick="moveQueueItem(${idx}, ${idx + 1})" ${idx === maxUpcomingIdx ? 'disabled' : ''}>⬇️</button>
          <button type="button" class="q-act-btn q-del" title="Remover da fila" onclick="removeQueueItem(${idx})">✕</button>
        </div>
      `;

    item.innerHTML = `
      ${isPlaying ? '' : '<span class="queue-drag-handle" title="Arraste para reordenar">⋮⋮</span>'}
      <span class="queue-index">${isPlaying ? '▶' : idx}</span>
      <img src="${s.thumbnail || '/assets/chlorine_gold.webp'}" alt="Thumb" class="queue-thumb">
      <div class="queue-info">
        <div class="queue-name" title="${safeName}">${safeName}</div>
        <div class="queue-req">${subText}</div>
      </div>
      <div class="queue-duration">${escapeHtml(s.formattedDuration || '00:00')}</div>
      ${actionsHtml}
    `;

    if (!isPlaying) {
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (e) => {
        dragSourceIndex = idx;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      });
      item.addEventListener('dragend', () => {
        dragSourceIndex = null;
        document.querySelectorAll('.queue-item').forEach((el) => el.classList.remove('dragging', 'drag-over'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragSourceIndex !== null && dragSourceIndex !== idx) {
          item.classList.add('drag-over');
        }
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const fromIdx = dragSourceIndex;
        dragSourceIndex = null;
        if (fromIdx !== null && fromIdx >= 1 && fromIdx !== idx) {
          moveQueueItem(fromIdx, idx);
        }
      });
    }

    container.appendChild(item);
  });

  container.scrollTop = previousScrollTop;
}

async function sendPlayerAction(endpoint, body = {}, refreshDelayMs = 200) {
  if (!currentGuildId) {
    showToast('Nenhum servidor selecionado!', true);
    return null;
  }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: currentGuildId, ...body })
    });
    const data = await res.json();
    if (data.success) {
      if (data.message) showToast(data.message);
      setTimeout(() => loadGuildQueue(currentGuildId), refreshDelayMs);
    } else {
      showToast(data.error || 'Erro ao executar comando', true);
    }
    return data;
  } catch (err) {
    showToast('Falha na comunicação com o servidor do bot', true);
    return null;
  }
}

window.jumpQueueItem = (index) => sendPlayerAction('/api/player/queue/jump', { index }, 500);
window.moveQueueItem = (fromIndex, toIndex) => sendPlayerAction('/api/player/queue/move', { fromIndex, toIndex }, 100);
window.removeQueueItem = (index) => sendPlayerAction('/api/player/queue/remove', { index }, 100);

// ==============================================================
// CONTROLES DO PLAYER (PLAY, PAUSE, SKIP, FILA, CALL, ETC.)
// ==============================================================
function setupPlayerControls() {
  const serverSelect = document.getElementById('server-select');
  serverSelect.addEventListener('change', (e) => {
    currentGuildId = e.target.value;
    loadGuildQueue(currentGuildId);
  });

  async function triggerQuickPlay() {
    const queryInput = document.getElementById('quick-play-input');
    const query = queryInput.value.trim();
    const voiceChannelId = document.getElementById('quick-play-voice').value;
    const mode = document.getElementById('quick-play-mode').value;
    if (!query) {
      showToast('Por favor, digite o nome de uma música ou link!', true);
      return;
    }
    if (!currentGuildId) {
      showToast('Nenhum servidor selecionado!', true);
      return;
    }

    showToast(`Buscando "${query}"...`);
    const data = await sendPlayerAction('/api/player/play', { query, voiceChannelId, mode }, 1400);
    if (data?.success) {
      queryInput.value = '';
    }
  }

  // Botão Play Rápido + Enter no campo
  document.getElementById('btn-quick-play').addEventListener('click', triggerQuickPlay);
  document.getElementById('quick-play-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerQuickPlay();
    }
  });

  // Mover bot para a call selecionada
  document.getElementById('btn-move-voice').addEventListener('click', () => {
    const voiceChannelId = document.getElementById('quick-play-voice').value;
    if (!voiceChannelId) {
      showToast('Escolha um canal de voz na lista ao lado para mover o bot!', true);
      return;
    }
    sendPlayerAction('/api/player/voice/move', { voiceChannelId }, 500);
  });

  // Avançar / voltar clicando na barra de progresso
  document.getElementById('progress-bar-seek').addEventListener('click', (e) => {
    if (!currentGuildId || currentSongDurationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = Math.floor(ratio * currentSongDurationSec);
    sendPlayerAction('/api/player/seek', { time: targetSec }, 400);
  });

  document.getElementById('btn-previous').addEventListener('click', () => sendPlayerAction('/api/player/previous', {}, 700));
  document.getElementById('btn-pause').addEventListener('click', () => sendPlayerAction('/api/player/pause', {}, 150));
  document.getElementById('btn-skip').addEventListener('click', () => sendPlayerAction('/api/player/skip', {}, 800));
  document.getElementById('btn-stop').addEventListener('click', () => sendPlayerAction('/api/player/stop', {}, 300));
  document.getElementById('btn-autoplay').addEventListener('click', () => sendPlayerAction('/api/player/autoplay', {}, 150));
  document.getElementById('btn-repeat').addEventListener('click', () => sendPlayerAction('/api/player/repeat', {}, 150));
  document.getElementById('btn-shuffle').addEventListener('click', () => sendPlayerAction('/api/player/shuffle', {}, 150));

  document.getElementById('btn-clear-queue').addEventListener('click', () => {
    if (!currentGuildId) return;
    if (!confirm('Deseja limpar todas as músicas aguardando na fila (mantendo a música atual)?')) return;
    sendPlayerAction('/api/player/queue/clear', {}, 150);
  });

  // Volume Slider
  const volumeSlider = document.getElementById('volume-slider');
  volumeSlider.addEventListener('change', (e) => {
    const vol = e.target.value;
    document.getElementById('volume-val').textContent = `${vol}%`;
    if (currentGuildId) {
      sendPlayerAction('/api/player/volume', { volume: vol }, 200);
    }
  });

  // Atualizar fila manualmente
  document.getElementById('btn-refresh-queue').addEventListener('click', () => {
    if (currentGuildId) loadGuildQueue(currentGuildId);
  });
}

// ==============================================================
// SISTEMA VIP & GERADOR DE CÓDIGOS
// ==============================================================
async function loadPlans() {
  try {
    const res = await fetch('/api/vip/plans');
    plansData = await res.json();

    const grid = document.getElementById('plans-selector-grid');
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
  // Gerar Novo Código VIP
  document.getElementById('btn-generate-key').addEventListener('click', async () => {
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
        showToast(`Código VIP para ${key.planName} gerado!`);

        // Exibe a caixinha de resultado
        const box = document.getElementById('generated-box');
        const codeDisplay = document.getElementById('generated-code-display');
        const cmdExample = document.getElementById('gen-command-example');

        codeDisplay.value = key.code;
        cmdExample.textContent = `!setvip ${key.code}`;
        box.style.display = 'block';

        // Atualiza a tabela
        loadVipTables();
      }
    } catch (e) {
      showToast('Erro ao gerar código VIP', true);
    }
  });

  // Copiar Código com 1 Clique
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('generated-code-display').value;
    navigator.clipboard.writeText(code).then(() => {
      showToast('📋 Código VIP copiado para a área de transferência!');
    });
  });

  // Ativação Direta em Servidor
  document.getElementById('btn-direct-activate').addEventListener('click', async () => {
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
    } catch (e) {
      showToast('Erro na requisição', true);
    }
  });

  // Botões de atualizar tabelas
  document.getElementById('btn-refresh-vips').addEventListener('click', loadVipTables);
  document.getElementById('btn-refresh-keys').addEventListener('click', loadVipTables);
}

// Carrega as tabelas de VIPs e Códigos
async function loadVipTables() {
  loadVipGuildsTable();
  loadVipKeysTable();
}

async function loadVipGuildsTable() {
  try {
    const res = await fetch('/api/vip/guilds');
    const guilds = await res.json();
    const tbody = document.getElementById('vip-guilds-tbody');

    if (guilds.length === 0) {
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
        <td><strong>${g.guildName}</strong><br><small style="color:var(--text-muted)">${g.guildId}</small></td>
        <td><span class="pill-gold">${g.planName}</span></td>
        <td><strong>${g.formattedRemaining}</strong></td>
        <td>${g.formattedExpiresAt}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" style="color: var(--danger); border-color: rgba(239,68,68,0.3)" onclick="revokeGuildVip('${g.guildId}')">
            ❌ Revogar
          </button>
        </td>
      `;

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

    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma chave gerada ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    keys.forEach((k) => {
      const tr = document.createElement('tr');
      const statusBadge = k.used
        ? '<span class="badge badge-cyan">🔵 Usado</span>'
        : '<span class="badge badge-gold">🟢 Disponível</span>';

      const usedInfo = k.usedInGuildName
        ? `<strong>${k.usedInGuildName}</strong>`
        : '<span style="color:var(--text-muted)">Não utilizado</span>';

      tr.innerHTML = `
        <td><code>${k.code}</code></td>
        <td>${k.planName}</td>
        <td>${k.durationDays} dias</td>
        <td>${statusBadge}</td>
        <td>${usedInfo}</td>
        <td><small style="color:var(--text-secondary)">${k.note || '-'}</small></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="copyKeyText('${k.code}')">📋 Copiar</button>
          <button class="btn btn-sm btn-outline" style="color: var(--danger)" onclick="deleteVipKey('${k.code}')">🗑️</button>
        </td>
      `;

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
    }
  } catch (e) {
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
    }
  } catch (e) {
    showToast('Erro ao revogar VIP', true);
  }
};
