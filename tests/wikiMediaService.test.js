'use strict';

const { createWikiMediaFinder, toMediaItem, pickVideoSources, safeMediaUrl, captionFromTitle } = require('../src/services/wikiMediaService');

const gif = {
  title: 'File:Water cycle animation.gif',
  videoinfo: [{ mime: 'image/gif', size: 500000, width: 400, height: 300, url: 'https://upload.wikimedia.org/w/a.gif?utm_source=x', thumburl: 'https://upload.wikimedia.org/w/a-thumb.gif', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.gif', extmetadata: { Artist: { value: '<a href="https://x">Ana &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }],
};
const video = {
  title: "File:Earth's Water Cycle.ogv",
  videoinfo: [{
    mime: 'application/ogg', size: 70000000, width: 640, height: 360, duration: 352.9,
    url: 'https://upload.wikimedia.org/w/v.ogv', thumburl: 'https://thumb.wikimedia.org/w/v.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:V.ogv',
    derivatives: [
      { src: 'https://upload.wikimedia.org/w/v.ogv', type: 'video/ogg; codecs="theora"', height: 360 },
      { src: 'https://upload.wikimedia.org/t/v.240p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', height: 240 },
      { src: 'https://upload.wikimedia.org/t/v.360p.mpeg4.mov', type: 'video/quicktime; codecs="mp4v"', height: 360 },
      { src: 'https://upload.wikimedia.org/t/v.1080p.webm', type: 'video/webm', height: 1080 },
    ],
  }],
};
const logo = { title: 'File:Commons-logo.svg', videoinfo: [{ mime: 'image/svg+xml', width: 1024, height: 1376, url: 'https://upload.wikimedia.org/x.svg' }] };
const photo = { title: 'File:Rain clouds.jpg', videoinfo: [{ mime: 'image/jpeg', size: 200000, width: 1600, height: 1000, url: 'https://upload.wikimedia.org/r.jpg', thumburl: 'https://upload.wikimedia.org/r-640.jpg' }] };
const foreign = { title: 'File:Bad.gif', videoinfo: [{ mime: 'image/gif', size: 1000, width: 400, height: 300, url: 'https://evil.example.com/a.gif' }] };

describe('wiki media helpers', () => {
  test('accepts only Wikimedia hosts and strips tracking parameters', () => {
    expect(safeMediaUrl('https://upload.wikimedia.org/a.gif?utm_source=x')).toBe('https://upload.wikimedia.org/a.gif');
    expect(safeMediaUrl('https://thumb.wikimedia.org/a.jpg')).toBe('https://thumb.wikimedia.org/a.jpg');
    expect(safeMediaUrl('https://evil.example.com/a.gif')).toBe('');
    expect(safeMediaUrl(undefined)).toBe('');
  });

  test('makes readable captions from file names', () => {
    expect(captionFromTitle("File:Earth's_Water-Cycle.ogv")).toBe("Earth's Water Cycle");
  });

  test('picks small WebM and MP4 sources, skipping big and Ogg ones', () => {
    const sources = pickVideoSources(video.videoinfo[0].derivatives);
    expect(sources).toEqual([
      { src: 'https://upload.wikimedia.org/t/v.240p.vp9.webm', type: 'video/webm' },
      { src: 'https://upload.wikimedia.org/t/v.360p.mpeg4.mov', type: 'video/mp4' },
    ]);
  });

  test('turns files into media items with credits', () => {
    const item = toMediaItem(gif);
    expect(item).toMatchObject({ kind: 'gif', src: 'https://upload.wikimedia.org/w/a.gif', title: 'Water cycle animation', credit: 'Ana Co', license: 'CC BY-SA 4.0' });
    expect(toMediaItem(video)).toMatchObject({ kind: 'video', duration: 353, poster: 'https://thumb.wikimedia.org/w/v.jpg' });
    expect(toMediaItem(photo)).toMatchObject({ kind: 'image', src: 'https://upload.wikimedia.org/r-640.jpg' });
  });

  test('skips site logos and media from other hosts', () => {
    expect(toMediaItem(logo)).toBe(null);
    expect(toMediaItem(foreign)).toBe(null);
    expect(toMediaItem({})).toBe(null);
  });
});

describe('createWikiMediaFinder', () => {
  test('returns moving pictures and pictures from the article, and caches them', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ query: { pages: [gif, video, logo, photo] } }) };
    };
    const store = new Map();
    const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
    const findMedia = createWikiMediaFinder({ fetchImpl, cache });
    const result = await findMedia('Water cycle');
    expect(result.moving.map((m) => m.kind)).toEqual(['gif', 'video']);
    expect(result.pictures).toHaveLength(1);
    await findMedia('Water cycle');
    expect(calls).toBe(1);
  });

  test('searches for the article title when the topic is not a page', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.includes('list=search')) return { ok: true, json: async () => ({ query: { search: [{ title: 'Volcano' }] } }) };
      if (url.includes('titles=Volcano')) return { ok: true, json: async () => ({ query: { pages: [gif] } }) };
      return { ok: true, json: async () => ({ batchcomplete: true }) };
    };
    const result = await createWikiMediaFinder({ fetchImpl })('how volcanoes erupt');
    expect(result.title).toBe('Volcano');
    expect(result.moving).toHaveLength(1);
    expect(urls.length).toBe(3);
  });

  test('never throws: failures give an empty result', async () => {
    const findMedia = createWikiMediaFinder({ fetchImpl: async () => { throw new Error('offline'); } });
    await expect(findMedia('Rain')).resolves.toEqual({ title: '', moving: [], pictures: [] });
  });
});
