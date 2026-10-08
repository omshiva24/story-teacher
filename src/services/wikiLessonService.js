'use strict';

/**
 * Backup source for when the AI is unavailable: finds the topic on
 * Wikipedia and returns its introduction as plain text, with a photo.
 * Younger children get Simple English Wikipedia, which is written for
 * learners; older students get English Wikipedia.
 * Any failure returns null.
 */

const USER_AGENT = 'StoryTeacher/1.0 (educational app for children; PromptWars hackathon)';
const IMAGE_HOST = 'https://upload.wikimedia.org/';

/**
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {(topic: string, opts: { simple: boolean }) => Promise<{ title: string, text: string, pageUrl: string, imageUrl: string, site: string } | null>}
 */
function createWikiArticleFinder({ timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  /** GET a Wikipedia API URL and return JSON, or null. */
  async function getJson(url) {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? response.json() : null;
  }

  /** Finds the best article on one Wikipedia site. */
  async function findOnSite(topic, host) {
    const api = `https://${host}/w/api.php`;
    const search = await getJson(
      `${api}?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`,
    );
    const title = search?.query?.search?.[0]?.title;
    if (!title) return null;

    const page = await getJson(
      `${api}?action=query&prop=extracts|pageimages|info&exintro=1&explaintext=1&exsentences=12` +
        `&piprop=thumbnail&pithumbsize=640&inprop=url&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`,
    );
    const pages = page?.query?.pages ? Object.values(page.query.pages) : [];
    const info = pages[0];
    const text = typeof info?.extract === 'string' ? info.extract.trim() : '';
    if (!info || text.length < 120 || /may refer to/i.test(text.slice(0, 200))) return null;

    const imageUrl = info.thumbnail?.source;
    return {
      title: String(info.title || title).slice(0, 120),
      text: text.slice(0, 4000),
      pageUrl: typeof info.fullurl === 'string' && info.fullurl.startsWith('https://') ? info.fullurl : '',
      imageUrl: typeof imageUrl === 'string' && imageUrl.startsWith(IMAGE_HOST) ? imageUrl : '',
      site: host.startsWith('simple.') ? 'Simple English Wikipedia' : 'Wikipedia',
    };
  }

  return async function findArticle(topic, { simple }) {
    if (!topic || typeof fetchImpl !== 'function') return null;
    const hosts = simple ? ['simple.wikipedia.org', 'en.wikipedia.org'] : ['en.wikipedia.org', 'simple.wikipedia.org'];
    for (const host of hosts) {
      try {
        const article = await findOnSite(topic, host);
        if (article) return article;
      } catch (err) {
        console.warn(`[wiki] ${host} lookup failed:`, err && err.message);
      }
    }
    return null;
  };
}

module.exports = { createWikiArticleFinder };
