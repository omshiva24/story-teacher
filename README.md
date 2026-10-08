# 📖 Story Teacher

**Learn anything through a story a child won't want to stop reading, then find out whether it worked.**

Search any topic, the way you would search Google: space, animals, maths, history, famous people, or how phones work. Story Teacher turns it into a story made for the child's age (play school to Class 12), a picture of how it works, a matching game, a quiz told inside the story, and a report for parents and teachers. Facts are checked with Google Search, and the sources are shown in the report.

**Live app:** _add your Cloud Run URL here_
**Repository:** _add your GitHub URL here_

---

## Features

| | Feature | Details |
|---|---|---|
| 🔍 | **Search any topic** | Free-text search, 8 "Explore ideas" worlds (Space, Animals, Human body, Maths, Earth & weather, How things work, History & people, Plants & nature), and a 🎲 Surprise me button |
| 🌐 | **Fact-checked with Google Search** | Gemini 3 uses Google Search grounding while writing; sources are listed in the report. It falls back to a normal call automatically if search is not available |
| 📚 | **Story for their age** | 3 parts with cliffhangers, the child as the hero, and read-aloud |
| 🎬 | **Live picture for every part** | While each part is read, an animated diagram shows what that part explains: a flow with arrows, a group of things, or A vs B |
| 📷 | **Real photo of the topic** | A free Wikipedia photo, credited and linked; only images from upload.wikimedia.org are allowed |
| 🖼️ | **Picture of the topic** | Drawn automatically as a **cycle** diagram (SVG), a numbered **steps** flow, or a **parts** grid, plus a "Did you know?" fact |
| 🧩 | **Matching game** | Match 4 words to their meanings; fewer tries earn more stars |
| ✅ | **Quiz inside the story** | 3 "Help the hero…" questions, each tied to a key idea; picture-word choices for ages 3–5 |
| ⭐ | **Stars and celebration** | Stars for finishing the story, the game and each right answer; confetti for a perfect score |
| 📋 | **Parent/Teacher report** | Topic, age and class, quiz score, understanding level, game result, ideas understood vs needing practice, an activity to try next, sources, and Print |

## Challenge requirement → How the app meets it

| Challenge requirement | How Story Teacher meets it |
|---|---|
| Kids find science and maths boring but love stories | Every topic is taught as a 3-part story (problem → idea → solution) with the child as the hero, plus a picture and a game |
| Teach a school concept | Any school concept, and any other topic a curious child might search, checked with Google Search |
| A topic and a child's age go in, a story comes out | Search box + age slider (3–18); one AI call returns everything |
| …a story a child won't want to stop reading | One part at a time, cliffhangers, scene emojis, read-aloud, stars |
| Find out whether it worked / did the child understand? | Matching game + 3 quiz questions linked to key ideas, scored with kind explanations |
| What makes a story fit a 6-year-old but not a 12-year-old? | Five age bands control words per part, sentence length, terminology, tone and quiz difficulty |
| What would a parent or teacher want to see afterwards? | Printable report: score, understanding level, game result, ideas understood vs to practise, next activity, sources |

## Ages 3–18: five age bands

The challenge does not fix an age range, so the app covers every school stage in India.

| Band | Ages | School stage | How the story changes |
|---|---|---|---|
| Early | 3–5 | Play school, LKG, UKG | Very short sentences, one idea, made for reading aloud; 2 picture-word choices |
| Primary | 6–8 | Class 1–3 | Short sentences, everyday examples, simple real terms; 3 options |
| Middle | 9–11 | Class 4–6 | More detail, correct terms, cause and effect; 4 options |
| Upper | 12–14 | Class 7–9 | Adventure or mystery style, real-world examples, simple formulas; 4 options |
| Senior | 15–18 | Class 10–12 | Mature tone, precise terms, exam-relevant points; 4 options |

## Run locally

Requires Node.js 20 or later and a free Gemini API key from [Google AI Studio](https://aistudio.google.com).

```bash
npm install
cp .env.example .env      # put your GEMINI_API_KEY in .env
npm start                 # http://localhost:8080
```

| Setting | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Your key; server only |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Use `gemini-3.5-flash-lite` for faster, cheaper stories |
| `GEMINI_GROUNDING` | `true` | Fact-check with Google Search; `false` turns it off |
| `AI_TIMEOUT_MS` | `30000` | Time limit for each AI call |
| `RATE_LIMIT_MAX` | `10` | Story requests per minute per visitor |

## Tests

```bash
npm test        # Jest + supertest, with coverage
npm run lint    # ESLint
```

The Gemini SDK is always faked, so tests never call the real API. They cover input validation (including Hindi and Tamil text), the safety filter, age bands and class mapping (4, 7, 10, 13, 16 and the edges 3/18 accepted, 2/19 rejected), the prompt builder, Google Search grounding with fallback and source extraction, AI-response validation (picture and game dropped safely if broken), quiz scoring, game stars, the report, the cache, and the API (200, 400, unsafe topic, injection, 413, 429, 502, 504, security headers, and no API key in pages).

## Security

- The Gemini API key lives only on the server (Secret Manager on Cloud Run) and never reaches the browser. `.env` is git-ignored.
- Server-side validation: topic 2–100 characters of letters (any language), numbers and basic punctuation; age a whole number 3–18; name up to 30 letters.
- A safety filter blocks unsafe topics and prompt-injection phrases **before** the AI is called. The AI is a second layer and rejects unsafe, adult or meaningless topics.
- Prompt-injection defence: the topic is wrapped in delimiters, the system prompt says to treat it only as a topic, and delimiter characters are rejected.
- The AI must return structured JSON; it is validated field by field. A broken picture or game is dropped instead of breaking the story.
- Source links are accepted only if they use `https://`, and they open with `rel="noopener noreferrer"`.
- Topic photos: the AI picks a child-safe Wikipedia article title, which is validated (no colons, slashes or URLs); disambiguation pages are skipped; only `upload.wikimedia.org` images are accepted, and the CSP allows no other image host. If the lookup fails, the story still works.
- `helmet` adds security headers and a strict Content Security Policy (no inline scripts, no framing). Rate limiting and a 10 kb body limit protect the API.
- The frontend renders AI text only with `textContent` and SVG text nodes, never `innerHTML`.
- Friendly error messages only; no child data is stored.

## Efficiency

- **One AI call per story**: story, picture, game, quiz, key ideas and tips come back together.
- **Cache**: 100 entries, 1-hour expiry, keyed by topic + age band; the child's name is added afterwards, so different children share a cached story.
- Pictures are drawn in the browser from small JSON (no image generation), with compression, static caching, AI timeouts and no frontend framework.

## Accessibility (WCAG 2.1 AA)

- Semantic HTML, a label for every input, a skip link, and a heading on every screen.
- Fully keyboard usable: the game uses real buttons with `aria-pressed`; the quiz uses a `fieldset` of radio buttons.
- Focus moves to each new step; `aria-live` regions announce loading, errors, game moves and quiz feedback.
- The step bar uses `aria-current="step"`. The age slider announces "Age 9 · Class 4".
- The cycle diagram has a text description and a full list beside it.
- Text contrast of at least 4.5:1, a text-size toggle, larger story text for ages 3–8, and no colour-only signals.
- `prefers-reduced-motion` turns off animations and confetti. Read-aloud is available for story parts and questions.

## Put it on GitHub

```bash
git init
git add .
git commit -m "Story Teacher"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/story-teacher.git
git push -u origin main
```

Create an empty **public** repository named `story-teacher` on github.com first (without a README). If `git push` asks for a password, use a GitHub personal access token.

## Deploy to Google Cloud Run

Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), run `gcloud auth login`, and make sure billing is on for your project. Then:

```bash
chmod +x deploy.sh
./deploy.sh YOUR_PROJECT_ID
```

The script enables the services, stores your Gemini key in Secret Manager (asked once, hidden), grants access, builds with the Dockerfile and prints the live URL. Redeploy after changes by running it again.

## Deploy to Vercel

The project also runs on Vercel: `index.js` exports the Express app, and `vercel.json` sets a 60-second function limit and the same security headers for static files.

1. Import the GitHub repo in Vercel (no build settings needed).
2. In **Settings → Environment Variables**, add `GEMINI_API_KEY` (mark it **Sensitive**) and `GEMINI_MODEL`.
3. Redeploy.

## Project structure

```
src/
  server.js            start-up only
  app.js               Express app, security middleware, routes
  config.js            settings from environment variables
  routes/              POST /api/story
  services/            Gemini client (search grounding + fallback), Wikipedia photo finder, cache, story service
  middleware/          error handling
  utils/               age bands, validation, safety, prompt builder, schema, response validator, scoring
public/                index.html, styles.css, app.js
tests/                 Jest + supertest
deploy.sh              one-command Cloud Run deploy
```
