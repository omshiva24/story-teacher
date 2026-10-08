# Small production image for Google Cloud Run.
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies only (uses the lockfile when present).
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && npm cache clean --force

COPY src ./src
COPY public ./public

# Run as the built-in non-root user.
USER node

ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
