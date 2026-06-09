# Cineforge worker — BullMQ processors + Director/render pipeline.
# Runs apps/worker from source via tsx (workspace packages are consumed as
# source, so no build step is needed). FFmpeg is required by the render engine.
#
# Build from the repo ROOT:  docker build -f apps/worker/Dockerfile -t cineforge-worker .
FROM node:20-bookworm-slim

# ffmpeg → render engine; openssl/ca-certificates → Prisma engine + HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy the workspace and install only the worker's dependency graph
# (`...` pulls in @cineforge/{db,shared,gpu,realtime,model-adapters}); web/api
# are skipped. Dev deps (tsx, prisma) are kept — they're needed at runtime.
COPY . .
RUN pnpm install --frozen-lockfile --filter @cineforge/worker...

# Generate the Prisma client for this platform (reads schema only, no DB).
RUN pnpm --filter @cineforge/db generate

ENV NODE_ENV=production
# main.ts boots the BullMQ processors + the GPU auto-shutdown loop.
CMD ["pnpm", "--filter", "@cineforge/worker", "start"]
