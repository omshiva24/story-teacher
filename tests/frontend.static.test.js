'use strict';

/**
 * Static checks of the frontend files for accessibility and security rules.
 * They read the files as text, so they run fast with no browser.
 */
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const html = read('index.html');
const appJs = read('app.js');
const css = read('styles.css');

describe('index.html accessibility', () => {
  test('declares the page language', () => {
    expect(html).toMatch(/<html lang="en"/);
  });

  test('has a skip link and a main landmark', () => {
    expect(html).toMatch(/class="skip-link" href="#main"/);
    expect(html).toMatch(/<main id="main"/);
  });

  test('every input has a matching <label for>', () => {
    const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(2);
    ids.forEach((id) => expect(html).toContain(`<label for="${id}"`));
  });

  test('every button declares its type', () => {
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThan(5);
    buttons.forEach((button) => expect(button).toMatch(/\stype="(button|submit)"/));
  });

  test('every image has alt text', () => {
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    images.forEach((img) => expect(img).toMatch(/\salt=/));
  });

  test('loading, errors, game moves and quiz feedback are announced', () => {
    ['status', 'game-status', 'quiz-feedback'].forEach((id) =>
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-live="polite"`)),
    );
    expect(html).toMatch(/id="error"[^>]*role="alert"/);
  });

  test('the quiz uses a fieldset with a legend', () => {
    expect(html).toMatch(/<fieldset>\s*<legend id="quiz-question">/);
  });

  test('the learning steps mark the current step for screen readers', () => {
    expect(appJs).toContain("setAttribute('aria-current', 'step')");
  });
});

describe('styles.css accessibility', () => {
  test('respects reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  test('shows a visible keyboard focus outline', () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline: 3px solid/);
  });

  test('offers three text sizes', () => {
    ['text-md', 'text-lg', 'text-xl'].forEach((size) => expect(css).toContain(`html.${size}`));
  });
});

describe('frontend security', () => {
  test('no inline scripts, inline styles or inline event handlers (strict CSP)', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    scripts.forEach((script) => expect(script).toMatch(/\ssrc="\//));
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son[a-z]+="/i);
  });

  test('never writes HTML from strings (prevents XSS)', () => {
    const code = appJs.replace(/^\s*(\*|\/\/).*$/gm, ''); // ignore comments
    ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval('].forEach((unsafe) =>
      expect(code).not.toContain(unsafe),
    );
  });

  test('external links open safely', () => {
    expect(appJs).toContain("link.rel = 'noopener noreferrer'");
    expect(html).toMatch(/id="topic-photo-link"[^>]*rel="noopener noreferrer"/);
  });

  test('only https Wikimedia images are accepted for topic photos', () => {
    expect(appJs).toContain("image.imageUrl.startsWith('https://upload.wikimedia.org/')");
  });
});

describe('narrator, story video and real media', () => {
  test('the story video is an accessible dialog with captions and labelled controls', () => {
    expect(html).toMatch(/id="theatre"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="th-title"/);
    expect(html).toMatch(/id="th-caption"[^>]*aria-live="polite"/);
    ['th-close', 'th-prev', 'th-next', 'th-play'].forEach((id) => expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-label="`)));
    expect(appJs).toContain("event.key === 'Escape'");
  });

  test('the narrator choice is a pressed-state toggle', () => {
    expect(html).toMatch(/class="narrator-btn" data-voice="female" aria-pressed="true"/);
    expect(html).toMatch(/class="narrator-btn" data-voice="male" aria-pressed="false"/);
  });

  test('animations and videos come only from Wikimedia and wait when motion is reduced', () => {
    expect(appJs).toContain("const MEDIA_HOSTS = ['https://upload.wikimedia.org/', 'https://thumb.wikimedia.org/'];");
    expect(appJs).toContain("reveal.addEventListener('click'");
  });

  test('fonts are served by the app itself', () => {
    expect(css).toContain("src: url('/fonts/baloo2-latin.woff')");
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
  });
});
