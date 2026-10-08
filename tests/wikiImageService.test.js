'use strict';

const { createWikiImageFinder } = require('../src/services/wikiImageService');

/** Fake fetch that returns the given JSON body. */
function fakeFetch(body, ok = true) {
  return jest.fn().mockResolvedValue({ ok, json: async () => body });
}

const PAGE = {
  type: 'standard',
  title: 'Photosynthesis',
  description: 'Process by which plants make food from light',
  thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/leaf.png' },
  content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Photosynthesis' } },
};

describe('createWikiImageFinder', () => {
  test('returns the photo, page link, title and description', async () => {
    const fetchImpl = fakeFetch(PAGE);
    const find = createWikiImageFinder({ fetchImpl });
    await expect(find('Photosynthesis')).resolves.toEqual({
      imageUrl: PAGE.thumbnail.source,
      pageUrl: PAGE.content_urls.desktop.page,
      title: 'Photosynthesis',
      description: PAGE.description,
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Photosynthesis');
    expect(options.headers['User-Agent']).toMatch(/StoryTeacher/);
  });

  test('encodes titles with spaces and dots', async () => {
    const fetchImpl = fakeFetch(PAGE);
    await createWikiImageFinder({ fetchImpl })('A. P. J. Abdul Kalam');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/A._P._J._Abdul_Kalam');
  });

  test.each([
    ['an image from another host', { ...PAGE, thumbnail: { source: 'https://evil.example/x.png' } }],
    ['a disambiguation page', { ...PAGE, type: 'disambiguation' }],
    ['no image', { ...PAGE, thumbnail: undefined }],
  ])('returns null for %s', async (_, body) => {
    await expect(createWikiImageFinder({ fetchImpl: fakeFetch(body) })('X')).resolves.toBe(null);
  });

  test('returns null for a missing page', async () => {
    await expect(createWikiImageFinder({ fetchImpl: fakeFetch({}, false) })('Nope')).resolves.toBe(null);
  });

  test('returns null instead of failing when the network fails', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(createWikiImageFinder({ fetchImpl })('Volcano')).resolves.toBe(null);
    spy.mockRestore();
  });

  test('skips the lookup when there is no title', async () => {
    const fetchImpl = fakeFetch(PAGE);
    await expect(createWikiImageFinder({ fetchImpl })('')).resolves.toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
