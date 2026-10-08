'use strict';

const { MemoryCache } = require('../src/services/cache');

describe('MemoryCache', () => {
  let clock;
  const now = () => clock;

  beforeEach(() => {
    clock = 1000;
  });

  test('stores and returns values', () => {
    const cache = new MemoryCache({ maxEntries: 2, ttlMs: 100, now });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('missing')).toBeUndefined();
  });

  test('expires entries after the TTL', () => {
    const cache = new MemoryCache({ maxEntries: 2, ttlMs: 100, now });
    cache.set('a', 1);
    clock += 100;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  test('removes the least recently used entry when full', () => {
    const cache = new MemoryCache({ maxEntries: 2, ttlMs: 100, now });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // "a" is now the most recent
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  test('overwriting a key does not grow the cache', () => {
    const cache = new MemoryCache({ maxEntries: 2, ttlMs: 100, now });
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe(2);
  });
});
