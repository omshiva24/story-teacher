'use strict';

/**
 * A valid AI response, as the mocked Gemini service returns it.
 * @param {object} [overrides]
 * @returns {object}
 */
function makeAiStory(overrides = {}) {
  return {
    topicAccepted: true,
    category: 'Plants',
    title: '{{HERO}} and the Hungry Leaf',
    storyParts: [
      '{{HERO}} saw a sad, droopy plant.',
      'The leaf used sunlight, water and air to make food.',
      '{{HERO}} put the plant in the sun and it grew tall.',
    ],
    sceneEmojis: ['🌱😢', '☀️🍃💧', '🌻😊'],
    partVisuals: [
      {
        layout: 'compare',
        caption: 'A plant in the dark vs a plant in the sun',
        items: [
          { emoji: '🥀', label: 'In the dark' },
          { emoji: '🌻', label: 'In the sun' },
        ],
      },
      {
        layout: 'flow',
        caption: 'Sunlight, water and air become food',
        items: [
          { emoji: '☀️', label: 'Sunlight' },
          { emoji: '💧', label: 'Water' },
          { emoji: '🍃', label: 'Leaf kitchen' },
          { emoji: '🍬', label: 'Plant food' },
        ],
      },
      {
        layout: 'group',
        caption: 'What a happy plant needs',
        items: [
          { emoji: '☀️', label: 'Light' },
          { emoji: '💧', label: 'Water' },
          { emoji: '🌬️', label: 'Air' },
        ],
      },
    ],
    wikiTitle: 'Photosynthesis',
    funFact: 'A big tree can give off enough oxygen for two people each day.',
    visual: {
      type: 'cycle',
      title: 'How a plant makes food',
      items: [
        { label: 'Sunlight', emoji: '☀️', detail: 'Leaves catch the light.' },
        { label: 'Water', emoji: '💧', detail: 'Roots drink water.' },
        { label: 'Air', emoji: '🌬️', detail: 'Leaves take in carbon dioxide.' },
        { label: 'Food', emoji: '🍬', detail: 'The plant makes sugar.' },
      ],
    },
    game: {
      instructions: 'Match each word with what it does.',
      pairs: [
        { term: 'Leaf', emoji: '🍃', match: 'Makes food for the plant' },
        { term: 'Root', emoji: '🌱', match: 'Drinks water from the soil' },
        { term: 'Sun', emoji: '☀️', match: 'Gives light energy' },
        { term: 'Flower', emoji: '🌸', match: 'Makes seeds' },
      ],
    },
    keyConcepts: [
      { id: 'c1', name: 'Plants make food from sunlight', practiceTip: 'Put one plant in the sun and one in a cupboard.' },
      { id: 'c2', name: 'Leaves need water and air', practiceTip: 'Water a plant together every day for a week.' },
    ],
    quiz: [
      {
        question: 'Help {{HERO}}: what do leaves need to make food?',
        conceptId: 'c1',
        options: [{ text: 'Sunlight', emoji: '☀️' }, { text: 'Toys', emoji: '🧸' }],
        answerIndex: 0,
        explanation: 'Leaves use sunlight to make food.',
      },
      {
        question: 'Help {{HERO}}: what should we give the plant?',
        conceptId: 'c2',
        options: [{ text: 'Juice', emoji: '🧃' }, { text: 'Water', emoji: '💧' }],
        answerIndex: 1,
        explanation: 'Plants drink water through their roots.',
      },
      {
        question: 'Help {{HERO}}: where should the plant live?',
        conceptId: 'c1',
        options: [{ text: 'Cupboard', emoji: '🚪' }, { text: 'Window', emoji: '🪟' }],
        answerIndex: 1,
        explanation: 'A sunny window gives the plant light.',
      },
    ],
    nextChallenge: 'Find three leaves of different shapes in the garden.',
    ...overrides,
  };
}

/**
 * What the mocked Gemini client resolves with.
 * @param {object} [overrides] - Story overrides.
 * @param {object[]} [sources] - Google Search sources.
 */
function makeAiResult(overrides = {}, sources = []) {
  return { data: makeAiStory(overrides), sources };
}

module.exports = { makeAiStory, makeAiResult };
