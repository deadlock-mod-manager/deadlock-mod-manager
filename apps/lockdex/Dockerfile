FROM oven/bun:1.1.38

WORKDIR /usr/src/app

RUN apt-get -y update && apt-get -y install curl && rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.8.0
RUN curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && \
    bash n $NODE_VERSION && \
    rm n && \
    npm install -g n && \
    npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY packages ./packages
COPY tools ./tools
COPY apps/lockdex ./apps/lockdex

RUN pnpm install

WORKDIR /usr/src/app/apps/lockdex

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD pnpm health-check || exit 1

ENTRYPOINT [ "pnpm",  "start" ]
