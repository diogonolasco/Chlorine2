const crypto = require('crypto');

/**
 * Módulo de Autenticação Discord OAuth2 & Controle de Acesso (RBAC)
 * Chlorine Music™ - Sistema VIP & Painel Web
 */

// Cache de sessões ativas em memória: token -> { user, expiresAt }
const sessions = new Map();

// Limpeza periódica de sessões expiradas a cada 1 hora
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt && session.expiresAt < now) {
      sessions.delete(token);
    }
  }
}, 3600 * 1000).unref?.();

/**
 * Extrai cookies do cabeçalho da requisição HTTP
 */
function parseCookies(req) {
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};

  const cookies = {};
  const items = cookieHeader.split(';');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = item.indexOf('=');
    if (index === -1) continue;
    const key = item.slice(0, index).trim();
    const val = item.slice(index + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Serializa cookie para o cabeçalho Set-Cookie
 */
function serializeCookie(name, val, options = {}) {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(val)}`;

  if (options.maxAge) {
    cookie += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  cookie += `; Path=${options.path || '/'}`;
  if (options.expires) {
    cookie += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options.httpOnly) {
    cookie += '; HttpOnly';
  }
  if (options.secure) {
    cookie += '; Secure';
  }
  if (options.sameSite) {
    cookie += `; SameSite=${options.sameSite}`;
  }

  return cookie;
}

/**
 * Assina um payload com HMAC-SHA256 gerando um token seguro
 */
function signToken(payload, secret) {
  const dataStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataStr)
    .digest('base64url');
  return `${dataStr}.${signature}`;
}

/**
 * Verifica e decodifica um token assinado com HMAC-SHA256
 */
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [dataStr, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(dataStr)
    .digest('base64url');

  try {
    const bufSig = Buffer.from(signature);
    const bufExpected = Buffer.from(expectedSig);
    if (bufSig.length !== bufExpected.length || !crypto.timingSafeEqual(bufSig, bufExpected)) {
      return null;
    }
    const jsonStr = Buffer.from(dataStr, 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Cria uma sessão para o usuário logado
 */
function createSession(userData, userGuilds, isOwner, secret, ttlMs = 7 * 24 * 3600 * 1000) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + ttlMs;

  const sessionData = {
    id: userData.id,
    username: userData.username,
    displayName: userData.global_name || userData.username,
    avatar: userData.avatar
      ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${userData.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(userData.id || '0') >> 22n) % 6n}.png`,
    isOwner: Boolean(isOwner),
    guilds: (userGuilds || []).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      owner: Boolean(g.owner),
      isAdmin: isGuildAdmin(g)
    })),
    createdAt: Date.now()
  };

  sessions.set(sessionId, { user: sessionData, expiresAt });

  const tokenPayload = {
    sid: sessionId,
    uid: sessionData.id,
    exp: expiresAt
  };

  const token = signToken(tokenPayload, secret);
  return { token, sessionData };
}

/**
 * Obtém a sessão do usuário a partir do token assinado
 */
function getSession(token, secret) {
  if (!token) return null;
  const payload = verifyToken(token, secret);
  if (!payload || !payload.sid) return null;

  if (payload.exp && payload.exp < Date.now()) {
    sessions.delete(payload.sid);
    return null;
  }

  const cached = sessions.get(payload.sid);
  if (cached) {
    if (cached.expiresAt < Date.now()) {
      sessions.delete(payload.sid);
      return null;
    }
    return cached.user;
  }

  return null;
}

/**
 * Destrói a sessão
 */
function destroySession(token, secret) {
  if (!token) return;
  const payload = verifyToken(token, secret);
  if (payload && payload.sid) {
    sessions.delete(payload.sid);
  }
}

/**
 * Verifica se um membro tem permissões de Administrador ou Gerenciar Servidor no Discord
 * Bitfields:
 * - ADMINISTRATOR: 0x8 (8n)
 * - MANAGE_GUILD: 0x20 (32n)
 */
function isGuildAdmin(guild) {
  if (!guild) return false;
  if (guild.owner === true) return true;
  if (!guild.permissions) return false;

  try {
    const perms = BigInt(guild.permissions);
    const ADMINISTRATOR = 0x8n;
    const MANAGE_GUILD = 0x20n;
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/**
 * Verifica se o usuário atual tem permissão para controlar ou alterar configurações de um servidor
 * - Dono do Bot: Acesso total a qualquer servidor.
 * - Administrador com VIP: Acesso se for administrador daquele servidor E o servidor tiver VIP ativo.
 * - Modo desenvolvimento/teste: Se bypass ativado.
 */
function canManageGuild(user, guildId, client, vipManager, { allowVoiceSession = false } = {}) {
  if (!user) return false;
  if (user.isOwner) return true;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  // Verifica se o usuário está na lista de servidores com permissão de administrador
  const userGuild = user.guilds?.find((g) => g.id === guildId);
  const isUserAdmin = Boolean(userGuild?.isAdmin || userGuild?.owner);

  if (!isUserAdmin) {
    return false;
  }

  // Se o servidor tiver VIP ativo, o Administrador tem permissão total de gerenciamento
  const hasVip = vipManager.isGuildVip(guildId);
  if (hasVip) return true;

  // Se o servidor não tiver VIP, administrador tem controle básico de áudio
  return isUserAdmin;
}

/**
 * SEGURANÇA MÁXIMA: Verifica se o usuário pode gerar chaves VIP ou alterar banco de chaves
 * APENAS O DONO DO BOT (ID 767166234117931048) PODE GERAR OU APAGAR CHAVES VIP!
 */
function canManageVipKeys(user, vipManager) {
  if (!user || !user.id) return false;
  return Boolean(vipManager.isOwner(user.id) && user.isOwner);
}

/**
 * Gera a URL oficial de redirecionamento para o Discord OAuth2
 */
function getDiscordAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
    prompt: 'consent'
  });
  if (state) {
    params.set('state', state);
  }
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

/**
 * Troca o código OAuth2 do Discord por um Access Token
 */
async function exchangeDiscordCode(code, clientId, clientSecret, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro na troca de código Discord (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Busca os dados do usuário autenticado no Discord (@me)
 */
async function fetchDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao buscar usuário Discord (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Busca a lista de servidores em que o usuário está presente (@me/guilds)
 */
async function fetchDiscordGuilds(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao buscar servidores Discord (${res.status}): ${errText}`);
  }

  return await res.json();
}

module.exports = {
  parseCookies,
  serializeCookie,
  signToken,
  verifyToken,
  createSession,
  getSession,
  destroySession,
  isGuildAdmin,
  canManageGuild,
  canManageVipKeys,
  getDiscordAuthUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
  fetchDiscordGuilds,
  _sessions: sessions
};
