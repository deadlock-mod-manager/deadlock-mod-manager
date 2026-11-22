FROM oven/bun:1.4.4 AS builder

WORKDIR /usr/src/app

RUN apt-get -y update && \
    apt-get -y install curl build-essential && \
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
COPY apps/auth ./apps/auth

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @deadlock-mods/auth build

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
COPY --chown=appuser:appuser --from=builder /usr/src/app/apps/auth ./apps/auth

RUN mkdir -p /usr/src/app/apps/auth/dist/client && \
    chown -R appuser:appuser /usr/src/app/apps/auth/dist

RUN pnpm install --frozen-lockfile --prod

EXPOSE 3004

WORKDIR /usr/src/app/apps/auth

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3004/health || exit 1

ENTRYPOINT [ "bun", "run", "start" ]
