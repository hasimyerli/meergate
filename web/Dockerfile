# Web (Next.js) — standalone output. Build context is the REPO ROOT (needs the
# workspace pnpm-lock). Deployed as its own container; talks to the API over HTTP.
#   docker build -f web/Dockerfile .
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY web/package.json ./
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install
COPY web/ .
# Next.js rewrites() are evaluated at BUILD time, so the /api proxy target must
# be baked here. In compose the API is reachable as http://api:3001; local
# `pnpm dev` (unset) falls back to localhost:3001.
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
# Next standalone: server.js + minimal node_modules, plus static/ and public/.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
