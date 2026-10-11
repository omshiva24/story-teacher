'use strict';

/**
 * Finds moving pictures (GIF animations and short videos) and extra
 * diagrams for a topic, taken from the media that Wikipedia editors chose
 * for that article. Using the article's own media keeps it on-topic and
 * child-safe, unlike an open search. Everything is freely licensed and
 * credited, and only Wikimedia hosts are accepted (the page CSP enforces this too).
 * Any failure returns an empty result so the lesson still works.
 */

const { checkTopicSafety } = require('../utils/safety');

const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'StoryTeacher/1.0 (educational app for children; PromptWars hackathon)';
const MEDIA_HOSTS = ['https://upload.wikimedia.org/', 'https://thumb.wikimedia.org/'];
const MAX_GIF_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 20 * 60;

// Site furniture that appears on every article: logos, icons, maps, flags.
const SKIP_FILE =
  /logo|icon|symbol|flag|protection|shackle|oojs|commons-|wiktionary|wikiquote|wikibooks|wikisource|wikiversity|wikinews|wikivoyage|wikidata|portal|question_book|ambox|padlock|stub|nuvola|crystal|disambig|pog|location|locator|map_of|_map|signature|edit-|audio|speaker|sound|increase|decrease|steady|loudspeaker/i;

/** Removes tracking parameters and accepts only Wikimedia media hosts. */
function safeMediaUrl(url) {
  if (typeof url !== 'string') return '';
  const clean = url.split('?')[0];
  return MEDIA_HOSTS.some((host) => clean.startsWith(host)) ? clean.slice(0, 1000) : '';
}

/** Plain text from the HTML snippets in Commons metadata. */
function plainText(value, max = 120) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** A readable caption from the file name: "File:Earth's Water Cycle.ogv" → "Earth's Water Cycle". */
function captionFromTitle(title) {
  return String(title || '')
    .replace(/^File:/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** Chooses up to two playable video sources (WebM first, then MP4/MOV for Safari). */
function pickVideoSources(derivatives) {
  const list = Array.isArray(derivatives) ? derivatives : [];
  const playable = list
    .map((d) => ({ src: safeMediaUrl(d.src), type: String(d.type || '').split(';')[0], height: Number(d.height) || 0 }))
    .filter((d) => d.src && d.height > 0 && d.height <= 480 && /^video\/(webm|mp4|quicktime)$/.test(d.type));
  const best = (type) => playable.filter((d) => d.type === type).sort((a, b) => b.height - a.height)[0];
  const quicktime = best('video/quicktime');
  return [best('video/webm'), best('video/mp4') || (quicktime && { ...quicktime, type: 'video/mp4' })]
    .filter(Boolean)
    .map(({ src, type }) => ({ src, type }));
}

/**
 * Turns one file from the API into a media item, or null if unsuitable.
 * @param {object} page - A page from generator=images with videoinfo.
 * @returns {{ kind: 'gif'|'video'|'image', title: string, src?: string, poster?: string, sources?: object[], width: number, height: number, credit: string, license: string, pageUrl: string } | null}
 */
function toMediaItem(page) {
  const info = page && Array.isArray(page.videoinfo) ? page.videoinfo[0] : null;
  if (!info || SKIP_FILE.test(page.title || '')) return null;
  const title = captionFromTitle(page.title);
  if (!title || !checkTopicSafety(title).safe) return null;

  const meta = info.extmetadata || {};
  const base = {
    title,
    width: Number(info.thumbwidth || info.width) || 0,
    height: Number(info.thumbheight || info.height) || 0,
    credit: plainText(meta.Artist && meta.Artist.value) || 'Wikimedia Commons',
    license: plainText(meta.LicenseShortName && meta.LicenseShortName.value, 40),
    pageUrl: typeof info.descriptionurl === 'string' && info.descriptionurl.startsWith('https://') ? info.descriptionurl.slice(0, 500) : '',
  };
  const mime = String(info.mime || '');

  if (mime === 'image/gif') {
    // Small GIFs play from the original; big ones use the (animated) thumbnail.
    const src = info.size <= MAX_GIF_BYTES ? safeMediaUrl(info.url) : safeMediaUrl(info.thumburl);
    return src && info.width >= 120 ? { kind: 'gif', src, ...base } : null;
  }
  if (mime.startsWith('video/') || mime === 'application/ogg') {
    const sources = pickVideoSources(info.derivatives);
    const duration = Number(info.duration) || 0;
    if (sources.length === 0 || duration <= 0 || duration > MAX_VIDEO_SECONDS) return null;
    return { kind: 'video', sources, poster: safeMediaUrl(info.thumburl), duration: Math.round(duration), ...base };
  }
  if ((mime === 'image/jpeg' || mime === 'image/png') && info.width >= 300 && info.height >= 200) {
    const src = safeMediaUrl(info.thumburl || info.url);
    return src ? { kind: 'image', src, ...base } : null;
  }
  return null;
}

/**
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch, cache?: { get: Function, set: Function } }} [options]
 * @returns {(title: string) => Promise<{ title: string, moving: object[], pictures: object[] }>}
 */
function createWikiMediaFinder({ timeoutMs = 6000, fetchImpl = globalThis.fetch, cache = null } = {}) {
  async function getJson(params) {
    const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    const response = await fetchImpl(`${API}?${query}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? response.json() : null;
  }

  /** All media used in one article (follows redirects). */
  function articleMedia(title) {
    return getJson({
      action: 'query',
      redirects: '1',
      titles: title,
      generator: 'images',
      gimlimit: '60',
      prop: 'videoinfo',
      viprop: 'url|mime|size|derivatives|extmetadata',
      viurlwidth: '640',
      viextmetadatafilter: 'Artist|LicenseShortName',
    });
  }

  /** Best article title for a free-text topic. */
  async function searchTitle(topic) {
    const data = await getJson({ action: 'query', list: 'search', srsearch: topic, srlimit: '1', srnamespace: '0' });
    const hit = data && data.query && data.query.search && data.query.search[0];
    return hit && typeof hit.title === 'string' ? hit.title : '';
  }

  return async function findMedia(title) {
    const empty = { title: '', moving: [], pictures: [] };
    if (!title || typeof fetchImpl !== 'function') return empty;
    const key = `media:${title.toLowerCase()}`;
    const cached = cache && cache.get(key);
    if (cached) return cached;

    try {
      let data = await articleMedia(title);
      let pageTitle = title;
      if (!data || !data.query || !Array.isArray(data.query.pages)) {
        pageTitle = await searchTitle(title);
        data = pageTitle ? await articleMedia(pageTitle) : null;
      }
      const pages = (data && data.query && Array.isArray(data.query.pages) && data.query.pages) || [];
      const items = pages.map(toMediaItem).filter(Boolean);
      const result = {
        title: pageTitle,
        moving: items.filter((i) => i.kind !== 'image').slice(0, 4),
        pictures: items.filter((i) => i.kind === 'image').slice(0, 6),
      };
      if (cache) cache.set(key, result);
      return result;
    } catch (err) {
      console.warn('[media] could not load topic media:', err && err.message);
      return empty;
    }
  };
}

module.exports = { createWikiMediaFinder, toMediaItem, pickVideoSources, safeMediaUrl, captionFromTitle };
