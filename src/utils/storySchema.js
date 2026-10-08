'use strict';

/**
 * JSON schema sent to Gemini so it replies with structured JSON.
 * Type names match the Gen AI SDK's Type enum values.
 */

const STRING = { type: 'STRING' };

const STORY_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    topicAccepted: { type: 'BOOLEAN' },
    category: STRING,
    title: STRING,
    storyParts: { type: 'ARRAY', items: STRING },
    sceneEmojis: { type: 'ARRAY', items: STRING },
    partVisuals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          layout: { type: 'STRING', enum: ['flow', 'group', 'compare'] },
          caption: STRING,
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { emoji: STRING, label: STRING },
              required: ['emoji', 'label'],
            },
          },
        },
        required: ['layout', 'caption', 'items'],
      },
    },
    wikiTitle: STRING,
    funFact: STRING,
    visual: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['cycle', 'steps', 'parts'] },
        title: STRING,
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { label: STRING, emoji: STRING, detail: STRING },
            required: ['label', 'emoji', 'detail'],
          },
        },
      },
      required: ['type', 'title', 'items'],
    },
    game: {
      type: 'OBJECT',
      properties: {
        instructions: STRING,
        pairs: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { term: STRING, emoji: STRING, match: STRING },
            required: ['term', 'emoji', 'match'],
          },
        },
      },
      required: ['instructions', 'pairs'],
    },
    keyConcepts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: STRING, name: STRING, practiceTip: STRING },
        required: ['id', 'name', 'practiceTip'],
      },
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: STRING,
          conceptId: STRING,
          options: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { text: STRING, emoji: STRING },
              required: ['text'],
            },
          },
          answerIndex: { type: 'INTEGER' },
          explanation: STRING,
        },
        required: ['question', 'conceptId', 'options', 'answerIndex', 'explanation'],
      },
    },
    nextChallenge: STRING,
  },
  required: [
    'topicAccepted',
    'category',
    'title',
    'storyParts',
    'sceneEmojis',
    'partVisuals',
    'wikiTitle',
    'funFact',
    'visual',
    'game',
    'keyConcepts',
    'quiz',
    'nextChallenge',
  ],
  propertyOrdering: [
    'topicAccepted',
    'category',
    'title',
    'storyParts',
    'sceneEmojis',
    'partVisuals',
    'wikiTitle',
    'funFact',
    'visual',
    'game',
    'keyConcepts',
    'quiz',
    'nextChallenge',
  ],
});

module.exports = { STORY_SCHEMA };
