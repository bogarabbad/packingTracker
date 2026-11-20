FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/frontend ./src/frontend
COPY views ./views
COPY public/js ./public/js
RUN mkdir -p public/css \
  && npx tailwindcss -i ./src/frontend/input.css -o ./public/css/styles.css

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY views ./views
COPY public ./public
COPY --from=build /app/public/css/styles.css ./public/css/styles.css

RUN addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
