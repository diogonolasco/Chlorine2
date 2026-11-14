const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ID do Dono do Bot (único autorizado a usar !vipset / !setvip)
const OWNER_ID = '767166234117931048';

// Caminho do banco de dados de VIPs
const DATA_DIR = path.join(__dirname, '..', 'data');
const VIP_DB_PATH = path.join(DATA_DIR, 'vip_database.json');

// Definição dos planos VIP recomendados
const VIP_PLANS = {
  '7d': {
    id: '7d',
    name: 'Plano Bronze (7 Dias)',
    shortName: '7 Dias',
    durationDays: 7,
    price: 'R$ 4,90',
    icon: '🥉'
  },
  '15d': {
    id: '15d',
    name: 'Plano Prata (15 Dias)',
    shortName: '15 Dias',
    durationDays: 15,
    price: 'R$ 8,90',
    icon: '🥈'
  },
  '30d': {
    id: '30d',
    name: 'Plano Ouro (30 Dias)',
    shortName: '30 Dias (Mensal)',
    durationDays: 30,
    price: 'R$ 14,90',
    icon: '🥇',
    popular: true
  },
  '90d': {
    id: '90d',
    name: 'Plano Platina (90 Dias)',
    shortName: '90 Dias (Trimestral)',
    durationDays: 90,
    price: 'R$ 34,90',
    icon: '💎'
  },
  '365d': {
    id: '365d',
    name: 'Plano Supremo (1 Ano)',
    shortName: '1 Ano (Anual)',
    durationDays: 365,
    price: 'R$ 79,90',
    icon: '👑',
    bestValue: true
  }
};

// Garante que o diretório e o arquivo JSON existam
function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(VIP_DB_PATH)) {
    const initialData = {
      keys: {},
      guilds: {}
    };
    fs.writeFileSync(VIP_DB_PATH, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

// Carrega o banco de dados
function loadData() {
  initDatabase();
  try {
    const raw = fs.readFileSync(VIP_DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[VIP Manager] Erro ao ler banco de dados VIP:', err);
    return { keys: {}, guilds: {} };
  }
}

// Salva o banco de dados
function saveData(data) {
  initDatabase();
  try {
    fs.writeFileSync(VIP_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[VIP Manager] Erro ao salvar banco de dados VIP:', err);
  }
}

// Gera um código aleatório no formato CHLORINE-VIP-XXX-XXXX
function generateRandomCode(planKey = '30d') {
  const planSuffix = planKey.toUpperCase();
  const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CHLORINE-VIP-${planSuffix}-${part1}-${part2}`;
}

// Cria um novo código VIP no banco de dados
function createVipKey(planKey = '30d', note = 'Criado pelo Painel Local') {
  const plan = VIP_PLANS[planKey] || VIP_PLANS['30d'];
  const code = generateRandomCode(planKey);
  const data = loadData();

  data.keys[code] = {
    code,
    planId: plan.id,
    planName: plan.name,
    durationDays: plan.durationDays,
    createdAt: Date.now(),
    createdBy: 'Dashboard Localhost',
    note: note || '',
    used: false,
    usedBy: null,
    usedInGuildId: null,
    usedInGuildName: null,
    usedAt: null
  };

  saveData(data);
  return data.keys[code];
}

// Valida se o usuário é o dono do bot
function isOwner(userId) {
  return String(userId) === String(OWNER_ID);
}

// Verifica se um servidor é VIP ativo
function isGuildVip(guildId) {
  if (!guildId) return false;
  const data = loadData();
  const guildVip = data.guilds[guildId];
  if (!guildVip) return false;

  const now = Date.now();
  if (guildVip.expiresAt && guildVip.expiresAt > now) {
    return true;
  }
  return false;
}

// Retorna as informações de VIP do servidor
function getGuildVipInfo(guildId) {
  if (!guildId) return null;
  const data = loadData();
  const guildVip = data.guilds[guildId];
  if (!guildVip) return null;

  const now = Date.now();
  const active = guildVip.expiresAt && guildVip.expiresAt > now;
  const remainingMs = Math.max(0, (guildVip.expiresAt || 0) - now);

  return {
    ...guildVip,
    active,
    remainingMs,
    formattedRemaining: formatRemainingTime(remainingMs),
    formattedExpiresAt: guildVip.expiresAt ? new Date(guildVip.expiresAt).toLocaleString('pt-BR') : 'Indeterminado'
  };
}

// Formata tempo restante em dias, horas e minutos
function formatRemainingTime(ms) {
  if (ms <= 0) return 'Expirado';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} dia${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hora${hours > 1 ? 's' : ''}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minuto${minutes > 1 ? 's' : ''}`);

  return parts.join(', ');
}

// Ativa o VIP em um servidor usando um código
function activateVipWithKey(guildId, guildName, rawCode, userId) {
  const code = (rawCode || '').trim();
  const data = loadData();

  const keyData = data.keys[code];
  if (!keyData) {
    return {
      success: false,
      message: '❌ Código VIP inválido! Verifique se você digitou exatamente o código gerado no painel.'
    };
  }

  if (keyData.used) {
    return {
      success: false,
      message: `❌ Este código VIP já foi utilizado anteriormente no servidor **${keyData.usedInGuildName || 'Desconhecido'}**!`
    };
  }

  const now = Date.now();
  const durationMs = keyData.durationDays * 24 * 60 * 60 * 1000;

  // Se o servidor já for VIP, estende a data existente
  let currentExpiration = now;
  if (data.guilds[guildId] && data.guilds[guildId].expiresAt && data.guilds[guildId].expiresAt > now) {
    currentExpiration = data.guilds[guildId].expiresAt;
  }

  const newExpiresAt = currentExpiration + durationMs;

  // Atualiza a chave como usada
  keyData.used = true;
  keyData.usedBy = userId;
  keyData.usedInGuildId = guildId;
  keyData.usedInGuildName = guildName;
  keyData.usedAt = now;

  // Registra ou atualiza o servidor
  data.guilds[guildId] = {
    guildId,
    guildName,
    planId: keyData.planId,
    planName: keyData.planName,
    durationDays: keyData.durationDays,
    activatedAt: now,
    expiresAt: newExpiresAt,
    activatedBy: userId,
    keyCode: code
  };

  saveData(data);

  return {
    success: true,
    guildVip: {
      ...data.guilds[guildId],
      formattedRemaining: formatRemainingTime(newExpiresAt - now),
      formattedExpiresAt: new Date(newExpiresAt).toLocaleString('pt-BR')
    },
    keyData
  };
}

// Ativação direta pelo dashboard (sem precisar digitar código)
function setDirectVip(guildId, guildName, planKey = '30d', note = 'Ativado diretamente pelo Painel') {
  const plan = VIP_PLANS[planKey] || VIP_PLANS['30d'];
  const data = loadData();
  const now = Date.now();
  const durationMs = plan.durationDays * 24 * 60 * 60 * 1000;

  let currentExpiration = now;
  if (data.guilds[guildId] && data.guilds[guildId].expiresAt && data.guilds[guildId].expiresAt > now) {
    currentExpiration = data.guilds[guildId].expiresAt;
  }

  const newExpiresAt = currentExpiration + durationMs;

  data.guilds[guildId] = {
    guildId,
    guildName: guildName || 'Servidor',
    planId: plan.id,
    planName: plan.name,
    durationDays: plan.durationDays,
    activatedAt: now,
    expiresAt: newExpiresAt,
    activatedBy: OWNER_ID,
    note
  };

  saveData(data);

  return {
    success: true,
    guildVip: {
      ...data.guilds[guildId],
      formattedRemaining: formatRemainingTime(newExpiresAt - now),
      formattedExpiresAt: new Date(newExpiresAt).toLocaleString('pt-BR')
    }
  };
}

// Remove o VIP de um servidor
function removeVip(guildId) {
  const data = loadData();
  if (data.guilds[guildId]) {
    delete data.guilds[guildId];
    saveData(data);
    return true;
  }
  return false;
}

// Revoga/deleta um código gerado
function deleteKey(code) {
  const data = loadData();
  if (data.keys[code]) {
    delete data.keys[code];
    saveData(data);
    return true;
  }
  return false;
}

// Retorna todas as chaves
function getAllKeys() {
  const data = loadData();
  return Object.values(data.keys).sort((a, b) => b.createdAt - a.createdAt);
}

// Retorna todos os servidores VIP
function getAllVipGuilds() {
  const data = loadData();
  const now = Date.now();
  return Object.values(data.guilds).map((g) => ({
    ...g,
    active: g.expiresAt > now,
    formattedRemaining: formatRemainingTime(Math.max(0, g.expiresAt - now)),
    formattedExpiresAt: new Date(g.expiresAt).toLocaleString('pt-BR')
  }));
}

// Mescla dados remotos e locais garantindo integridade de chaves e servidores
function mergeDatabase(remoteData) {
  if (!remoteData || typeof remoteData !== 'object') return loadData();

  const localData = loadData();
  let changed = false;

  // 1. Mesclar chaves VIP
  if (remoteData.keys && typeof remoteData.keys === 'object') {
    for (const [code, rKey] of Object.entries(remoteData.keys)) {
      const lKey = localData.keys[code];
      if (!lKey) {
        localData.keys[code] = rKey;
        changed = true;
      } else if (!lKey.used && rKey.used) {
        localData.keys[code] = rKey;
        changed = true;
      }
    }
  }

  // 2. Mesclar servidores VIP
  if (remoteData.guilds && typeof remoteData.guilds === 'object') {
    for (const [guildId, rGuild] of Object.entries(remoteData.guilds)) {
      const lGuild = localData.guilds[guildId];
      if (!lGuild) {
        localData.guilds[guildId] = rGuild;
        changed = true;
      } else if (rGuild.expiresAt > lGuild.expiresAt) {
        localData.guilds[guildId] = rGuild;
        changed = true;
      }
    }
  }

  if (changed) {
    saveData(localData);
  }
  return localData;
}

// Sincroniza dados com o site remoto (ShardCloud)
async function syncWithRemote(dashboardUrl, authToken) {
  if (!dashboardUrl || typeof dashboardUrl !== 'string') return null;
  const cleanUrl = dashboardUrl.replace(/\/+$/, '');
  const localData = loadData();

  try {
    const res = await fetch(`${cleanUrl}/api/vip/sync-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(localData)
    });

    if (res.ok) {
      const json = await res.json();
      if (json.database) {
        return mergeDatabase(json.database);
      }
    }
  } catch {}
  return localData;
}

let syncTimer = null;
function startRemoteSync({ dashboardUrl, token, intervalMs = 15000 } = {}) {
  if (!dashboardUrl || syncTimer) return;
  syncWithRemote(dashboardUrl, token).catch(() => {});
  syncTimer = setInterval(() => {
    syncWithRemote(dashboardUrl, token).catch(() => {});
  }, intervalMs);
  syncTimer.unref?.();
}

module.exports = {
  OWNER_ID,
  VIP_PLANS,
  isOwner,
  isGuildVip,
  getGuildVipInfo,
  createVipKey,
  activateVipWithKey,
  setDirectVip,
  removeVip,
  deleteKey,
  getAllKeys,
  getAllVipGuilds,
  formatRemainingTime,
  mergeDatabase,
  syncWithRemote,
  startRemoteSync,
  getRawDatabase: loadData
};
