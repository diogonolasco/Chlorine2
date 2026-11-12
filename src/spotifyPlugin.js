const { DisTubeError, Playlist, Song } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { parse: parseSpotifyUri } = require('spotify-uri');
const spotifyUrlInfo = require('spotify-url-info');
const { fetch: undiciFetch } = require('undici');

const SUPPORTED_SPOTIFY_TYPES = new Set(['album', 'playlist', 'track', 'artist']);
const SHORT_SPOTIFY_HOSTS = new Set(['spotify.link', 'spoti.fi', 'spotify.app.link']);
const SPOTIFY_URI_REGEX = /^spotify:(?:user:[^:]+:)?(track|album|playlist|artist):([A-Za-z0-9_-]+)(?:\?.*)?$/i;
const SPOTIFY_URL_IN_HTML_REGEX = /https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(?:user\/[^/"'<\s]+\/)?(?:playlist|album|track|artist)\/[A-Za-z0-9]+/i;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza entradas de busca para suportar links entre <> no Discord e URIs desktop (`spotify:playlist:...`).
 */
function normalizePlayQuery(rawQuery) {
  let query = String(rawQuery || '').trim();
  if (!query) return '';

  const bracketedUrl = query.match(/^<(https?:\/\/[^<>\s]+)>$/i);
  if (bracketedUrl) {
    query = bracketedUrl[1];
  }

  const uriMatch = query.match(SPOTIFY_URI_REGEX);
  if (uriMatch) {
    return `https://open.spotify.com/${uriMatch[1].toLowerCase()}/${uriMatch[2]}`;
  }

  return query;
}

function isShortSpotifyUrl(rawUrl) {
  try {
    const parsed = new URL(normalizePlayQuery(rawQuerySafe(rawUrl)));
    return SHORT_SPOTIFY_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function rawQuerySafe(val) {
  return typeof val === 'string' ? val : '';
}

/**
 * Converte links regionais (/intl-pt/), embed ou legados (/user/.../playlist/...) para o formato canônico open.spotify.com.
 */
function canonicalizeSpotifyUrl(rawUrl) {
  const normalized = normalizePlayQuery(rawQuerySafe(rawUrl));
  if (!normalized) return null;

  let urlObj;
  try {
    urlObj = new URL(normalized);
  } catch {
    return null;
  }

  if (!urlObj.hostname.toLowerCase().includes('spotify')) {
    return null;
  }

  try {
    const parsed = parseSpotifyUri(normalized);
    if (!parsed?.type || !parsed?.id || !SUPPORTED_SPOTIFY_TYPES.has(parsed.type)) {
      return null;
    }
    return `https://open.spotify.com/${parsed.type}/${parsed.id}`;
  } catch {
    return null;
  }
}

/**
 * Resolve links encurtados do app do Spotify (spotify.link / spoti.fi) via redirecionamento HTTP ou HTML.
 */
async function resolveShortSpotifyUrl(rawUrl, fetchFn = undiciFetch) {
  const cleaned = normalizePlayQuery(rawUrl);
  try {
    const response = await fetchFn(cleaned, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });

    const redirected = canonicalizeSpotifyUrl(response?.url);
    if (redirected) return redirected;

    const html = await response.text();
    const matched = html.match(SPOTIFY_URL_IN_HTML_REGEX)?.[0];
    return canonicalizeSpotifyUrl(matched) || cleaned;
  } catch {
    return cleaned;
  }
}

function pickBestImageUrl(data) {
  const candidates = [
    ...(Array.isArray(data?.visualIdentity?.image) ? data.visualIdentity.image : []),
    ...(Array.isArray(data?.coverArt?.sources) ? data.coverArt.sources : []),
    ...(Array.isArray(data?.images) ? data.images : [])
  ].filter((img) => img && typeof img.url === 'string' && img.url.trim());

  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    const wA = Number(a.maxWidth || a.width || 0);
    const wB = Number(b.maxWidth || b.width || 0);
    return wB - wA;
  });

  return sorted[0].url;
}

function buildTrackMetadataFromUri(uri, fallbackUrl) {
  try {
    const parsed = parseSpotifyUri(uri);
    if (parsed?.type === 'track' && parsed.id) {
      return {
        id: parsed.id,
        url: `https://open.spotify.com/track/${parsed.id}`
      };
    }
    if (parsed?.id) {
      return { id: parsed.id, url: fallbackUrl };
    }
  } catch {}
  return { id: '', url: fallbackUrl };
}

/**
 * Plugin do Spotify resiliente: usa a API oficial quando credenciais estiverem configuradas
 * e faz fallback automático para o endpoint público Embed quando playlists/artistas forem restritos pela API.
 */
class ResilientSpotifyPlugin extends SpotifyPlugin {
  constructor(options = {}) {
    const clientId = String(options?.api?.clientId || '').trim();
    const clientSecret = String(options?.api?.clientSecret || '').trim();
    const rawCountry = String(options?.api?.topTracksCountry || '').trim().toUpperCase();
    const topTracksCountry = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : undefined;

    const apiOptions = {};
    if (clientId && clientSecret) {
      apiOptions.clientId = clientId;
      apiOptions.clientSecret = clientSecret;
    }
    if (topTracksCountry) {
      apiOptions.topTracksCountry = topTracksCountry;
    }

    super(Object.keys(apiOptions).length > 0 ? { api: apiOptions } : {});

    this._hasApiCredentials = Boolean(clientId && clientSecret);
    this._fetch = options.fetchImpl || undiciFetch;
    this._embedInfo = options.embedInfo || spotifyUrlInfo(this._fetch);
  }

  validate(rawUrl) {
    const normalized = normalizePlayQuery(rawUrl);
    if (!normalized) return false;
    if (isShortSpotifyUrl(normalized)) return true;
    return Boolean(canonicalizeSpotifyUrl(normalized));
  }

  async resolve(rawUrl, options = {}) {
    let targetUrl = normalizePlayQuery(rawUrl);
    if (isShortSpotifyUrl(targetUrl)) {
      targetUrl = await resolveShortSpotifyUrl(targetUrl, this._fetch);
    }

    const canonicalUrl = canonicalizeSpotifyUrl(targetUrl);
    if (!canonicalUrl) {
      throw new DisTubeError('SPOTIFY_API_INVALID_URL', 'Link do Spotify inválido ou não suportado.');
    }

    // Tenta primeiro via API oficial do Spotify quando CLIENT_ID e CLIENT_SECRET estiverem configurados
    if (this._hasApiCredentials) {
      try {
        const officialResult = await super.resolve(canonicalUrl, options);
        if (officialResult instanceof Playlist) {
          if (Array.isArray(officialResult.songs) && officialResult.songs.length > 0) {
            return officialResult;
          }
        } else if (officialResult?.name) {
          return officialResult;
        }
      } catch {
        // Fallback automático abaixo (cobre playlists editoriais/de usuários em Modo Desenvolvimento e artistas)
      }
    }

    return this.resolveViaEmbed(canonicalUrl, options);
  }

  async resolveViaEmbed(canonicalUrl, options = {}) {
    let data;
    try {
      data = await this._embedInfo.getData(canonicalUrl);
    } catch {
      throw new DisTubeError(
        'SPOTIFY_API_ERROR',
        'Não foi possível carregar este link do Spotify. Verifique se a playlist é pública e válida!'
      );
    }

    const thumbnail = pickBestImageUrl(data);
    if (data?.type === 'track') {
      let trackId = '';
      try {
        trackId = parseSpotifyUri(canonicalUrl).id || '';
      } catch {}

      const artists = Array.isArray(data.artists)
        ? data.artists.map((a) => cleanText(a?.name)).filter(Boolean).join(', ')
        : cleanText(data.subtitle);

      return new Song(
        {
          plugin: this,
          source: 'spotify',
          playFromSource: false,
          id: trackId,
          name: cleanText(data.name || data.title || 'Música Spotify'),
          url: canonicalUrl,
          thumbnail,
          uploader: { name: artists },
          duration: (Number(data.duration) || 0) / 1000
        },
        options
      );
    }

    const rawTracks = Array.isArray(data?.trackList) ? data.trackList : [];
    const entityTitle = cleanText(data?.name || data?.title || 'Playlist Spotify');
    const isArtist = data?.type === 'artist';

    const songs = [];
    for (let i = 0; i < rawTracks.length; i++) {
      const item = rawTracks[i];
      const title = cleanText(item?.title);
      if (!title) continue;

      const { id, url } = buildTrackMetadataFromUri(item?.uri, canonicalUrl);
      const artistName = cleanText(item?.subtitle || (isArtist ? entityTitle : ''));

      songs.push(
        new Song(
          {
            plugin: this,
            source: 'spotify',
            playFromSource: false,
            id: id || cleanText(item?.uid) || `${i + 1}`,
            name: title,
            url,
            thumbnail,
            uploader: { name: artistName },
            duration: (Number(item?.duration) || 0) / 1000
          },
          options
        )
      );
    }

    if (!songs.length) {
      throw new DisTubeError(
        'SPOTIFY_EMPTY_OR_PRIVATE',
        'Esta playlist ou álbum do Spotify está vazio, privado ou indisponível. Deixe a playlist pública para tocar!'
      );
    }

    return new Playlist(
      {
        source: 'spotify',
        name: entityTitle,
        url: canonicalUrl,
        thumbnail,
        songs
      },
      options
    );
  }

  createSearchQuery(song) {
    return [cleanText(song?.name), cleanText(song?.uploader?.name)].filter(Boolean).join(' ').trim();
  }
}

function createSpotifyPlugin({ clientId, clientSecret, topTracksCountry = 'BR', fetchImpl, embedInfo } = {}) {
  return new ResilientSpotifyPlugin({
    api: { clientId, clientSecret, topTracksCountry },
    fetchImpl,
    embedInfo
  });
}

module.exports = {
  ResilientSpotifyPlugin,
  createSpotifyPlugin,
  normalizePlayQuery,
  canonicalizeSpotifyUrl,
  resolveShortSpotifyUrl,
  isShortSpotifyUrl
};
