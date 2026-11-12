const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

/**
 * URLs oficiais de binários standalone (ELF) do yt-dlp para Linux/macOS,
 * dispensando dependência de Python3 em containers Node.js enxutos (ex: ShardCloud).
 */
const STANDALONE_YTDLP_URLS = {
  linux: {
    x64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
    arm64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64',
    arm: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l'
  },
  darwin: {
    x64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    arm64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
  }
};

/**
 * Garante que um diretório exista e tenha permissão de escrita.
 * @param {string} dirPath
 * @param {typeof fs} [fsMod]
 * @returns {boolean}
 */
function ensureWritableDir(dirPath, fsMod = fs) {
  if (!dirPath) return false;
  try {
    fsMod.mkdirSync(dirPath, { recursive: true });
    fsMod.accessSync(dirPath, fsMod.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Garante que a pasta ./data exista e esteja acessível para gravação (VIPs e emojis).
 * @param {string} rootDir
 * @param {typeof fs} [fsMod]
 * @returns {string}
 */
function prepareDataDirectory(rootDir, fsMod = fs) {
  const dataDir = path.join(rootDir, 'data');
  ensureWritableDir(dataDir, fsMod);
  return dataDir;
}

/**
 * Em sistemas POSIX (Linux/macOS), garante permissão de execução (chmod 0755) no binário.
 * @param {string} filePath
 * @param {{ platform?: string, fsMod?: typeof fs }} [options]
 * @returns {boolean}
 */
function ensureExecutable(filePath, { platform = process.platform, fsMod = fs } = {}) {
  if (platform === 'win32' || !filePath) return false;
  try {
    if (!fsMod.existsSync(filePath)) return false;
    const stat = fsMod.statSync(filePath);
    if (!stat.isFile()) return false;
    if ((stat.mode & 0o111) === 0 || (stat.mode & 0o100) === 0) {
      fsMod.chmodSync(filePath, 0o755);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se o binário do FFmpeg responde corretamente ao formato esperado pelo DisTube.
 * @param {string} binaryPath
 * @param {{ spawnSync?: typeof childProcess.spawnSync }} [options]
 * @returns {boolean}
 */
function testFfmpegBinary(binaryPath, { spawnSync = childProcess.spawnSync } = {}) {
  if (!binaryPath || typeof binaryPath !== 'string') return false;
  try {
    const res = spawnSync(binaryPath, ['-h'], {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 5000
    });
    if (!res || res.error) return false;
    if (res.stderr && !res.stdout) return false;
    const combined = (res.output || [res.stdout, res.stderr]).filter(Boolean).join('\n');
    return /ffmpeg version (\S+)/iu.test(combined);
  } catch {
    return false;
  }
}

/**
 * Resolve o melhor caminho funcional para o FFmpeg (env customizada -> ffmpeg-static -> sistema Linux).
 * Evita falhas quando o ffmpeg-static não tem permissão +x ou falha no build de containers.
 * @param {{
 *   ffmpegStaticPath?: string|null,
 *   platform?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fsMod?: typeof fs,
 *   spawnSync?: typeof childProcess.spawnSync
 * }} [options]
 * @returns {{ path: string, source: 'env'|'ffmpeg-static'|'system'|'fallback', verified: boolean }}
 */
function resolveFfmpegPath({
  ffmpegStaticPath = null,
  platform = process.platform,
  env = process.env,
  fsMod = fs,
  spawnSync = childProcess.spawnSync
} = {}) {
  if (env.FFMPEG_PATH) {
    ensureExecutable(env.FFMPEG_PATH, { platform, fsMod });
    if (testFfmpegBinary(env.FFMPEG_PATH, { spawnSync })) {
      return { path: env.FFMPEG_PATH, source: 'env', verified: true };
    }
  }

  if (ffmpegStaticPath) {
    ensureExecutable(ffmpegStaticPath, { platform, fsMod });
    if (testFfmpegBinary(ffmpegStaticPath, { spawnSync })) {
      return { path: ffmpegStaticPath, source: 'ffmpeg-static', verified: true };
    }
  }

  const systemCandidates = platform === 'win32'
    ? ['ffmpeg']
    : ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];

  for (const candidate of systemCandidates) {
    if (testFfmpegBinary(candidate, { spawnSync })) {
      return { path: candidate, source: 'system', verified: true };
    }
  }

  return {
    path: env.FFMPEG_PATH || ffmpegStaticPath || 'ffmpeg',
    source: 'fallback',
    verified: false
  };
}

/**
 * Retorna a URL oficial do binário standalone do yt-dlp compatível com a arquitetura atual.
 * @param {{ platform?: string, arch?: string }} [options]
 * @returns {string|null}
 */
function getStandaloneYtDlpUrl({ platform = process.platform, arch = process.arch } = {}) {
  const byPlatform = STANDALONE_YTDLP_URLS[platform];
  if (!byPlatform) return null;
  return byPlatform[arch] || null;
}

/**
 * Detecta rapidamente pelos primeiros 2 bytes se um arquivo é um script com shebang (#!),
 * sem carregar o binário inteiro na memória.
 * @param {string} filePath
 * @param {typeof fs} [fsMod]
 * @returns {boolean}
 */
function isShebangScript(filePath, fsMod = fs) {
  let fd;
  try {
    fd = fsMod.openSync(filePath, 'r');
    const buf = Buffer.alloc(2);
    const bytesRead = fsMod.readSync(fd, buf, 0, 2, 0);
    return bytesRead === 2 && buf[0] === 0x23 && buf[1] === 0x21;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fsMod.closeSync(fd); } catch {}
    }
  }
}

/**
 * Verifica se python3 está instalado e executável no container Linux.
 * @param {typeof childProcess.spawnSync} [spawnSync]
 * @returns {boolean}
 */
function hasPython3(spawnSync = childProcess.spawnSync) {
  try {
    const res = spawnSync('python3', ['--version'], {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 3000
    });
    return !res.error && res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Configura variáveis de ambiente para o @distube/yt-dlp ANTES de carregá-lo via require().
 * No Linux, força o binário standalone nativo (yt-dlp_linux / aarch64) para funcionar mesmo sem Python3,
 * corrige permissões de execução e reutiliza binários recentes para economizar RAM/tempo de boot.
 * @param {{
 *   rootDir: string,
 *   ytdlpPkgDir?: string,
 *   platform?: string,
 *   arch?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fsMod?: typeof fs,
 *   osMod?: typeof os,
 *   spawnSync?: typeof childProcess.spawnSync,
 *   now?: number,
 *   maxAgeMs?: number
 * }} options
 * @returns {{
 *   ytdlpDir: string,
 *   binaryPath: string,
 *   ytdlpUrl: string|null,
 *   removedBrokenScript: boolean,
 *   skippedDownload: boolean
 * }}
 */
function prepareYtDlpEnvironment({
  rootDir,
  ytdlpPkgDir,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  fsMod = fs,
  osMod = os,
  spawnSync = childProcess.spawnSync,
  now = Date.now(),
  maxAgeMs = 12 * 60 * 60 * 1000
}) {
  const isWin = platform === 'win32' || Boolean(env.YTDLP_IS_WINDOWS);
  const filename = env.YTDLP_FILENAME || `yt-dlp${isWin ? '.exe' : ''}`;

  const dirCandidates = [
    env.YTDLP_DIR,
    ytdlpPkgDir ? path.join(ytdlpPkgDir, 'bin') : null,
    rootDir ? path.join(rootDir, 'data', 'bin') : null,
    path.join(osMod.tmpdir(), 'chlorine-yt-dlp')
  ].filter(Boolean);

  let ytdlpDir = dirCandidates[dirCandidates.length - 1];
  for (const candidate of dirCandidates) {
    if (ensureWritableDir(candidate, fsMod)) {
      ytdlpDir = candidate;
      break;
    }
  }
  env.YTDLP_DIR = ytdlpDir;

  if (platform === 'linux' && !env.YTDLP_URL) {
    const standaloneUrl = getStandaloneYtDlpUrl({ platform, arch });
    if (standaloneUrl) {
      env.YTDLP_URL = standaloneUrl;
    }
  }

  const binaryPath = path.join(ytdlpDir, filename);
  let removedBrokenScript = false;
  let skippedDownload = false;

  if (fsMod.existsSync(binaryPath)) {
    if (platform === 'linux' && isShebangScript(binaryPath, fsMod) && !hasPython3(spawnSync)) {
      try {
        fsMod.unlinkSync(binaryPath);
        removedBrokenScript = true;
      } catch {}
    }

    if (!removedBrokenScript && fsMod.existsSync(binaryPath)) {
      ensureExecutable(binaryPath, { platform, fsMod });
      try {
        const stat = fsMod.statSync(binaryPath);
        if (stat.size > 1024 && (now - stat.mtimeMs) < maxAgeMs && !env.YTDLP_DISABLE_DOWNLOAD) {
          env.YTDLP_DISABLE_DOWNLOAD = '1';
          skippedDownload = true;
        }
      } catch {}
    }
  }

  return {
    ytdlpDir,
    binaryPath,
    ytdlpUrl: env.YTDLP_URL || null,
    removedBrokenScript,
    skippedDownload
  };
}

/**
 * Após iniciar o YtDlpPlugin (que baixa o binário de forma assíncrona),
 * acompanha brevemente em segundo plano para garantir permissão +x no POSIX.
 * @param {{ binaryPath: string, platform?: string, fsMod?: typeof fs, attempts?: number, intervalMs?: number }} options
 * @returns {NodeJS.Timeout|null}
 */
function syncYtDlpPermissionsLater({
  binaryPath,
  platform = process.platform,
  fsMod = fs,
  attempts = 15,
  intervalMs = 2000
}) {
  if (platform === 'win32' || !binaryPath) return null;
  if (ensureExecutable(binaryPath, { platform, fsMod })) return null;

  let remaining = attempts;
  const timer = setInterval(() => {
    remaining -= 1;
    if (ensureExecutable(binaryPath, { platform, fsMod }) || remaining <= 0) {
      clearInterval(timer);
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

module.exports = {
  STANDALONE_YTDLP_URLS,
  ensureWritableDir,
  prepareDataDirectory,
  ensureExecutable,
  testFfmpegBinary,
  resolveFfmpegPath,
  getStandaloneYtDlpUrl,
  isShebangScript,
  hasPython3,
  prepareYtDlpEnvironment,
  syncYtDlpPermissionsLater
};
