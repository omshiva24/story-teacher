'use strict';

/**
 * Finds a real photo for the topic from Wikipedia (free, credited images).
 * Safety: the AI chooses a child-safe article title, the title is validated,
 * disambiguation pages are skipped, and only images hosted on
 * upload.wikimedia.org are accepted (the page's CSP allows only that host).
 * Any failure returns null so the story still works without a photo.
 */

const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const IMAGE_HOST = 'https://upload.wikimedia.org/';
const USER_AGENT = 'StoryTeacher/1.0 (educational app for children; PromptWars hackathon)';

/**
 * Creates the image finder.
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {(title: string) => Promise<{ imageUrl: string, pageUrl: string, title: string, description: string } | null>}
 */
function createWikiImageFinder({ timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  return async function findTopicImage(title) {
    if (!title || typeof fetchImpl !== 'function') {
      return null;
    }
    try {
      const response = await fetchImpl(`${SUMMARY_URL}${encodeURIComponent(title.replace(/ /g, '_'))}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        return null;
      }
      const page = await response.json();
      const imageUrl = page?.thumbnail?.source;
      const pageUrl = page?.content_urls?.desktop?.page;
      if (page?.type === 'disambiguation' || typeof imageUrl !== 'string' || !imageUrl.startsWith(IMAGE_HOST)) {
        return null;
      }
      return {
        imageUrl: imageUrl.slice(0, 1000),
        pageUrl: typeof pageUrl === 'string' && pageUrl.startsWith('https://') ? pageUrl.slice(0, 1000) : '',
        title: String(page.title || title).slice(0, 120),
        description: typeof page.description === 'string' ? page.description.slice(0, 160) : '',
      };
    } catch (err) {
      console.warn('[wiki] no topic image:', err && err.message);
      return null;
    }
  };
}

module.exports = { createWikiImageFinder, IMAGE_HOST };
