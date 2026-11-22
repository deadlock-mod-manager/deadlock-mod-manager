FROM oven/bun:1.4.4 AS builder

WORKDIR /usr/src/app

RUN apt-get -y update && \
    apt-get -y install curl && \
    rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.22.1
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    corepack enable && \
    corepack prepare pnpm@11.18.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.mjs turbo.json ./

COPY packages ./packages
COPY tools ./tools
COPY scripts ./scripts
COPY apps/www ./apps/www
COPY apps/desktop/CHANGELOG.md ./apps/desktop/CHANGELOG.md
COPY .changeset ./.changeset
COPY apps/desktop/public/whats-new ./apps/desktop/public/whats-new

ARG VITE_SERVER_URL=https://api.deadlockmods.app
ARG VITE_AUTH_URL=https://auth.deadlockmods.app
ARG VITE_GA_MEASUREMENT_ID=G-EN5J1SBZ10
ARG VITE_SENTRY_DSN=

ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV VITE_AUTH_URL=${VITE_AUTH_URL}
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @deadlock-mods/www build

FROM oven/bun:1.4.4-slim AS runtime

RUN groupadd -r appuser && useradd -r -g appuser appuser

RUN mkdir -p /usr/src/app && chown appuser:appuser /usr/src/app && \
    mkdir -p /home/appuser/.local/share/pnpm && \
    chown -R appuser:appuser /home/appuser

WORKDIR /usr/src/app

RUN apt-get -y update && \
    apt-get -y install curl && \
    rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.22.1
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    corepack enable && \
    corepack prepare pnpm@11.18.0 --activate

USER appuser

ENV PNPM_HOME="/home/appuser/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY --chown=appuser:appuser package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.mjs turbo.json ./

COPY --chown=appuser:appuser --from=builder /usr/src/app/packages ./packages
COPY --chown=appuser:appuser --from=builder /usr/src/app/tools ./tools
COPY --chown=appuser:appuser --from=builder /usr/src/app/scripts ./scripts
COPY --chown=appuser:appuser --from=builder /usr/src/app/apps/www ./apps/www

RUN pnpm install --frozen-lockfile --prod

ENV PORT=3000
ENV BASE_URL=https://deadlockmods.app
ENV NODE_ENV=production

EXPOSE 3000

WORKDIR /usr/src/app/apps/www

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

ENTRYPOINT [ "pnpm", "start" ]

