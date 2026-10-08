/**
 * Age bands and age-to-school-stage mapping (play school to Class 12, ages 3–18).
 * Defined once and shared by the server (require) and the browser (window.AgeBands).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AgeBands = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_AGE = 3;
  const MAX_AGE = 18;

  /** @type {ReadonlyArray<object>} */
  const BANDS = Object.freeze([
    {
      id: 'early',
      minAge: 3,
      maxAge: 5,
      label: 'Play school, LKG, UKG',
      style:
        'Very short sentences (under 8 words). Simple everyday words. Use animals, toys, family, sounds and colours. Repeat the key idea. Teach ONE idea only. Written to be read aloud by a parent.',
      wordsPerPart: '40-60',
      optionsPerQuestion: 2,
      useEmoji: true,
    },
    {
      id: 'primary',
      minAge: 6,
      maxAge: 8,
      label: 'Class 1 to 3',
      style:
        'Short sentences. Everyday examples from home and school. Introduce simple real terms and explain them inside the story.',
      wordsPerPart: '70-100',
      optionsPerQuestion: 3,
      useEmoji: false,
    },
    {
      id: 'middle',
      minAge: 9,
      maxAge: 11,
      label: 'Class 4 to 6',
      style:
        'More detail. Use the correct terminology. Show cause and effect and answer "why" questions.',
      wordsPerPart: '100-140',
      optionsPerQuestion: 4,
      useEmoji: false,
    },
    {
      id: 'upper',
      minAge: 12,
      maxAge: 14,
      label: 'Class 7 to 9',
      style:
        'Adventure or mystery style. Accurate terms, real-world examples, and simple formulas where relevant.',
      wordsPerPart: '130-170',
      optionsPerQuestion: 4,
      useEmoji: false,
    },
    {
      id: 'senior',
      minAge: 15,
      maxAge: 18,
      label: 'Class 10 to 12',
      style:
        'Smart, mature tone, never childish. Precise terminology, real-world applications, and exam-relevant key points.',
      wordsPerPart: '150-200',
      optionsPerQuestion: 4,
      useEmoji: false,
    },
  ]);

  /**
   * Checks whether a value is a whole-number age the app supports.
   * @param {unknown} age
   * @returns {boolean}
   */
  function isSupportedAge(age) {
    return Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;
  }

  /**
   * Returns the age band for a supported age.
   * @param {number} age
   * @returns {object}
   * @throws {RangeError} When the age is outside 3–18.
   */
  function getBand(age) {
    if (!isSupportedAge(age)) {
      throw new RangeError(`Age must be a whole number from ${MIN_AGE} to ${MAX_AGE}`);
    }
    return BANDS.find((band) => age >= band.minAge && age <= band.maxAge);
  }

  /**
   * Maps an age to an Indian school stage name.
   * @param {number} age
   * @returns {string} e.g. "LKG", "Class 4", "Class 12".
   */
  function getSchoolStage(age) {
    if (!isSupportedAge(age)) {
      throw new RangeError(`Age must be a whole number from ${MIN_AGE} to ${MAX_AGE}`);
    }
    const earlyStages = { 3: 'Play school', 4: 'LKG', 5: 'UKG' };
    if (earlyStages[age]) {
      return earlyStages[age];
    }
    return `Class ${Math.min(age - 5, 12)}`;
  }

  /**
   * Builds the short label shown next to the age input.
   * @param {number} age
   * @returns {string} e.g. "Age 9 · Class 4".
   */
  function formatAgeLabel(age) {
    return `Age ${age} · ${getSchoolStage(age)}`;
  }

  /**
   * Young readers (ages 3–8) get larger default text.
   * @param {number} age
   * @returns {boolean}
   */
  function isYoungReader(age) {
    return isSupportedAge(age) && age <= 8;
  }

  return Object.freeze({
    MIN_AGE,
    MAX_AGE,
    BANDS,
    isSupportedAge,
    getBand,
    getSchoolStage,
    formatAgeLabel,
    isYoungReader,
  });
});
