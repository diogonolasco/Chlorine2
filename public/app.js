/* ==============================================================
   CHLORINE MUSIC™ • JAVASCRIPT DO PAINEL LOCALHOST
   ============================================================== */

let currentGuildId = null;
let selectedPlanId = '30d';
let plansData = {};
let pollTimer = null;

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

    data.guilds.forEach((g, idx) => {
      const vipIcon = g.isVip ? '👑 ' : '';
      const activeQueueIcon = g.hasActiveQueue ? ' 🎵' : '';
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${vipIcon}${g.name} (${g.memberCount} membros)${activeQueueIcon}`;

      serverSelect.appendChild(opt);

      const directOpt = opt.cloneNode(true);
      directGuildSelect.appendChild(directOpt);
    });

    // Seleciona o primeiro servidor por padrão se nenhum estiver selecionado
    if (!currentGuildId && data.guilds.length > 0) {
      currentGuildId = data.guilds[0].id;
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

    card.innerHTML = `
      <img src="${iconUrl}" alt="${g.name}" class="guild-icon">
      <div class="guild-info">
        <h4>${g.name}</h4>
        <p class="guild-members">👥 ${g.memberCount} membros</p>
        <div style="margin-top: 6px;">${vipBadge}</div>
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
      vipBadgeContainer.innerHTML = `<span class="badge badge-gold">👑 SERVIDOR VIP • ${data.guild.vipInfo?.formattedRemaining || 'Ativo'}</span>`;
    } else {
      vipBadgeContainer.innerHTML = `<span class="badge badge-normal">Servidor Normal</span>`;
    }

    // Popula canais de voz no Quick Play
    if (!isPolling) {
      const voiceSelect = document.getElementById('quick-play-voice');
      voiceSelect.innerHTML = '<option value="">Canal de voz automático</option>';
      data.voiceChannels.forEach((vc) => {
        const opt = document.createElement('option');
        opt.value = vc.id;
        opt.textContent = `🔊 ${vc.name} (${vc.membersCount} online)`;
        voiceSelect.appendChild(opt);
      });
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
    const volumeSlider = document.getElementById('volume-slider');
    const volumeVal = document.getElementById('volume-val');

    if (q && q.currentSong) {
      const song = q.currentSong;
      titleEl.textContent = song.name;
      metaEl.textContent = `Pedido por: ${song.user} • Duração: ${song.formattedDuration}`;
      thumbEl.src = song.thumbnail || '/assets/chlorine_gold.webp';

      curTimeEl.textContent = q.formattedCurrentTime || '00:00';
      totTimeEl.textContent = song.formattedDuration || '00:00';

      const progressPercent = q.currentTime > 0 ? Math.min(100, (q.currentTime / parseDurationSec(song.formattedDuration)) * 100) : 0;
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

      volumeSlider.value = q.volume;
      volumeVal.textContent = `${q.volume}%`;

      // Atualiza lista da fila
      renderQueueList(q.songs);
    } else {
      titleEl.textContent = 'Nenhuma música tocando no momento';
      metaEl.textContent = 'Use o formulário abaixo para tocar qualquer música no canal!';
      thumbEl.src = '/assets/chlorine_gold.webp';
      fillEl.style.width = '0%';
      curTimeEl.textContent = '00:00';
      totTimeEl.textContent = '00:00';
      statusBadge.textContent = 'Parado';
      statusBadge.className = 'queue-status-badge badge badge-normal';
      soundwave.style.display = 'none';
      pauseIcon.textContent = '⏸️';

      renderQueueList([]);
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

// Renderiza a lista de músicas da fila
function renderQueueList(songs) {
  const container = document.getElementById('queue-list');
  const countEl = document.getElementById('queue-count');
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
  songs.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    const isPlaying = idx === 0;

    item.innerHTML = `
      <span class="queue-index">${isPlaying ? '▶' : idx}</span>
      <img src="${s.thumbnail || '/assets/chlorine_gold.webp'}" alt="Thumb" class="queue-thumb">
      <div class="queue-info">
        <div class="queue-name">${s.name}</div>
        <div class="queue-req">${isPlaying ? 'Tocando agora' : `Pedido por: ${s.user}`}</div>
      </div>
      <div class="queue-duration">${s.formattedDuration}</div>
    `;

    container.appendChild(item);
  });
}

// ==============================================================
// CONTROLES DO PLAYER (PLAY, PAUSE, SKIP, STOP, ETC.)
// ==============================================================
function setupPlayerControls() {
  const serverSelect = document.getElementById('server-select');
  serverSelect.addEventListener('change', (e) => {
    currentGuildId = e.target.value;
    loadGuildQueue(currentGuildId);
  });

  // Botão Play Rápido
  document.getElementById('btn-quick-play').addEventListener('click', async () => {
    const query = document.getElementById('quick-play-input').value.trim();
    const voiceChannelId = document.getElementById('quick-play-voice').value;
    if (!query) {
      showToast('Por favor, digite o nome de uma música ou link!', true);
      return;
    }
    if (!currentGuildId) {
      showToast('Nenhum servidor selecionado!', true);
      return;
    }

    showToast(`Buscando "${query}"...`);
    try {
      const res = await fetch('/api/player/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId, query, voiceChannelId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        document.getElementById('quick-play-input').value = '';
        setTimeout(() => loadGuildQueue(currentGuildId), 1500);
      } else {
        showToast(data.error || 'Erro ao tocar música', true);
      }
    } catch (err) {
      showToast('Falha na requisição ao servidor', true);
    }
  });

  // Pausar / Despausar
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
        showToast(data.error, true);
      }
    } catch (e) {
      showToast('Erro ao alternar pausa', true);
    }
  });

  // Pular
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
        setTimeout(() => loadGuildQueue(currentGuildId), 800);
      } else {
        showToast(data.error, true);
      }
    } catch (e) {
      showToast('Erro ao pular faixa', true);
    }
  });

  // Parar
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
      }
    } catch (e) {
      showToast('Erro ao parar música', true);
    }
  });

  // Autoplay
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
      } else {
        showToast(data.error, true);
      }
    } catch (e) {
      showToast('Erro ao alternar autoplay', true);
    }
  });

  // Volume Slider
  const volumeSlider = document.getElementById('volume-slider');
  volumeSlider.addEventListener('change', async (e) => {
    const vol = e.target.value;
    document.getElementById('volume-val').textContent = `${vol}%`;
    if (!currentGuildId) return;

    try {
      const res = await fetch('/api/player/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: currentGuildId, volume: vol })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
      }
    } catch (e) {}
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
