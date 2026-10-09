# Cineforge public API (NestJS) — film generation for API clients, the Voice
# API, admin views, /livez /readyz /metrics. Compiled with tsc (Nest needs the
# decorator metadata) and started through start.cjs.
#
# Build from the repo ROOT:  docker build -f apps/api/Dockerfile -t cineforge-api .
FROM node:20-bookworm-slim

# openssl/ca-certificates → Prisma engine + HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --filter @cineforge/api...
RUN pnpm --filter @cineforge/db generate
RUN pnpm --filter @cineforge/api build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@cineforge/api", "start"]
