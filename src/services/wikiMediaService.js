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
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'StoryTeacher/1.0 (educational app for children; PromptWars hackathon)';
const MEDIA_HOSTS = ['https://upload.wikimedia.org/', 'https://thumb.wikimedia.org/'];
const MAX_GIF_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 20 * 60;

// Site furniture that appears on every article: logos, icons, maps, flags.
const SKIP_FILE =
  /logo|icon|symbol|flag|protection|shackle|oojs|commons-|wiktionary|wikiquote|wikibooks|wikisource|wikiversity|wikinews|wikivoyage|wikidata|portal|question_book|ambox|padlock|stub|nuvola|crystal|disambig|pog|location|locator|map_of|_map|signature|edit-|audio|speaker|sound|increase|decrease|steady|loudspeaker/i;

// Real surgery, injuries and similar are too graphic for children, even on science pages.
const GRAPHIC_FILE = /dissect|disecc|surger|surgical|transplant|autopsy|cadaver|corpse|wound|injur|blood_?loss|necro|gore|dead|death|operation|slaughter|attack|massacre|bombing|terror|shooting|execution|riot|genocide|hostage|assassinat|war[_ ]crime|casualt/i;

// Teaching pictures first; charts of countries and statistics last.
const TEACHING_WORDS = /diagram|cycle|scheme|schema|structure|parts|anatomy|process|model|simple|label|overview|animat|how|stages?|example|steps?|illustrat|explain/i;
const CHART_WORDS = /share[_ ]of|per[_ ]capita|index|ranking|world|map|by[_ ]country|statistic|\b(19|20)\d\d\b/i;

// Commons search is wider than the article, so only clearly educational videos are taken from it.
const EDUCATIONAL_VIDEO = /animat|simulat|diagram|model|explain|how |what |why |introduc|lesson|nasa|cycle|process|lifecycle|life cycle|timelapse|time-lapse/i;

// Photos of people (actors, singers, politicians…) that are not the topic itself, found by their Commons categories.
const PEOPLE_CATEGORY = /\b(people|portraits?|actress(es)?|actors?|singers?|musicians?|births|deaths|politicians|celebrit(y|ies)|selfies?|footballers|cricketers)\b/i;

// Icon sets ("Noun ballerina 8247195") and similar clip art.
const CLIP_ART = /\b\d{6,}\b|noun[_ ]project|clipart|clip[_ ]art|emoji|sticker/i;

// Diagrams labelled in another language ("Photosynthesis-ar.gif"); English or unlabelled ones are kept.
const OTHER_LANGUAGE = /[-_ (]([a-z]{2,3})\)?$/;

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

const COMMON_WORDS = new Set(['with', 'from', 'that', 'this', 'what', 'does', 'work', 'works', 'into', 'about', 'their', 'there', 'when', 'where', 'which', 'your']);

/**
 * Keywords of a topic for matching file names: "Solar System" → ["solar", "system"].
 * Long words keep their first six letters so "photosynthesis" also matches
 * "photosynthetic". Short words lose a final "s" ("volcanoes" → "volcanoe").
 * @param {string[]} titles
 * @returns {string[]}
 */
function topicKeywords(titles) {
  const words = titles
    .join(' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !COMMON_WORDS.has(w));
  return [...new Set(words.map((w) => (w.length > 7 ? w.slice(0, 6) : w.replace(/e?s$/, ''))))];
}

/**
 * True when a file's name is about the topic. Articles sometimes carry
 * unrelated files (a navigation box, a recent edit), so only files whose
 * names share a keyword with the topic are shown to children.
 */
function isRelevant(item, keywords, { all = false } = {}) {
  const name = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return all ? keywords.every((k) => name.includes(k)) : keywords.some((k) => name.includes(k));
}

/** Higher is better for teaching: named after the topic, diagrams, not statistics. */
function rankScore(item, keywords) {
  const name = item.title;
  return (isRelevant(item, keywords) ? 2 : 0) + (TEACHING_WORDS.test(name) ? 1 : 0) - (CHART_WORDS.test(name) ? 2 : 0);
}

/**
 * Turns one file from the API into a media item, or null if unsuitable.
 * @param {object} page - A page from generator=images with videoinfo.
 * @returns {{ kind: 'gif'|'video'|'image', title: string, src?: string, poster?: string, sources?: object[], width: number, height: number, credit: string, license: string, pageUrl: string } | null}
 */
function toMediaItem(page) {
  const info = page && Array.isArray(page.videoinfo) ? page.videoinfo[0] : null;
  if (!info || SKIP_FILE.test(page.title || '') || GRAPHIC_FILE.test(page.title || '') || CLIP_ART.test(page.title || '')) return null;
  const title = captionFromTitle(page.title);
  if (!title || !checkTopicSafety(title).safe) return null;
  const language = OTHER_LANGUAGE.exec(String(page.title).replace(/\.[a-z0-9]+$/i, ''));
  if (language && language[1] !== 'en') return null;

  const meta = info.extmetadata || {};
  const categories = String((meta.Categories && meta.Categories.value) || '');
  const base = {
    people: PEOPLE_CATEGORY.test(categories),
    title,
    width: Number(info.thumbwidth || info.width) || 0,
    height: Number(info.thumbheight || info.height) || 0,
    credit: plainText(meta.Artist && meta.Artist.value) || 'Wikimedia Commons',
    license: plainText(meta.LicenseShortName && meta.LicenseShortName.value, 40),
    pageUrl: typeof info.descriptionurl === 'string' && info.descriptionurl.startsWith('https://') ? info.descriptionurl.slice(0, 500) : '',
  };
  const mime = String(info.mime || '');

  if (mime === 'image/gif') {
    // Wikimedia reports a duration only for GIFs that actually move.
    const animated = Number(info.duration) > 0;
    // Small GIFs play from the original; big ones use the (animated) thumbnail.
    const src = info.size <= MAX_GIF_BYTES ? safeMediaUrl(info.url) : safeMediaUrl(info.thumburl);
    if (!src || info.width < 120 || info.height < 90) return null;
    if (animated) return { kind: 'gif', src, ...base };
    return info.width >= 300 ? { kind: 'image', src, ...base } : null;
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
  // SVG diagrams are shown as the PNG that Wikimedia renders from them.
  if (mime === 'image/svg+xml' && info.width >= 300 && info.height >= 200) {
    const src = safeMediaUrl(info.thumburl);
    return src && !src.endsWith('.svg') ? { kind: 'image', src, ...base } : null;
  }
  return null;
}

/**
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch, cache?: { get: Function, set: Function } }} [options]
 * @returns {(title: string) => Promise<{ title: string, moving: object[], pictures: object[] }>}
 */
function createWikiMediaFinder({ timeoutMs = 6000, fetchImpl = globalThis.fetch, cache = null } = {}) {
  async function getJson(params, api = API) {
    const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    const response = await fetchImpl(`${api}?${query}`, {
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
      viextmetadatafilter: 'Artist|LicenseShortName|Categories',
    });
  }

  /** Animations or videos about the topic on Wikimedia Commons, best matches first. */
  async function commonsMoving(topic, filter) {
    const data = await getJson(
      {
        action: 'query',
        generator: 'search',
        gsrsearch: `${topic} ${filter}`,
        gsrnamespace: '6',
        gsrlimit: '10',
        prop: 'videoinfo',
        viprop: 'url|mime|size|derivatives|extmetadata',
        viurlwidth: '640',
        viextmetadatafilter: 'Artist|LicenseShortName|Categories',
      },
      COMMONS_API,
    );
    const pages = (data && data.query && Array.isArray(data.query.pages) && data.query.pages) || [];
    return pages.sort((a, b) => (a.index || 0) - (b.index || 0));
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
      // A topic that is not an exact page name comes back as one "missing" page, not files.
      const hasFiles = (d) => Boolean(d && d.query && Array.isArray(d.query.pages) && d.query.pages.some((p) => p.ns === 6));
      if (!hasFiles(data)) {
        pageTitle = await searchTitle(title);
        data = pageTitle ? await articleMedia(pageTitle) : null;
      }
      const pages = (data && data.query && Array.isArray(data.query.pages) && data.query.pages) || [];
      const keywords = topicKeywords([title, pageTitle]);
      const seen = new Set();
      let candidates;
      // Few moving pictures in the article? Look for animations and videos on Commons too.
      // The article's own media was chosen by its editors, so it is trusted unless it
      // is a photo of a person who is not the topic. Wider Commons results must
      // match every keyword of the topic ("states of matter" ≠ "dark matter").
      const fromArticle = pages.map(toMediaItem).filter((i) => i && (!i.people || isRelevant(i, keywords)));
      const movingInArticle = fromArticle.filter((i) => i.kind !== 'image').length;
      if (movingInArticle < 2) {
        const subject = pageTitle || title;
        const [gifs, videos] = await Promise.all([
          commonsMoving(subject, 'filemime:image/gif').catch(() => []),
          commonsMoving(subject, 'filetype:video').catch(() => []),
        ]);
        const fromCommons = [...gifs.slice(0, 6), ...videos.slice(0, 4)]
          .map(toMediaItem)
          .filter((i) => i && !i.people && isRelevant(i, topicKeywords([subject]), { all: true }))
          .filter((i) => i.kind === 'gif' || (i.kind === 'video' && EDUCATIONAL_VIDEO.test(i.title)));
        candidates = [...fromArticle, ...fromCommons];
      } else {
        candidates = fromArticle;
      }
      const items = candidates
        .map(({ people: _people, ...item }) => item)
        .filter((item) => {
          const key = item.src || (item.sources[0] && item.sources[0].src);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      const ranked = items
        .map((item, order) => ({ item, order, score: rankScore(item, keywords) }))
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((entry) => entry.item);
      const result = {
        title: pageTitle,
        moving: ranked.filter((i) => i.kind !== 'image').slice(0, 4),
        pictures: ranked.filter((i) => i.kind === 'image').slice(0, 6),
      };
      if (cache) cache.set(key, result);
      return result;
    } catch (err) {
      console.warn('[media] could not load topic media:', err && err.message);
      return empty;
    }
  };
}

module.exports = { createWikiMediaFinder, toMediaItem, pickVideoSources, safeMediaUrl, captionFromTitle, topicKeywords, isRelevant, rankScore };
