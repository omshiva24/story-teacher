'use strict';

const { findPictureWords } = require('../src/utils/topicEmojis');

describe('findPictureWords', () => {
  test('finds real things in order of appearance', () => {
    const found = findPictureWords('Plants use sunlight. The Sun warms water and leaves.', 4);
    expect(found.map((f) => f.label)).toEqual(['Plants', 'Sun', 'Water', 'Leaves']);
    expect(found[0].emoji).toBe('🌱');
  });

  test('keeps one item per emoji and respects the limit', () => {
    const found = findPictureWords('rain rain rain clouds snow ice ocean', 3);
    expect(found).toHaveLength(3);
    expect(new Set(found.map((f) => f.emoji)).size).toBe(3);
  });

  test('returns an empty list when nothing matches', () => {
    expect(findPictureWords('Democracy is a form of government.')).toEqual([]);
  });
});
