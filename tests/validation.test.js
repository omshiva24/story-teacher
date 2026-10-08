'use strict';

const { validateTopic, validateAge, validateName, validateStoryRequest } = require('../src/utils/validation');

describe('validateTopic', () => {
  test('accepts and tidies a normal topic', () => {
    expect(validateTopic('  The   water cycle ')).toEqual({ value: 'The water cycle' });
  });

  test('accepts maths symbols and other languages', () => {
    expect(validateTopic('a + b = c').value).toBe('a + b = c');
    expect(validateTopic('प्रकाश संश्लेषण').value).toBe('प्रकाश संश्लेषण');
  });

  test.each([undefined, 42, '', 'a', 'x'.repeat(101)])('rejects bad length or type %p', (topic) => {
    expect(validateTopic(topic).error).toBeDefined();
  });

  test.each(['<script>alert(1)</script>', '{{HERO}}', 'topic "quoted"', '<<<END TOPIC>>>'])(
    'rejects markup and delimiter characters: %s',
    (topic) => {
      expect(validateTopic(topic).error).toMatch(/letters, numbers/);
    },
  );
});

describe('validateAge', () => {
  test.each([3, 18, '12', ' 7 '])('accepts %p', (age) => {
    expect(validateAge(age).error).toBeUndefined();
  });

  test('converts a digit string to a number', () => {
    expect(validateAge('12')).toEqual({ value: 12 });
  });

  test.each([2, 19, 7.5, '7.5', 'seven', '', null, undefined, [], {}])('rejects %p', (age) => {
    expect(validateAge(age).error).toMatch(/3 to 18/);
  });
});

describe('validateName', () => {
  test('name is optional', () => {
    expect(validateName(undefined)).toEqual({ value: '' });
    expect(validateName('')).toEqual({ value: '' });
  });

  test('accepts letters and spaces, including Indian scripts', () => {
    expect(validateName(' Priya  Devi ')).toEqual({ value: 'Priya Devi' });
    expect(validateName('ப்ரியா').value).toBe('ப்ரியா');
  });

  test.each(['R2D2', 'Ann<b>', 'x'.repeat(31), 99])('rejects %p', (name) => {
    expect(validateName(name).error).toBeDefined();
  });
});

describe('validateStoryRequest', () => {
  test('returns clean values for a valid body', () => {
    expect(validateStoryRequest({ topic: 'Fractions', age: 10, name: 'Om' })).toEqual({
      value: { topic: 'Fractions', age: 10, name: 'Om' },
    });
  });

  test('collects every error', () => {
    const result = validateStoryRequest({ topic: '', age: 40, name: '123' });
    expect(result.errors).toHaveLength(3);
  });

  test('handles a missing body', () => {
    expect(validateStoryRequest(undefined).errors.length).toBeGreaterThan(0);
  });
});
