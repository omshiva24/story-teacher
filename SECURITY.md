# Security policy

Story Teacher is used by children, so safety and privacy come first.

## How the app protects users

| Risk | Protection | Where |
|---|---|---|
| Leaked API key | Key only in server environment variables / Secret Manager; never sent to the browser; `.env` git-ignored | `src/config.js`, `tests/api.test.js` |
| Bad or oversized input | Server-side validation of topic, age and name; 10 kb body limit | `src/utils/validation.js` |
| Unsafe topics | Server-side filter before the AI is called; the AI also rejects unsafe topics | `src/utils/safety.js`, `src/utils/promptBuilder.js` |
| Prompt injection | Topic wrapped in delimiters; delimiter characters rejected; system prompt ignores instructions in the topic; injection phrases blocked | `src/utils/promptBuilder.js`, `src/utils/safety.js` |
| Malformed AI output | Structured JSON, validated and copied field by field | `src/utils/responseValidator.js` |
| Cross-site scripting | No `innerHTML`; strict Content Security Policy (no inline scripts or styles) | `public/app.js`, `src/expressApp.js`, `tests/frontend.static.test.js` |
| Clickjacking, sniffing, unused browser features | `frame-ancestors 'none'`, `X-Content-Type-Options`, `Permissions-Policy` | `src/expressApp.js`, `vercel.json` |
| Abuse | Rate limiting on the API | `src/expressApp.js` |
| Untrusted images and links | Only `https://upload.wikimedia.org` images; links use `rel="noopener noreferrer"` | `src/services/wikiImageService.js` |
| Error details leaking | Friendly messages only; details stay in server logs | `src/middleware/errorHandler.js` |
| Child privacy | No accounts and no child data stored on the server | whole app |

## Reporting a problem

Please open a GitHub issue marked **security**, without sharing exploit details publicly, and we will respond as soon as possible.
