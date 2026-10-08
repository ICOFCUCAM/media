# Cineforge worker image for DeployPro, which builds the repository-root
# Dockerfile with the root as build context (the worker needs the whole pnpm
# workspace). Same image as apps/worker/Dockerfile (Render, docker-compose);
# apps/worker/src/dockerfiles.test.ts keeps the two in step. EXPOSE is the port
# DeployPro health-checks: the worker answers GET / when PORT is set (health.ts).
#
# DeployPro project: root directory empty, previews OFF (every container of this
# image consumes the production queue).
FROM node:20-bookworm-slim

# ffmpeg → render engine; fonts-dejavu-core → the brand outro line (drawtext);
# openssl/ca-certificates → Prisma engine + HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core openssl ca-certificates && \
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
EXPOSE 8080
CMD ["pnpm", "--filter", "@cineforge/worker", "start"]
