FROM oven/bun:1.4.4 AS builder

WORKDIR /usr/src/app

RUN apt-get -y update && \
    apt-get -y install curl build-essential && \
    rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

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
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile

RUN cd packages/vpk-parser && \
    pnpm run generate-types && \
    cd ../..

RUN cd packages/kv-parser && \
    pnpm run generate-types && \
    cd ../..

RUN cd packages/vpk-parser && \
    cargo build --release && \
    cd ../..

RUN cd packages/kv-parser && \
    cargo build --release && \
    cd ../..

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
COPY --chown=appuser:appuser --from=builder /usr/src/app/apps/api ./apps/api

RUN pnpm install --frozen-lockfile --prod

EXPOSE 9000

WORKDIR /usr/src/app/apps/api

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:9000 || exit 1

ENTRYPOINT [ "pnpm", "start" ]
