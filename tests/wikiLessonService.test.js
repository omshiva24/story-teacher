'use strict';

const { createWikiArticleFinder } = require('../src/services/wikiLessonService');

const LONG = 'Volcanoes are openings in the ground where hot melted rock comes out. '.repeat(4);

function fakeFetch(routes) {
  return jest.fn(async (url) => {
    const host = new URL(url).host;
    const kind = url.includes('list=search') ? 'search' : 'page';
    const body = routes[`${host}:${kind}`];
    return { ok: body !== undefined, json: async () => body };
  });
}

const page = (extra = {}) => ({
  query: {
    pages: {
      1: {
        title: 'Volcano',
        extract: LONG,
        fullurl: 'https://simple.wikipedia.org/wiki/Volcano',
        thumbnail: { source: 'https://upload.wikimedia.org/v.jpg' },
        ...extra,
      },
    },
  },
});

describe('createWikiArticleFinder', () => {
  test('uses Simple English Wikipedia for younger children', async () => {
    const fetchImpl = fakeFetch({
      'simple.wikipedia.org:search': { query: { search: [{ title: 'Volcano' }] } },
      'simple.wikipedia.org:page': page(),
    });
    const article = await createWikiArticleFinder({ fetchImpl })('volcanoes', { simple: true });
    expect(article).toMatchObject({ title: 'Volcano', site: 'Simple English Wikipedia', imageUrl: 'https://upload.wikimedia.org/v.jpg' });
    expect(fetchImpl.mock.calls[0][0]).toContain('simple.wikipedia.org');
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toMatch(/StoryTeacher/);
  });

  test('falls back to the other site when the first has nothing', async () => {
    const fetchImpl = fakeFetch({
      'en.wikipedia.org:search': { query: { search: [] } },
      'simple.wikipedia.org:search': { query: { search: [{ title: 'Volcano' }] } },
      'simple.wikipedia.org:page': page(),
    });
    const article = await createWikiArticleFinder({ fetchImpl })('volcanoes', { simple: false });
    expect(article.site).toBe('Simple English Wikipedia');
  });

  test('skips disambiguation pages and drops images from other hosts', async () => {
    const fetchImpl = fakeFetch({
      'en.wikipedia.org:search': { query: { search: [{ title: 'Mercury' }] } },
      'en.wikipedia.org:page': page({ extract: 'Mercury may refer to: ' + LONG }),
      'simple.wikipedia.org:search': { query: { search: [{ title: 'Volcano' }] } },
      'simple.wikipedia.org:page': page({ thumbnail: { source: 'https://evil.example/x.png' } }),
    });
    const article = await createWikiArticleFinder({ fetchImpl })('x', { simple: false });
    expect(article.site).toBe('Simple English Wikipedia');
    expect(article.imageUrl).toBe('');
  });

  test('returns null when the network fails', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(createWikiArticleFinder({ fetchImpl })('x', { simple: true })).resolves.toBe(null);
    spy.mockRestore();
  });
});
