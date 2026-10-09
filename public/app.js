/**
 * Story Teacher frontend.
 * Security: all AI text is shown with textContent / SVG text nodes, never innerHTML.
 * Accessibility: focus moves to each new step, live regions announce changes,
 * and every game and quiz action works with a keyboard.
 */
(function () {
  'use strict';

  const { MIN_AGE, MAX_AGE, isSupportedAge, formatAgeLabel, isYoungReader } = window.AgeBands;
  const { buildReport, gameStars } = window.Scoring;

  const REQUEST_TIMEOUT_MS = 75000;
  const TEXT_SIZES = ['md', 'lg', 'xl'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STEPS = ['story', 'visual', 'game', 'quiz', 'report'];

  /** Topic ideas for the "Explore ideas" cards and "Surprise me". */
  const CATEGORIES = [
    { name: 'Space', emoji: '🚀', topics: ['Black holes', 'The solar system', 'Phases of the moon', 'Why stars twinkle', 'Chandrayaan-3 mission'] },
    { name: 'Animals', emoji: '🦁', topics: ['How bees make honey', 'Life cycle of a butterfly', 'How fish breathe', 'Animal habitats', 'Why tigers have stripes'] },
    { name: 'Human body', emoji: '🫀', topics: ['How the heart works', 'Digestion', 'Why we need sleep', 'Teeth and germs', 'How our eyes see'] },
    { name: 'Maths', emoji: '➗', topics: ['Fractions', 'Place value', 'Area and perimeter', 'Probability', 'Pythagoras theorem'] },
    { name: 'Earth & weather', emoji: '🌦️', topics: ['The water cycle', 'Volcanoes', 'How rainbows form', 'The monsoon in India', 'Earthquakes'] },
    { name: 'How things work', emoji: '⚙️', topics: ['How phones work', 'Electricity', 'How planes fly', 'Magnets', 'How the internet works'] },
    { name: 'History & people', emoji: '🏛️', topics: ['APJ Abdul Kalam', 'The Indus Valley Civilisation', 'Ancient Egypt', 'The invention of the wheel', 'Srinivasa Ramanujan'] },
    { name: 'Plants & nature', emoji: '🌱', topics: ['Photosynthesis', 'Seeds and germination', 'Food chains', 'Why leaves change colour', 'Pollination'] },
  ];

  const $ = (id) => document.getElementById(id);

  const els = {
    home: $('home'),
    form: $('story-form'),
    topic: $('topic'),
    age: $('age'),
    name: $('name'),
    ageStage: $('age-stage'),
    createBtn: $('create-btn'),
    surpriseBtn: $('surprise-btn'),
    categoryGrid: $('category-grid'),
    status: $('status'),
    error: $('error'),
    starPill: $('star-pill'),
    starCount: $('star-count'),
    lesson: $('lesson'),
    lessonH1: $('lesson-h1'),
    journey: $('journey'),
    panels: {
      story: $('story-panel'),
      visual: $('visual-panel'),
      game: $('game-panel'),
      quiz: $('quiz-panel'),
      report: $('report-panel'),
    },
    boardItems: $('board-items'),
    boardCaption: $('board-caption'),
    topicPhoto: $('topic-photo'),
    topicPhotoImg: $('topic-photo-img'),
    topicPhotoCaption: $('topic-photo-caption'),
    topicPhotoLink: $('topic-photo-link'),
    storyCategory: $('story-category'),
    storyAge: $('story-age'),
    storyTitle: $('story-title'),
    parentHint: $('parent-hint'),
    partHeading: $('part-heading'),
    storyText: $('story-text'),
    readStoryBtn: $('read-story-btn'),
    nextPartBtn: $('next-part-btn'),
    visualHeading: $('visual-heading'),
    visual: $('visual'),
    funFactBox: $('fun-fact-box'),
    funFact: $('fun-fact'),
    toGameBtn: $('to-game-btn'),
    gameHeading: $('game-heading'),
    gameInstructions: $('game-instructions'),
    gameTerms: $('game-terms'),
    gameMatches: $('game-matches'),
    gameStatus: $('game-status'),
    skipGameBtn: $('skip-game-btn'),
    toQuizBtn: $('to-quiz-btn'),
    quizProgress: $('quiz-progress'),
    qDots: $('q-dots'),
    quizHeading: $('quiz-heading'),
    quizForm: $('quiz-form'),
    quizQuestion: $('quiz-question'),
    quizOptions: $('quiz-options'),
    quizChooseError: $('quiz-choose-error'),
    readQuestionBtn: $('read-question-btn'),
    checkBtn: $('check-btn'),
    feedback: $('quiz-feedback'),
    nextQuestionBtn: $('next-question-btn'),
    reportHeading: $('report-heading'),
    printBtn: $('print-btn'),
    restartBtn: $('restart-btn'),
    confetti: $('confetti'),
  };

  const state = {
    story: null,
    meta: null,
    partIndex: 0,
    questionIndex: 0,
    answers: [],
    stars: { story: 0, game: 0, quiz: 0 },
    totalStars: 0,
    game: null,
  };

  /* ---------- Small helpers ---------- */

  /**
   * Creates an element with optional class and text (always textContent).
   * @param {string} tag
   * @param {{ className?: string, text?: string }} [options]
   * @returns {HTMLElement}
   */
  function createEl(tag, { className, text } = {}) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /**
   * Creates an SVG element with attributes and optional text.
   * @param {string} tag
   * @param {Record<string, string|number>} attrs
   * @param {string} [text]
   * @returns {SVGElement}
   */
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** Returns a shuffled copy (Fisher–Yates). */
  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const starsText = (n) => '⭐'.repeat(n);

  /** Moves keyboard focus to a heading so screen readers announce the new content. */
  function focusHeading(heading) {
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function clearError() {
    els.error.textContent = '';
    els.error.hidden = true;
  }

  /* ---------- Stars and celebration ---------- */

  function addStars(kind, amount) {
    if (amount <= 0) return;
    state.stars[kind] += amount;
    state.totalStars += amount;
    els.starCount.textContent = String(state.totalStars);
    els.starPill.classList.remove('bump');
    void els.starPill.offsetWidth; // restart the animation
    els.starPill.classList.add('bump');
  }

  function celebrate() {
    if (reducedMotion()) return;
    const pieces = Array.from({ length: 60 }, () => {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.animationDelay = `${Math.random() * 0.6}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      return piece;
    });
    els.confetti.replaceChildren(...pieces);
    setTimeout(() => els.confetti.replaceChildren(), 3200);
  }

  /* ---------- Text size ---------- */

  function applyTextSize(size) {
    const safeSize = TEXT_SIZES.includes(size) ? size : 'md';
    TEXT_SIZES.forEach((s) => document.documentElement.classList.remove(`text-${s}`));
    document.documentElement.classList.add(`text-${safeSize}`);
    document.querySelectorAll('.size-btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.size === safeSize));
    });
    try {
      localStorage.setItem('st-text-size', safeSize);
    } catch {
      /* storage may be blocked; the toggle still works for this visit */
    }
  }

  function initTextSize() {
    let saved = 'md';
    try {
      saved = localStorage.getItem('st-text-size') || 'md';
    } catch {
      /* ignore */
    }
    applyTextSize(saved);
    document.querySelectorAll('.size-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyTextSize(btn.dataset.size));
    });
  }

  /* ---------- Read aloud (Web Speech API) ---------- */

  const speech = (function createSpeech() {
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    let activeButton = null;

    function resetButton() {
      if (!activeButton) return;
      activeButton.setAttribute('aria-pressed', 'false');
      activeButton.querySelector('.btn-label').textContent = activeButton.dataset.label;
      activeButton = null;
    }

    function stop() {
      if (supported) window.speechSynthesis.cancel();
      resetButton();
    }

    function toggle(button, text) {
      if (activeButton === button) {
        stop();
        return;
      }
      stop();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.rate = state.meta && isYoungReader(state.meta.age) ? 0.85 : 0.95;
      utterance.onend = resetButton;
      utterance.onerror = resetButton;
      activeButton = button;
      button.setAttribute('aria-pressed', 'true');
      button.querySelector('.btn-label').textContent = 'Stop reading';
      window.speechSynthesis.speak(utterance);
    }

    function init(buttons) {
      buttons.forEach((button) => {
        button.dataset.label = button.querySelector('.btn-label').textContent;
        if (!supported) button.hidden = true;
      });
    }

    return { toggle, stop, init };
  })();

  /* ---------- Home: categories and surprise ---------- */

  function chooseTopic(topic) {
    els.topic.value = topic;
    setFieldError(els.topic, '');
    els.topic.focus({ preventScroll: true });
    els.form.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function renderCategories() {
    const items = CATEGORIES.map((category, index) => {
      const li = document.createElement('li');
      const button = createEl('button', { className: `cat-card cat-${index + 1}` });
      button.type = 'button';
      const emoji = createEl('span', { className: 'cat-emoji', text: category.emoji });
      emoji.setAttribute('aria-hidden', 'true');
      const textWrap = createEl('span');
      textWrap.append(
        createEl('span', { className: 'cat-name', text: category.name }),
        createEl('span', { className: 'cat-sample', text: `e.g. ${category.topics[0]}` }),
      );
      button.append(emoji, textWrap);
      button.setAttribute('aria-label', `${category.name}: pick a topic for me`);
      button.addEventListener('click', () => {
        const options = category.topics.filter((t) => t !== els.topic.value);
        chooseTopic(pick(options));
      });
      li.appendChild(button);
      return li;
    });
    els.categoryGrid.replaceChildren(...items);
  }

  function surprise() {
    const all = CATEGORIES.flatMap((c) => c.topics).filter((t) => t !== els.topic.value);
    chooseTopic(pick(all));
  }

  /* ---------- Form ---------- */

  function updateAgeStage() {
    const age = Number(els.age.value);
    const label = isSupportedAge(age) ? formatAgeLabel(age) : `Ages ${MIN_AGE} to ${MAX_AGE}`;
    els.ageStage.textContent = label;
    els.age.setAttribute('aria-valuetext', label);
  }

  function setFieldError(input, message) {
    const errorEl = $(`${input.id}-error`);
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  /**
   * Client-side checks mirror the server rules for quick feedback.
   * The server still validates everything.
   * @returns {{ topic: string, age: number, name: string } | null}
   */
  function readForm() {
    const topic = els.topic.value.trim().replace(/\s+/g, ' ');
    const age = Number(els.age.value);
    const name = els.name.value.trim().replace(/\s+/g, ' ');

    const topicError = topic.length < 2 || topic.length > 100 ? 'Please type a topic (2 to 100 characters).' : '';
    const ageError = isSupportedAge(age) ? '' : `Please choose an age from ${MIN_AGE} to ${MAX_AGE}.`;
    const nameError = name && !/^[\p{L}\p{M} ]{1,30}$/u.test(name) ? 'Use only letters and spaces (up to 30).' : '';

    setFieldError(els.topic, topicError);
    setFieldError(els.age, ageError);
    setFieldError(els.name, nameError);

    const firstInvalid = [
      [topicError, els.topic],
      [ageError, els.age],
      [nameError, els.name],
    ].find(([error]) => error);
    if (firstInvalid) {
      firstInvalid[1].focus();
      return null;
    }
    return { topic, age, name };
  }

  /**
   * Calls the story API with a timeout.
   * @param {{ topic: string, age: number, name: string }} input
   * @returns {Promise<object>}
   */
  async function requestStory(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data && data.error && data.error.message;
        throw new Error(message || 'Something went wrong. Please try again.');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('The story took too long. Please try again.');
      if (err instanceof TypeError) throw new Error('Could not reach the server. Check your internet and try again.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    clearError();
    const input = readForm();
    if (!input) return;

    els.createBtn.disabled = true;
    els.surpriseBtn.disabled = true;
    setStatus(`Checking facts and writing a story about “${input.topic}” for ${formatAgeLabel(input.age)}… This can take up to 30 seconds.`);

    try {
      const data = await requestStory(input);
      setStatus('');
      startLesson(data);
    } catch (err) {
      setStatus('');
      showError(err.message);
      els.error.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    } finally {
      els.createBtn.disabled = false;
      els.surpriseBtn.disabled = false;
    }
  }

  /* ---------- Lesson navigation ---------- */

  /**
   * Shows one panel and updates the journey stepper.
   * @param {'story'|'visual'|'game'|'quiz'|'report'} step
   */
  function showPanel(step) {
    speech.stop();
    Object.entries(els.panels).forEach(([key, panel]) => {
      panel.hidden = key !== step;
    });
    const current = STEPS.indexOf(step);
    els.journey.querySelectorAll('li').forEach((li) => {
      const index = STEPS.indexOf(li.dataset.step);
      li.classList.toggle('done', index < current && !li.classList.contains('skipped'));
      if (index === current) {
        li.setAttribute('aria-current', 'step');
      } else {
        li.removeAttribute('aria-current');
      }
    });
  }

  function markSkipped(step) {
    const li = els.journey.querySelector(`li[data-step="${step}"]`);
    li.classList.add('skipped');
    li.querySelector('span:last-child').textContent = `${li.querySelector('span:last-child').textContent} (skipped)`;
  }

  function resetJourney() {
    els.journey.querySelectorAll('li').forEach((li) => {
      li.classList.remove('done', 'skipped');
      li.removeAttribute('aria-current');
      const label = li.querySelector('span:last-child');
      label.textContent = label.textContent.replace(' (skipped)', '');
    });
  }

  function startLesson(data) {
    state.story = data.story;
    state.meta = data.meta;
    state.partIndex = 0;
    state.questionIndex = 0;
    state.answers = [];
    state.stars = { story: 0, game: 0, quiz: 0 };
    state.game = null;

    document.body.classList.toggle('young-reader', isYoungReader(data.meta.age));
    els.lessonH1.textContent = `Learning about ${data.meta.topic}`;
    els.storyCategory.textContent = data.story.category;
    els.storyAge.textContent = formatAgeLabel(data.meta.age);
    els.storyTitle.textContent = data.story.title;
    els.parentHint.hidden = data.meta.band.id !== 'early';
    renderTopicPhoto(data.story.topicImage);
    const note = $('fallback-note');
    if (note) {
      note.hidden = !data.meta.fallback;
      note.textContent = data.meta.fallback
        ? `⚡ Quick lesson from ${data.story.category}, built from encyclopedia facts while our AI storyteller is busy.`
        : '';
      note.title = data.meta.fallback ? `Reason: ${data.meta.fallbackReason}` : '';
    }

    resetJourney();
    if (!data.story.visual && !data.story.funFact) markSkipped('visual');
    if (!data.story.game) markSkipped('game');

    els.home.hidden = true;
    els.lesson.hidden = false;
    showPanel('story');
    showPart(0);
    focusHeading(els.storyTitle);
  }

  /* ---------- 1. Story ---------- */

  /**
   * Shows the real topic photo from Wikipedia, if there is a safe one.
   * The image must come from upload.wikimedia.org (also enforced by the CSP).
   * @param {{ imageUrl: string, pageUrl: string, title: string, description: string } | null} image
   */
  function renderTopicPhoto(image) {
    const ok = image && typeof image.imageUrl === 'string' && image.imageUrl.startsWith('https://upload.wikimedia.org/');
    els.topicPhoto.hidden = true;
    if (!ok) return;
    els.topicPhotoImg.onload = () => {
      els.topicPhoto.hidden = false;
    };
    els.topicPhotoImg.onerror = () => {
      els.topicPhoto.hidden = true;
    };
    els.topicPhotoImg.alt = `Photo: ${image.title}${image.description ? `, ${image.description}` : ''}`;
    els.topicPhotoImg.src = image.imageUrl;
    els.topicPhotoCaption.textContent = image.title;
    if (image.pageUrl) {
      els.topicPhotoLink.href = image.pageUrl;
      els.topicPhotoLink.hidden = false;
    } else {
      els.topicPhotoLink.hidden = true;
    }
  }

  /**
   * Draws the diagram for the story part being read: a flow with arrows,
   * a group of things, or two things compared. Tiles pop in one by one.
   * Falls back to the scene emojis when the AI gave no diagram.
   * @param {number} index - Story part index.
   */
  function renderPartBoard(index) {
    const visual = state.story.partVisuals && state.story.partVisuals[index];
    if (!visual) {
      const emoji = createEl('div', { className: 'board-emoji', text: state.story.sceneEmojis[index] || '📖✨' });
      emoji.setAttribute('aria-hidden', 'true');
      els.boardItems.replaceChildren(emoji);
      els.boardCaption.textContent = `Picture for part ${index + 1}`;
      return;
    }
    const list = createEl(visual.layout === 'flow' ? 'ol' : 'ul', { className: `board-items ${visual.layout}` });
    visual.items.forEach((item) => {
      const tile = createEl('li', { className: 'tile' });
      const emoji = createEl('span', { className: 'tile-emoji', text: item.emoji });
      emoji.setAttribute('aria-hidden', 'true');
      tile.append(emoji, createEl('span', { className: 'tile-label', text: item.label }));
      list.appendChild(tile);
    });
    if (visual.layout === 'compare') list.setAttribute('aria-label', `${visual.items[0].label} compared with ${visual.items[1].label}`);
    els.boardItems.replaceChildren(list);
    els.boardCaption.textContent = visual.caption || `Picture for part ${index + 1}`;
  }

  function showPart(index) {
    speech.stop();
    const parts = state.story.storyParts;
    state.partIndex = index;
    renderPartBoard(index);
    els.partHeading.textContent = `Part ${index + 1} of ${parts.length}`;
    els.storyText.textContent = parts[index];
    document.querySelectorAll('.pdot').forEach((dot, i) => dot.classList.toggle('on', i <= index));
    const isLast = index === parts.length - 1;
    els.nextPartBtn.textContent = isLast ? 'I finished the story! ⭐' : 'What happens next?';
  }

  function onNextPart() {
    const isLast = state.partIndex === state.story.storyParts.length - 1;
    if (!isLast) {
      showPart(state.partIndex + 1);
      focusHeading(els.partHeading);
      return;
    }
    addStars('story', 1);
    if (state.story.visual || state.story.funFact) {
      startVisual();
    } else if (state.story.game) {
      startGame();
    } else {
      startQuiz();
    }
  }

  /* ---------- 2. Picture ---------- */

  /**
   * Splits a label into at most two short lines for the SVG.
   * @param {string} text
   * @param {number} max - Characters per line.
   * @returns {string[]}
   */
  function wrapLabel(text, max) {
    const lines = [''];
    text.split(/\s+/).forEach((word) => {
      const last = lines.length - 1;
      if ((lines[last] + ' ' + word).trim().length <= max) {
        lines[last] = (lines[last] + ' ' + word).trim();
      } else {
        lines.push(word);
      }
    });
    const result = lines.filter(Boolean).slice(0, 2);
    if (lines.filter(Boolean).length > 2 || result.some((l) => l.length > max)) {
      result[result.length - 1] = `${result[result.length - 1].slice(0, max - 1)}…`;
    }
    return result;
  }

  /** Card used by every picture type: emoji, label, detail. */
  function buildVisualItem(item, number) {
    const box = createEl('div', { className: 'v-item' });
    if (number) {
      const num = createEl('span', { className: 'v-num', text: String(number) });
      num.setAttribute('aria-hidden', 'true');
      box.appendChild(num);
    }
    const emoji = createEl('span', { className: 'v-emoji', text: item.emoji });
    emoji.setAttribute('aria-hidden', 'true');
    const text = createEl('div');
    text.append(createEl('div', { className: 'v-label', text: item.label }), createEl('div', { className: 'v-detail', text: item.detail }));
    box.append(emoji, text);
    return box;
  }

  /** Draws a looping cycle as SVG, with a text list beside it for screen readers and detail. */
  function renderCycle(visual) {
    const { items } = visual;
    const n = items.length;
    const center = 220;
    const radius = 150;
    const nodeRadius = 46;
    const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const point = (a) => [center + radius * Math.cos(a), center + radius * Math.sin(a)];
    const gap = (nodeRadius + 10) / radius;

    const labels = items.map((item) => item.label);
    const svg = svgEl('svg', { viewBox: '0 0 440 440', class: 'cycle-svg', role: 'img', 'aria-labelledby': 'cycle-svg-title' });
    svg.appendChild(svgEl('title', { id: 'cycle-svg-title' }, `Cycle diagram: ${labels.join(', then ')}, then back to ${labels[0]}.`));

    const defs = svgEl('defs', {});
    const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' }));
    defs.appendChild(marker);
    svg.append(defs, svgEl('circle', { cx: center, cy: center, r: radius, class: 'ring' }));

    for (let i = 0; i < n; i += 1) {
      const [x1, y1] = point(angle(i) + gap);
      const [x2, y2] = point(angle(i + 1) - gap);
      svg.appendChild(svgEl('path', { d: `M${x1.toFixed(1)},${y1.toFixed(1)} A${radius},${radius} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`, class: 'arc', 'marker-end': 'url(#arrow)' }));
    }

    wrapLabel(visual.title, 16).forEach((line, i, all) => {
      svg.appendChild(svgEl('text', { x: center, y: center + (i - (all.length - 1) / 2) * 19, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'center-text' }, line));
    });

    items.forEach((item, i) => {
      const [x, y] = point(angle(i));
      const group = svgEl('g', {});
      group.appendChild(svgEl('circle', { cx: x, cy: y, r: nodeRadius, class: 'node' }));
      group.appendChild(svgEl('text', { x, y: y - 12, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'node-emoji' }, item.emoji));
      wrapLabel(item.label, 12).forEach((line, li) => {
        group.appendChild(svgEl('text', { x, y: y + 14 + li * 13, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'node-label' }, line));
      });
      group.appendChild(svgEl('circle', { cx: x + 34, cy: y - 34, r: 12, class: 'num-bg' }));
      group.appendChild(svgEl('text', { x: x + 34, y: y - 33, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'node-num' }, String(i + 1)));
      svg.appendChild(group);
    });

    const list = createEl('ol', { className: 'step-list cycle-list' });
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.appendChild(buildVisualItem(item, i + 1));
      list.appendChild(li);
    });

    const wrap = createEl('div', { className: 'cycle-wrap' });
    wrap.append(svg, list);
    return wrap;
  }

  /** Steps become a numbered flow; parts become a grid of cards. */
  function renderCards(visual) {
    const isSteps = visual.type === 'steps';
    const list = createEl(isSteps ? 'ol' : 'ul', { className: `step-list ${isSteps ? 'flow' : 'parts'}` });
    visual.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.appendChild(buildVisualItem(item, isSteps ? i + 1 : 0));
      list.appendChild(li);
    });
    return list;
  }

  function startVisual() {
    const { visual, funFact } = state.story;
    els.visualHeading.textContent = visual ? visual.title : 'A fun fact';
    els.visual.replaceChildren(...(visual ? [visual.type === 'cycle' ? renderCycle(visual) : renderCards(visual)] : []));
    els.funFactBox.hidden = !funFact;
    els.funFact.textContent = funFact;
    els.toGameBtn.replaceChildren(document.createTextNode(state.story.game ? 'Play the game ' : 'Take the quiz '), createEl('span', { text: state.story.game ? '🧩' : '✅' }));
    els.toGameBtn.lastChild.setAttribute('aria-hidden', 'true');
    showPanel('visual');
    focusHeading(els.visualHeading);
  }

  function onAfterVisual() {
    if (state.story.game) {
      startGame();
    } else {
      startQuiz();
    }
  }

  /* ---------- 3. Matching game ---------- */

  function buildGameCard(pair, index, side) {
    const li = document.createElement('li');
    const button = createEl('button', { className: `g-card ${side}` });
    button.type = 'button';
    button.dataset.side = side;
    button.dataset.index = String(index);
    button.setAttribute('aria-pressed', 'false');
    if (side === 'term' && pair.emoji) {
      const emoji = createEl('span', { className: 'g-emoji', text: pair.emoji });
      emoji.setAttribute('aria-hidden', 'true');
      button.appendChild(emoji);
    }
    button.appendChild(createEl('span', { text: side === 'term' ? pair.term : pair.match }));
    button.addEventListener('click', () => onGameCard(button));
    li.appendChild(button);
    return li;
  }

  function startGame() {
    const { game } = state.story;
    state.game = { selected: null, matched: 0, tries: 0, done: false, skipped: false, stars: 0 };
    els.gameInstructions.textContent = game.instructions;
    els.gameTerms.replaceChildren(...game.pairs.map((pair, i) => buildGameCard(pair, i, 'term')));
    // Show meanings in a different order from the words.
    let order = shuffle(game.pairs.map((_, i) => i));
    if (order.every((value, i) => value === i)) order = [...order.slice(1), order[0]];
    els.gameMatches.replaceChildren(...order.map((i) => buildGameCard(game.pairs[i], i, 'match')));
    els.gameStatus.textContent = '';
    els.gameStatus.className = 'game-status';
    els.skipGameBtn.hidden = false;
    els.toQuizBtn.hidden = true;
    showPanel('game');
    focusHeading(els.gameHeading);
  }

  function clearGameSelection() {
    document.querySelectorAll('.g-card[aria-pressed="true"]').forEach((card) => card.setAttribute('aria-pressed', 'false'));
    state.game.selected = null;
  }

  function onGameCard(button) {
    const game = state.game;
    if (game.done || button.disabled) return;
    const pairs = state.story.game.pairs;
    const side = button.dataset.side;
    const index = Number(button.dataset.index);

    if (!game.selected || game.selected.side === side) {
      clearGameSelection();
      button.setAttribute('aria-pressed', 'true');
      game.selected = { side, index, button };
      els.gameStatus.className = 'game-status';
      els.gameStatus.textContent =
        side === 'term' ? `You picked “${pairs[index].term}”. Now pick its meaning.` : 'Now pick the matching word.';
      return;
    }

    game.tries += 1;
    const other = game.selected.button;
    if (game.selected.index === index) {
      [button, other].forEach((card) => {
        card.classList.add('matched');
        card.disabled = true;
        card.removeAttribute('aria-pressed');
        card.appendChild(createEl('span', { className: 'sr-only', text: ' (matched)' }));
      });
      game.selected = null;
      game.matched += 1;
      els.gameStatus.textContent = `Great match! ${pairs[index].term}: ${pairs[index].match}.`;
      if (game.matched === pairs.length) finishGame();
    } else {
      [button, other].forEach((card) => {
        card.classList.add('wrong');
        setTimeout(() => card.classList.remove('wrong'), 400);
      });
      clearGameSelection();
      els.gameStatus.textContent = 'Not a match. Try again!';
    }
  }

  function finishGame() {
    const game = state.game;
    const pairs = state.story.game.pairs.length;
    game.done = true;
    game.stars = gameStars(game.tries, pairs);
    addStars('game', game.stars);
    els.gameStatus.className = 'game-status win';
    els.gameStatus.textContent = `You matched all ${pairs} in ${game.tries} tries! ${starsText(game.stars)} ${game.stars} of 3 stars.`;
    els.skipGameBtn.hidden = true;
    els.toQuizBtn.hidden = false;
    els.toQuizBtn.focus();
    if (game.stars === 3) celebrate();
  }

  function skipGame() {
    state.game.skipped = true;
    markSkipped('game');
    startQuiz();
  }

  /* ---------- 4. Quiz ---------- */

  function startQuiz() {
    els.qDots.replaceChildren(...state.story.quiz.map(() => createEl('span', { className: 'q-dot' })));
    showPanel('quiz');
    showQuestion(0);
    focusHeading(els.quizHeading);
  }

  function buildOption(option, index, usePictures) {
    const label = createEl('label', { className: 'option' });
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'answer';
    input.value = String(index);
    label.appendChild(input);
    if (usePictures && option.emoji) {
      const emoji = createEl('span', { className: 'option-emoji', text: option.emoji });
      emoji.setAttribute('aria-hidden', 'true');
      label.appendChild(emoji);
    }
    label.appendChild(createEl('span', { className: 'option-text', text: option.text }));
    return label;
  }

  function showQuestion(index) {
    speech.stop();
    const quiz = state.story.quiz;
    const question = quiz[index];
    const usePictures = state.meta.band.useEmoji;
    state.questionIndex = index;

    els.quizProgress.textContent = `Question ${index + 1} of ${quiz.length}`;
    els.qDots.children[index].classList.add('now');
    els.quizHeading.textContent = `Help ${state.meta.hero}!`;
    els.quizQuestion.textContent = question.question;
    els.quizOptions.replaceChildren(...question.options.map((option, i) => buildOption(option, i, usePictures)));
    els.quizOptions.classList.toggle('picture-options', usePictures);

    els.quizChooseError.hidden = true;
    els.feedback.textContent = '';
    els.feedback.className = 'feedback';
    els.checkBtn.hidden = false;
    els.nextQuestionBtn.hidden = true;
  }

  function markOption(index, className, text) {
    const label = els.quizOptions.children[index];
    label.classList.add(className);
    label.appendChild(createEl('span', { className: 'option-mark', text }));
  }

  function onCheckAnswer(event) {
    event.preventDefault();
    const selected = els.quizForm.querySelector('input[name="answer"]:checked');
    if (!selected) {
      els.quizChooseError.hidden = false;
      els.quizOptions.querySelector('input').focus();
      return;
    }
    els.quizChooseError.hidden = true;

    const question = state.story.quiz[state.questionIndex];
    const chosen = Number(selected.value);
    const isCorrect = chosen === question.answerIndex;
    state.answers[state.questionIndex] = chosen;
    if (isCorrect) addStars('quiz', 1);

    els.quizOptions.querySelectorAll('input').forEach((input) => {
      input.disabled = true;
    });
    // Words plus colour, so the result never depends on colour alone.
    markOption(question.answerIndex, 'is-correct', '✓ Right answer');
    if (!isCorrect) markOption(chosen, 'is-wrong', '✗ Your answer');
    const dot = els.qDots.children[state.questionIndex];
    dot.classList.remove('now');
    dot.classList.add(isCorrect ? 'right' : 'wrong');

    els.feedback.className = `feedback ${isCorrect ? 'correct' : 'wrong'}`;
    els.feedback.replaceChildren(
      createEl('strong', { text: isCorrect ? 'Well done! That is right. ⭐' : "Not quite, and that's okay!" }),
      createEl('span', { text: question.explanation }),
    );

    const isLast = state.questionIndex === state.story.quiz.length - 1;
    els.checkBtn.hidden = true;
    els.nextQuestionBtn.textContent = isLast ? 'See my report' : 'Next question';
    els.nextQuestionBtn.hidden = false;
    els.nextQuestionBtn.focus();
  }

  function onNextQuestion() {
    const isLast = state.questionIndex === state.story.quiz.length - 1;
    if (isLast) {
      showReport();
      return;
    }
    showQuestion(state.questionIndex + 1);
    focusHeading(els.quizHeading);
  }

  function questionSpeechText() {
    const question = state.story.quiz[state.questionIndex];
    const options = question.options.map((option, i) => `Option ${i + 1}: ${option.text}.`).join(' ');
    return `${question.question} ${options}`;
  }

  /* ---------- 5. Report ---------- */

  function fillList(listEl, items, emptyText) {
    const rows = items.length > 0 ? items.map((item) => createEl('li', { text: item.name })) : [createEl('li', { text: emptyText })];
    listEl.replaceChildren(...rows);
  }

  function gameSummary() {
    if (!state.story.game) return 'Not available';
    if (!state.game || state.game.skipped) return 'Skipped';
    return `${starsText(state.game.stars)} ${state.game.stars} of 3 stars (${state.game.tries} tries)`;
  }

  function renderSources(sources) {
    const safe = (sources || []).filter((s) => typeof s.url === 'string' && s.url.startsWith('https://'));
    $('r-sources-box').hidden = safe.length === 0;
    $('r-sources').replaceChildren(
      ...safe.map((source) => {
        const li = document.createElement('li');
        const link = createEl('a', { text: source.title });
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.appendChild(createEl('span', { className: 'sr-only', text: ' (opens in a new tab)' }));
        li.appendChild(link);
        return li;
      }),
    );
  }

  function showReport() {
    const report = buildReport(state.story, state.answers);
    $('r-stars').textContent = `⭐ ${state.totalStars} stars earned`;
    $('r-topic').textContent = state.meta.topic;
    $('r-age').textContent = formatAgeLabel(state.meta.age);
    $('r-score').textContent = `${report.correct} of ${report.total} (${report.percent}%)`;
    $('r-level').textContent = report.level;
    $('r-game').textContent = gameSummary();
    fillList($('r-understood'), report.understood, 'Not yet. Try the story again together.');
    fillList($('r-missed'), report.missed, 'Nothing. Great job!');
    $('r-suggestion').textContent = report.practiceSuggestion;
    renderSources(state.story.sources);
    const sourcesTitle = $('r-sources-title');
    if (sourcesTitle) sourcesTitle.textContent = state.meta.fallback ? 'Facts from' : 'Facts checked with Google Search';
    $('r-date').textContent = `Story: “${state.story.title}” · ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`;

    showPanel('report');
    focusHeading(els.reportHeading);
    if (report.correct === report.total) celebrate();
  }

  function restart() {
    speech.stop();
    state.story = null;
    state.meta = null;
    document.body.classList.remove('young-reader');
    els.lesson.hidden = true;
    els.home.hidden = false;
    els.topic.value = '';
    els.topic.focus();
    window.scrollTo({ top: 0 });
  }

  /* ---------- Wire up ---------- */

  function init() {
    initTextSize();
    speech.init([els.readStoryBtn, els.readQuestionBtn]);
    renderCategories();
    updateAgeStage();

    els.age.addEventListener('input', updateAgeStage);
    els.form.addEventListener('submit', onSubmit);
    els.surpriseBtn.addEventListener('click', surprise);
    els.topic.addEventListener('input', clearError);

    els.readStoryBtn.addEventListener('click', () => speech.toggle(els.readStoryBtn, els.storyText.textContent));
    els.nextPartBtn.addEventListener('click', onNextPart);
    els.toGameBtn.addEventListener('click', onAfterVisual);
    els.skipGameBtn.addEventListener('click', skipGame);
    els.toQuizBtn.addEventListener('click', startQuiz);
    els.quizForm.addEventListener('submit', onCheckAnswer);
    els.readQuestionBtn.addEventListener('click', () => speech.toggle(els.readQuestionBtn, questionSpeechText()));
    els.nextQuestionBtn.addEventListener('click', onNextQuestion);
    els.printBtn.addEventListener('click', () => window.print());
    els.restartBtn.addEventListener('click', restart);
  }

  init();
})();
