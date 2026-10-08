'use strict';

const {
  BANDS,
  MIN_AGE,
  MAX_AGE,
  getBand,
  getSchoolStage,
  formatAgeLabel,
  isSupportedAge,
  isYoungReader,
} = require('../src/utils/ageBands');

describe('age bands', () => {
  test.each([
    [4, 'early'],
    [7, 'primary'],
    [10, 'middle'],
    [13, 'upper'],
    [16, 'senior'],
  ])('age %i belongs to the %s band', (age, bandId) => {
    expect(getBand(age).id).toBe(bandId);
  });

  test('edges 3 and 18 are accepted', () => {
    expect(getBand(3).id).toBe('early');
    expect(getBand(18).id).toBe('senior');
  });

  test.each([2, 19, 7.5, '8', NaN, null])('rejects unsupported age %p', (age) => {
    expect(isSupportedAge(age)).toBe(false);
    expect(() => getBand(age)).toThrow(RangeError);
  });

  test('bands cover every age from 3 to 18 with no gaps or overlaps', () => {
    for (let age = MIN_AGE; age <= MAX_AGE; age += 1) {
      const matches = BANDS.filter((band) => age >= band.minAge && age <= band.maxAge);
      expect(matches).toHaveLength(1);
    }
  });

  test('only the youngest band uses picture choices with 2 options', () => {
    expect(getBand(4)).toMatchObject({ useEmoji: true, optionsPerQuestion: 2 });
    expect(getBand(9).useEmoji).toBe(false);
  });
});

describe('school stage mapping', () => {
  test.each([
    [3, 'Play school'],
    [4, 'LKG'],
    [5, 'UKG'],
    [6, 'Class 1'],
    [9, 'Class 4'],
    [17, 'Class 12'],
    [18, 'Class 12'],
  ])('age %i is %s', (age, stage) => {
    expect(getSchoolStage(age)).toBe(stage);
  });

  test('formats the label shown next to the age', () => {
    expect(formatAgeLabel(9)).toBe('Age 9 · Class 4');
  });

  test('ages 3 to 8 are young readers', () => {
    expect(isYoungReader(3)).toBe(true);
    expect(isYoungReader(8)).toBe(true);
    expect(isYoungReader(9)).toBe(false);
  });

  test('throws for unsupported ages', () => {
    expect(() => getSchoolStage(2)).toThrow(RangeError);
  });
});
